import {
  SIMULATE_TRADES_INPUT_SCHEMA,
  SIMULATE_TRADES_OUTPUT_SCHEMA
} from '@ghostfolio/api/app/endpoints/ai/tools/schemas';
import {
  ToolDefinition,
  ToolExecutionContext,
  ToolJsonSchema,
  ToolResultEnvelope
} from '@ghostfolio/api/app/endpoints/ai/tools/tool.types';
import { PortfolioService } from '@ghostfolio/api/app/portfolio/portfolio.service';
import { UserService } from '@ghostfolio/api/app/user/user.service';
import { DEFAULT_CURRENCY } from '@ghostfolio/common/config';

import { Injectable } from '@nestjs/common';

interface TradeIntent {
  action: 'buy' | 'sell';
  fractionOfPosition?: number;
  notionalUsd?: number;
  price?: number;
  quantity?: number;
  symbol: string;
}

interface SimulateTradesInput {
  trades: TradeIntent[];
}

interface TradeWarning {
  code: string;
  message: string;
}

interface TradeResult {
  acceptedQuantity: number;
  action: string;
  costInBaseCurrency: number;
  priceUsed: number;
  requestedQuantity: number;
  status: 'capped' | 'executed' | 'skipped';
  symbol: string;
  warnings: TradeWarning[];
}

interface PortfolioPosition {
  allocationPct: number;
  symbol: string;
  valueInBaseCurrency: number;
}

interface PortfolioSnapshot {
  cashBalance: number;
  positions: PortfolioPosition[];
  totalValueInBaseCurrency: number;
}

interface SimulateTradesOutput {
  disclaimers: string[];
  hypotheticalPortfolio: PortfolioSnapshot;
  impact: {
    allocationChanges: {
      changePct: number;
      currentPct: number;
      newPct: number;
      symbol: string;
    }[];
    cashDelta: number;
    concentrationWarnings: string[];
    totalValueChangeInBaseCurrency: number;
  };
  portfolioBefore: PortfolioSnapshot;
  status: 'partial' | 'success';
  tradeResults: TradeResult[];
  warnings: TradeWarning[];
}

const CONCENTRATION_THRESHOLD = 0.35;

const DISCLAIMERS = [
  'Simulation only; does not execute trades.',
  'Prices based on latest known holdings prices; may be stale.'
];

@Injectable()
export class SimulateTradesTool implements ToolDefinition<
  SimulateTradesInput,
  SimulateTradesOutput
