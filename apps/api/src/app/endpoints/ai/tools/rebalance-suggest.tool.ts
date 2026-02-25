import {
  REBALANCE_SUGGEST_INPUT_SCHEMA,
  REBALANCE_SUGGEST_OUTPUT_SCHEMA
} from '@ghostfolio/api/app/endpoints/ai/tools/schemas';
import {
  ToolDefinition,
  ToolExecutionContext,
  ToolJsonSchema
} from '@ghostfolio/api/app/endpoints/ai/tools/tool.types';
import { PortfolioService } from '@ghostfolio/api/app/portfolio/portfolio.service';
import { UserService } from '@ghostfolio/api/app/user/user.service';
import { DEFAULT_CURRENCY } from '@ghostfolio/common/config';

import { Injectable } from '@nestjs/common';

interface RebalanceSuggestInput {
  constraints?: {
    cashReservePct?: number;
    maxTrades?: number;
    maxTurnoverPct?: number;
    minTradeValueInBaseCurrency?: number;
  };
  strategy?: 'custom' | 'equal_weight' | 'market_cap_weight';
  targetAllocations?: {
    symbol: string;
    targetPct: number;
  }[];
}

interface RebalanceSuggestOutput {
  assumptions: string[];
  baseCurrency: string;
  currentAllocations: {
    currentPct: number;
    currentValueInBaseCurrency: number;
    name: string;
    symbol: string;
  }[];
  disclaimers: string[];
  generatedAt: string;
  portfolioValueInBaseCurrency: number;
  strategy: string;
  suggestedTrades: {
    action: 'BUY' | 'SELL';
    currentPct: number;
    driftPct: number;
    name: string;
    quantityEstimate: number;
    symbol: string;
    targetPct: number;
    valueInBaseCurrency: number;
  }[];
  summary: {
    constraintsApplied: string[];
    estimatedTurnoverPct: number;
    totalBuyValueInBaseCurrency: number;
    totalSellValueInBaseCurrency: number;
    totalTradesCount: number;
    tradesLimitedByConstraints: boolean;
  };
  targetAllocations: {
    name: string;
    symbol: string;
    targetPct: number;
    targetValueInBaseCurrency: number;
  }[];
  warnings: {
    code: string;
    message: string;
  }[];
}

interface NormalizedHolding {
  currentPct: number;
  currentValueInBaseCurrency: number;
  marketPrice: number;
  name: string;
  symbol: string;
}

interface ResolvedConstraints {
  cashReservePct: number;
  maxTrades: number;
  maxTurnoverPct: number;
  minTradeValueInBaseCurrency: number;
}

type Strategy = 'custom' | 'equal_weight' | 'market_cap_weight';

const DEFAULT_CONSTRAINTS: ResolvedConstraints = {
  cashReservePct: 0.02,
  maxTrades: 10,
  maxTurnoverPct: 0.2,
  minTradeValueInBaseCurrency: 50
};

const CUSTOM_TARGET_SUM_TOLERANCE = 0.01;
const STRATEGIES: Strategy[] = ['equal_weight', 'market_cap_weight', 'custom'];

@Injectable()
export class RebalanceSuggestTool implements ToolDefinition<
  RebalanceSuggestInput,
  RebalanceSuggestOutput
> {
  public readonly description =
    'Simulate deterministic portfolio rebalancing suggestions with configurable strategy and constraints.';

  public readonly inputSchema: ToolJsonSchema = REBALANCE_SUGGEST_INPUT_SCHEMA;

  public readonly name = 'rebalance_suggest';

  public readonly outputSchema: ToolJsonSchema =
    REBALANCE_SUGGEST_OUTPUT_SCHEMA;

  public constructor(
    private readonly portfolioService: PortfolioService,
    private readonly userService: UserService
  ) {}

  public async execute(
    input: RebalanceSuggestInput,
    context: ToolExecutionContext
  ): Promise<RebalanceSuggestOutput> {
    const strategy = this.resolveStrategy(input.strategy);
    const constraints = this.resolveConstraints(input.constraints);
    const warnings: RebalanceSuggestOutput['warnings'] = [];

    const [portfolioDetails, user] = await Promise.all([
      this.portfolioService.getDetails({
        impersonationId: undefined,
        userId: context.userId,
        withSummary: true
      }),
      this.userService.user({ id: context.userId })
    ]);

    const holdings = Object.values(portfolioDetails.holdings ?? {})
      .map((holding) => ({
        currentPct: 0,
        currentValueInBaseCurrency: holding.valueInBaseCurrency ?? 0,
        marketPrice: holding.marketPrice ?? 0,
        name: holding.name ?? holding.symbol,
        symbol: holding.symbol
      }))
      .sort((holdingA, holdingB) => {
        return (
          holdingB.currentValueInBaseCurrency -
          holdingA.currentValueInBaseCurrency
        );
      });

    const holdingsValueInBaseCurrency = holdings.reduce((sum, holding) => {
      return sum + holding.currentValueInBaseCurrency;
    }, 0);

    const cashInBaseCurrency = portfolioDetails.summary?.cash ?? 0;
    const portfolioValueInBaseCurrency =
      portfolioDetails.summary?.totalValueInBaseCurrency ??
      holdingsValueInBaseCurrency + cashInBaseCurrency;

    for (const holding of holdings) {
      holding.currentPct =
        portfolioValueInBaseCurrency > 0
          ? holding.currentValueInBaseCurrency / portfolioValueInBaseCurrency
          : 0;
    }

    const baseCurrency =
      user?.settings?.settings?.baseCurrency?.toString() ?? DEFAULT_CURRENCY;

    if (holdings.length === 0 || portfolioValueInBaseCurrency <= 0) {
      warnings.push({
        code: 'empty_portfolio',
        message: 'No holdings are available for rebalancing simulation.'
      });

      return this.buildOutput({
        baseCurrency,
        constraints,
        currentAllocations: [],
        portfolioValueInBaseCurrency,
        strategy,
        suggestedTrades: [],
        targetAllocations: [],
        tradesLimitedByConstraints: false,
        warnings
      });
    }

    const investableTargetValue =
      portfolioValueInBaseCurrency * (1 - constraints.cashReservePct);

    const targetValues = this.buildTargetValues({
      currentHoldings: holdings,
      input,
      investableTargetValue,
      strategy,
      warnings
    });

    const targetAllocations = holdings.map((holding) => {
      const targetValueInBaseCurrency =
        targetValues.get(holding.symbol) ?? holding.currentValueInBaseCurrency;

      return {
        name: holding.name,
        symbol: holding.symbol,
        targetPct:
          portfolioValueInBaseCurrency > 0
            ? targetValueInBaseCurrency / portfolioValueInBaseCurrency
            : 0,
        targetValueInBaseCurrency
      };
    });

    let tradesLimitedByConstraints = false;

    const rawTradeCandidates = holdings
      .map((holding) => {
        const targetValueInBaseCurrency =
          targetValues.get(holding.symbol) ??
          holding.currentValueInBaseCurrency;
        const tradeValueSigned =
          targetValueInBaseCurrency - holding.currentValueInBaseCurrency;
        const tradeValueAbsolute = Math.abs(tradeValueSigned);

        if (tradeValueAbsolute <= Number.EPSILON) {
          return null;
        }

        const targetPct =
          portfolioValueInBaseCurrency > 0
            ? targetValueInBaseCurrency / portfolioValueInBaseCurrency
            : 0;

        const quantityEstimate =
          holding.marketPrice > 0
            ? tradeValueAbsolute / holding.marketPrice
            : 0;

        if (holding.marketPrice <= 0) {
          warnings.push({
            code: 'missing_market_price',
            message: `Market price is unavailable for ${holding.symbol}; quantity estimate is 0.`
          });
        }

        return {
          action: tradeValueSigned > 0 ? ('BUY' as const) : ('SELL' as const),
          currentPct: holding.currentPct,
          driftPct: Math.abs(holding.currentPct - targetPct),
          name: holding.name,
          quantityEstimate: Number(quantityEstimate.toFixed(4)),
          symbol: holding.symbol,
          targetPct,
          valueInBaseCurrency: tradeValueAbsolute
        };
      })
      .filter(Boolean)
      .sort((tradeA, tradeB) => {
        if (tradeB.driftPct !== tradeA.driftPct) {
          return tradeB.driftPct - tradeA.driftPct;
        }

        if (tradeB.valueInBaseCurrency !== tradeA.valueInBaseCurrency) {
          return tradeB.valueInBaseCurrency - tradeA.valueInBaseCurrency;
        }

        return tradeA.symbol.localeCompare(tradeB.symbol);
      });

    const minTradeFiltered = rawTradeCandidates.filter((trade) => {
      return (
        trade.valueInBaseCurrency >= constraints.minTradeValueInBaseCurrency
      );
    });

    if (minTradeFiltered.length < rawTradeCandidates.length) {
      tradesLimitedByConstraints = true;
    }

    const maxTradeFiltered = minTradeFiltered.slice(0, constraints.maxTrades);

    if (maxTradeFiltered.length < minTradeFiltered.length) {
      tradesLimitedByConstraints = true;
    }

    const turnoverBudget =
      constraints.maxTurnoverPct * portfolioValueInBaseCurrency;

    let turnoverSoFar = 0;

    const suggestedTrades = maxTradeFiltered.filter((trade) => {
      if (turnoverSoFar + trade.valueInBaseCurrency <= turnoverBudget + 1e-8) {
        turnoverSoFar += trade.valueInBaseCurrency;
        return true;
      }

      tradesLimitedByConstraints = true;
      return false;
    });

    return this.buildOutput({
      baseCurrency,
      constraints,
      currentAllocations: holdings.map((holding) => {
        return {
          currentPct: holding.currentPct,
          currentValueInBaseCurrency: holding.currentValueInBaseCurrency,
          name: holding.name,
          symbol: holding.symbol
        };
      }),
      portfolioValueInBaseCurrency,
      strategy,
      suggestedTrades,
      targetAllocations,
      tradesLimitedByConstraints,
      warnings
    });
  }

  private buildOutput({
    baseCurrency,
    constraints,
    currentAllocations,
    portfolioValueInBaseCurrency,
    strategy,
    suggestedTrades,
    targetAllocations,
    tradesLimitedByConstraints,
    warnings
  }: {
    baseCurrency: string;
    constraints: ResolvedConstraints;
    currentAllocations: RebalanceSuggestOutput['currentAllocations'];
    portfolioValueInBaseCurrency: number;
    strategy: Strategy;
    suggestedTrades: RebalanceSuggestOutput['suggestedTrades'];
    targetAllocations: RebalanceSuggestOutput['targetAllocations'];
    tradesLimitedByConstraints: boolean;
    warnings: RebalanceSuggestOutput['warnings'];
  }): RebalanceSuggestOutput {
    const totalBuyValueInBaseCurrency = suggestedTrades.reduce((sum, trade) => {
      return sum + (trade.action === 'BUY' ? trade.valueInBaseCurrency : 0);
    }, 0);

    const totalSellValueInBaseCurrency = suggestedTrades.reduce(
      (sum, trade) => {
        return sum + (trade.action === 'SELL' ? trade.valueInBaseCurrency : 0);
      },
      0
    );

    const turnover = totalBuyValueInBaseCurrency + totalSellValueInBaseCurrency;

    return {
      assumptions: [
        'Rebalancing uses deterministic target-value math over current holdings.',
        'Custom strategy treats unspecified holdings as unchanged (no forced liquidation).',
        'Constraint filters are applied in order: min trade value, max trades, then turnover cap.'
      ],
      baseCurrency,
      currentAllocations,
      disclaimers: [
        'This is a simulation only. No trades will be executed.',
        'Quantity estimates use cached market prices and may differ from actual execution prices.',
        'Tax implications of suggested trades are not considered.'
      ],
      generatedAt: new Date().toISOString(),
      portfolioValueInBaseCurrency,
      strategy,
      suggestedTrades,
      summary: {
        constraintsApplied: [
          `cashReservePct=${constraints.cashReservePct}`,
          `maxTurnoverPct=${constraints.maxTurnoverPct}`,
          `maxTrades=${constraints.maxTrades}`,
          `minTradeValueInBaseCurrency=${constraints.minTradeValueInBaseCurrency}`
        ],
        estimatedTurnoverPct:
          portfolioValueInBaseCurrency > 0
            ? turnover / portfolioValueInBaseCurrency
            : 0,
        totalBuyValueInBaseCurrency,
        totalSellValueInBaseCurrency,
        totalTradesCount: suggestedTrades.length,
        tradesLimitedByConstraints
      },
      targetAllocations,
      warnings
    };
  }

  private buildTargetValues({
    currentHoldings,
    input,
    investableTargetValue,
    strategy,
    warnings
  }: {
    currentHoldings: NormalizedHolding[];
    input: RebalanceSuggestInput;
    investableTargetValue: number;
    strategy: Strategy;
    warnings: RebalanceSuggestOutput['warnings'];
  }): Map<string, number> {
    const targetValues = new Map<string, number>();

    if (strategy === 'equal_weight') {
      const equalTargetValue =
        currentHoldings.length > 0
          ? investableTargetValue / currentHoldings.length
          : 0;

      for (const holding of currentHoldings) {
        targetValues.set(holding.symbol, equalTargetValue);
      }

      return targetValues;
    }

    if (strategy === 'market_cap_weight') {
      const totalCurrentHoldingValue = currentHoldings.reduce(
        (sum, holding) => {
          return sum + holding.currentValueInBaseCurrency;
        },
        0
      );

      for (const holding of currentHoldings) {
        const relativeWeight =
          totalCurrentHoldingValue > 0
            ? holding.currentValueInBaseCurrency / totalCurrentHoldingValue
            : 0;

        targetValues.set(
          holding.symbol,
          investableTargetValue * relativeWeight
        );
      }

      return targetValues;
    }

    const rawCustomTargets = input.targetAllocations ?? [];

    if (rawCustomTargets.length === 0) {
      warnings.push({
        code: 'custom_target_missing',
        message:
          'Custom strategy requires targetAllocations with at least one symbol.'
      });

      for (const holding of currentHoldings) {
        targetValues.set(holding.symbol, holding.currentValueInBaseCurrency);
      }

      return targetValues;
    }

    const holdingsBySymbolUpper = currentHoldings.reduce(
      (response, holding) => {
        response[holding.symbol.toUpperCase()] = holding;

        return response;
      },
      {} as Record<string, NormalizedHolding>
    );

    const normalizedCustomTargets: {
      symbol: string;
      targetPct: number;
    }[] = [];
    const seenTargetSymbols = new Set<string>();

    for (const customTarget of rawCustomTargets) {
      const symbolUpper = customTarget.symbol?.trim().toUpperCase();

      if (!symbolUpper || seenTargetSymbols.has(symbolUpper)) {
        continue;
      }

      seenTargetSymbols.add(symbolUpper);

      const matchingHolding = holdingsBySymbolUpper[symbolUpper];

      if (!matchingHolding) {
        warnings.push({
          code: 'unknown_target_symbol',
          message: `Custom target symbol ${customTarget.symbol} is not in current holdings and was ignored.`
        });
        continue;
      }

      normalizedCustomTargets.push({
        symbol: matchingHolding.symbol,
        targetPct: customTarget.targetPct
      });
    }

    if (normalizedCustomTargets.length === 0) {
      warnings.push({
        code: 'custom_target_missing',
        message: 'No valid custom target symbols matched current holdings.'
      });

      for (const holding of currentHoldings) {
        targetValues.set(holding.symbol, holding.currentValueInBaseCurrency);
      }

      return targetValues;
    }

    const targetPctSum = normalizedCustomTargets.reduce((sum, target) => {
      return sum + target.targetPct;
    }, 0);

    if (Math.abs(targetPctSum - 1) > CUSTOM_TARGET_SUM_TOLERANCE) {
      warnings.push({
        code: 'custom_target_invalid_sum',
        message: 'Custom target allocations must sum to 1.00 (±0.01 tolerance).'
      });

      for (const holding of currentHoldings) {
        targetValues.set(holding.symbol, holding.currentValueInBaseCurrency);
      }

      return targetValues;
    }

    const managedSymbolSet = new Set(
      normalizedCustomTargets.map((target) => target.symbol)
    );

    let lockedValue = 0;

    for (const holding of currentHoldings) {
      if (!managedSymbolSet.has(holding.symbol)) {
        lockedValue += holding.currentValueInBaseCurrency;
        targetValues.set(holding.symbol, holding.currentValueInBaseCurrency);
      }
    }

    const managedTargetBudget = Math.max(
      0,
      investableTargetValue - lockedValue
    );

    if (managedTargetBudget <= 0 && managedSymbolSet.size > 0) {
      warnings.push({
        code: 'locked_positions_exceed_budget',
        message:
          'Unmanaged holdings already consume the investable budget; managed targets were reduced to zero.'
      });
    }

    for (const customTarget of normalizedCustomTargets) {
      targetValues.set(
        customTarget.symbol,
        managedTargetBudget * (customTarget.targetPct / targetPctSum)
      );
    }

    return targetValues;
  }

  private resolveConstraints(
    inputConstraints: RebalanceSuggestInput['constraints']
  ): ResolvedConstraints {
    return {
      cashReservePct: this.clamp(
        inputConstraints?.cashReservePct,
        0,
        1,
        DEFAULT_CONSTRAINTS.cashReservePct
      ),
      maxTrades: this.clamp(
        inputConstraints?.maxTrades,
        0,
        1000,
        DEFAULT_CONSTRAINTS.maxTrades
      ),
      maxTurnoverPct: this.clamp(
        inputConstraints?.maxTurnoverPct,
        0,
        1,
        DEFAULT_CONSTRAINTS.maxTurnoverPct
      ),
      minTradeValueInBaseCurrency: this.clamp(
        inputConstraints?.minTradeValueInBaseCurrency,
        0,
        Number.MAX_SAFE_INTEGER,
        DEFAULT_CONSTRAINTS.minTradeValueInBaseCurrency
      )
    };
  }

  private resolveStrategy(
    strategy?: RebalanceSuggestInput['strategy']
  ): Strategy {
    if (strategy && STRATEGIES.includes(strategy)) {
      return strategy;
    }

    return 'equal_weight';
  }

  private clamp(
    value: number | undefined,
    minimum: number,
    maximum: number,
    fallback: number
  ) {
    if (!Number.isFinite(value)) {
      return fallback;
    }

    return Math.max(minimum, Math.min(maximum, value));
  }
}