> {
  public readonly description =
    'Simulate what-if trades against current portfolio to preview impact on allocations, value, and concentration without executing real trades. Supports quantity (shares), notionalUsd (dollar amount), or fractionOfPosition (0–1, e.g. 0.5 = sell half).';

  public readonly inputSchema: ToolJsonSchema = SIMULATE_TRADES_INPUT_SCHEMA;

  public readonly name = 'simulate_trades';

  public readonly outputSchema: ToolJsonSchema = SIMULATE_TRADES_OUTPUT_SCHEMA;

  public constructor(
    private readonly portfolioService: PortfolioService,
    private readonly userService: UserService
  ) {}

  public async execute(
    input: SimulateTradesInput,
    context: ToolExecutionContext
  ): Promise<ToolResultEnvelope<SimulateTradesOutput>> {
    const [portfolioDetails, user] = await Promise.all([
      this.portfolioService.getDetails({
        impersonationId: undefined,
        userId: context.userId,
        withSummary: true
      }),
      this.userService.user({ id: context.userId })
    ]);

    const baseCurrency =
      user?.settings?.settings?.baseCurrency?.toString() ?? DEFAULT_CURRENCY;

    // Compute total position value (excluding cash) for consistent before/after comparison
    const totalPositionValueBefore = Object.values(
      portfolioDetails.holdings ?? {}
    ).reduce((sum, h) => sum + (h.valueInBaseCurrency ?? 0), 0);

    const cashBefore = portfolioDetails.summary?.cash ?? 0;

    // Build positions map
    const holdingsMap = new Map<
      string,
      {
        marketPrice: number;
        quantity: number;
        valueInBaseCurrency: number;
      }
    >();

    for (const holding of Object.values(portfolioDetails.holdings ?? {})) {
      holdingsMap.set(holding.symbol, {
        marketPrice: holding.marketPrice ?? 0,
        quantity: holding.quantity ?? 0,
        valueInBaseCurrency: holding.valueInBaseCurrency ?? 0
      });
    }

    // Build before positions
    const positionsBefore: PortfolioPosition[] = [];
    for (const [symbol, h] of holdingsMap) {
      positionsBefore.push({
        allocationPct:
          totalPositionValueBefore > 0
            ? h.valueInBaseCurrency / totalPositionValueBefore
            : 0,
        symbol,
        valueInBaseCurrency: h.valueInBaseCurrency
      });
    }

    // Hypothetical positions map (symbol -> value)
    const hypotheticalValues = new Map<string, number>();
    for (const [symbol, h] of holdingsMap) {
      hypotheticalValues.set(symbol, h.valueInBaseCurrency);
    }

    let cashAfter = cashBefore;
    const tradeResults: TradeResult[] = [];
    const globalWarnings: TradeWarning[] = [];

    for (const trade of input.trades) {
      const existing = holdingsMap.get(trade.symbol);
      const tradeWarnings: TradeWarning[] = [];

      // Resolve price
      const price = trade.price ?? existing?.marketPrice ?? 0;

      if (price <= 0) {
        tradeResults.push({
          acceptedQuantity: 0,
          action: trade.action,
          costInBaseCurrency: 0,
          priceUsed: 0,
          requestedQuantity: trade.quantity ?? 0,
          status: 'skipped',
          symbol: trade.symbol,
          warnings: [
            {
              code: 'no_price_available',
              message: `No price available for ${trade.symbol}. Provide an explicit price.`
            }
          ]
        });
        continue;
      }

      // Resolve quantity from flexible input (precedence: quantity > notionalUsd > fractionOfPosition)
      let requestedQuantity = 0;

      if (trade.quantity != null && trade.quantity > 0) {
        requestedQuantity = trade.quantity;
      } else if (trade.notionalUsd != null && trade.notionalUsd > 0) {
        requestedQuantity = trade.notionalUsd / price;
      } else if (
        trade.fractionOfPosition != null &&
        trade.fractionOfPosition > 0
      ) {
        const currentQuantity = existing?.quantity ?? 0;
        requestedQuantity = currentQuantity * trade.fractionOfPosition;
      }

      if (requestedQuantity <= 0) {
        tradeResults.push({
          acceptedQuantity: 0,
          action: trade.action,
          costInBaseCurrency: 0,
          priceUsed: price,
          requestedQuantity: 0,
          status: 'skipped',
          symbol: trade.symbol,
          warnings: [
            {
              code: 'zero_quantity',
              message: `Could not resolve a positive quantity for ${trade.symbol}.`
            }
          ]
        });
        continue;
      }

      let acceptedQuantity = requestedQuantity;
      let tradeStatus: 'capped' | 'executed' = 'executed';

      // Validate sells
      if (trade.action === 'sell') {
        const currentQuantity = existing?.quantity ?? 0;

        if (acceptedQuantity > currentQuantity) {
          acceptedQuantity = currentQuantity;
          tradeStatus = 'capped';
          tradeWarnings.push({
            code: 'quantity_capped',
            message: `Sell quantity for ${trade.symbol} capped at available ${currentQuantity} (requested ${requestedQuantity}).`
          });
        }
      }

      const cost = acceptedQuantity * price;

      // Apply trade to hypothetical portfolio
      const currentValue = hypotheticalValues.get(trade.symbol) ?? 0;

      if (trade.action === 'buy') {
        hypotheticalValues.set(trade.symbol, currentValue + cost);
        cashAfter -= cost;
      } else {
        hypotheticalValues.set(trade.symbol, Math.max(0, currentValue - cost));
        cashAfter += cost;
      }

      tradeResults.push({
        acceptedQuantity,
        action: trade.action,
        costInBaseCurrency: cost,
        priceUsed: price,
        requestedQuantity,
        status: tradeStatus,
        symbol: trade.symbol,
        warnings: tradeWarnings
      });
    }

    // Build hypothetical portfolio
    const hypotheticalPositions: PortfolioPosition[] = [];
    let totalValueAfter = 0;

    for (const [symbol, value] of hypotheticalValues) {
      if (value > 0) {
        totalValueAfter += value;
        hypotheticalPositions.push({
          allocationPct: 0, // computed below
          symbol,
          valueInBaseCurrency: value
        });
      }
    }

    // Add positions for new symbols from buy trades
    // (already handled above via hypotheticalValues.set)

    // Compute allocations
    for (const pos of hypotheticalPositions) {
      pos.allocationPct =
        totalValueAfter > 0 ? pos.valueInBaseCurrency / totalValueAfter : 0;
    }

    // Sort by value descending
    hypotheticalPositions.sort(
      (a, b) => b.valueInBaseCurrency - a.valueInBaseCurrency
    );

    // Concentration warnings
    const concentrationWarnings: string[] = [];

    for (const pos of hypotheticalPositions) {
      if (pos.allocationPct > CONCENTRATION_THRESHOLD) {
        concentrationWarnings.push(
          `${pos.symbol} would be ${(pos.allocationPct * 100).toFixed(1)}% of portfolio (threshold: ${(CONCENTRATION_THRESHOLD * 100).toFixed(0)}%).`
        );
      }
    }

    // Allocation changes
    const allSymbols = new Set<string>();

    for (const p of positionsBefore) {
      allSymbols.add(p.symbol);
    }

    for (const p of hypotheticalPositions) {
      allSymbols.add(p.symbol);
    }

    const allocationChanges = Array.from(allSymbols).map((symbol) => {
      const before = positionsBefore.find((p) => p.symbol === symbol);
      const after = hypotheticalPositions.find((p) => p.symbol === symbol);
      const currentPct = before?.allocationPct ?? 0;
      const newPct = after?.allocationPct ?? 0;

      return {
        changePct: newPct - currentPct,
        currentPct,
        newPct,
        symbol
      };
    });

    // Check if cash went negative
    let status: 'partial' | 'success' = 'success';

    if (cashAfter < 0) {
      status = 'partial';
      globalWarnings.push({
        code: 'insufficient_cash_assumed_margin',
        message: `Cash balance would be ${baseCurrency} ${cashAfter.toFixed(2)} after trades. This assumes margin or external funding.`
      });
    }

    const output: SimulateTradesOutput = {
      disclaimers: DISCLAIMERS,
      hypotheticalPortfolio: {
        cashBalance: cashAfter,
        positions: hypotheticalPositions,
        totalValueInBaseCurrency: totalValueAfter
      },
      impact: {
        allocationChanges,
        cashDelta: cashAfter - cashBefore,
        concentrationWarnings,
        totalValueChangeInBaseCurrency:
          totalValueAfter - totalPositionValueBefore
      },
      portfolioBefore: {
        cashBalance: cashBefore,
        positions: positionsBefore.sort(
          (a, b) => b.valueInBaseCurrency - a.valueInBaseCurrency
        ),
        totalValueInBaseCurrency: totalPositionValueBefore
      },
      status,
      tradeResults,
      warnings: globalWarnings
    };

    return { data: output, status };
  }
}
