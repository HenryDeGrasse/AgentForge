import {
  ToolDefinition,
  ToolExecutionContext,
  ToolJsonSchema
} from '@ghostfolio/api/app/endpoints/ai/tools/tool.types';
import { PortfolioService } from '@ghostfolio/api/app/portfolio/portfolio.service';
import { UserService } from '@ghostfolio/api/app/user/user.service';
import { DEFAULT_CURRENCY } from '@ghostfolio/common/config';

import { Injectable } from '@nestjs/common';

interface ComplianceCheckInput {
  rules?: {
    maxAssetClassPct?: number;
    maxCashPct?: number;
    maxSectorPct?: number;
    maxSinglePositionPct?: number;
    maxTop3Pct?: number;
    minHoldingsCount?: number;
    restrictedAssetClasses?: string[];
    restrictedSymbols?: string[];
  };
}

interface ComplianceRuleResult {
  currentValue: number;
  description: string;
  details: string;
  ruleId: string;
  ruleName: string;
  status: 'fail' | 'pass' | 'skip' | 'warn';
  threshold: number;
}

interface ComplianceCheckOutput {
  assumptions: string[];
  baseCurrency: string;
  generatedAt: string;
  holdingsCount: number;
  overallStatus: 'COMPLIANT' | 'NEEDS_REVIEW' | 'NON_COMPLIANT';
  portfolioValueInBaseCurrency: number;
  results: ComplianceRuleResult[];
  rulesChecked: number;
  rulesFailed: number;
  rulesPassed: number;
  warnings: {
    code: string;
    message: string;
  }[];
}

interface ResolvedRules {
  maxAssetClassPct: number;
  maxCashPct: number;
  maxSectorPct: number;
  maxSinglePositionPct: number;
  maxTop3Pct: number;
  minHoldingsCount: number;
  restrictedAssetClasses: string[];
  restrictedSymbols: string[];
}

const DEFAULT_RULES: ResolvedRules = {
  maxAssetClassPct: 0.8,
  maxCashPct: 0.3,
  maxSectorPct: 0.4,
  maxSinglePositionPct: 0.25,
  maxTop3Pct: 0.65,
  minHoldingsCount: 5,
  restrictedAssetClasses: [],
  restrictedSymbols: []
};

@Injectable()
export class ComplianceCheckTool implements ToolDefinition<
  ComplianceCheckInput,
  ComplianceCheckOutput
> {
  public readonly description =
    'Run deterministic policy and compliance checks on concentration, diversification and restrictions.';

  public readonly inputSchema: ToolJsonSchema = {
    additionalProperties: false,
    properties: {
      rules: {
        additionalProperties: false,
        properties: {
          maxAssetClassPct: {
            maximum: 1,
            minimum: 0,
            type: 'number'
          },
          maxCashPct: {
            maximum: 1,
            minimum: 0,
            type: 'number'
          },
          maxSectorPct: {
            maximum: 1,
            minimum: 0,
            type: 'number'
          },
          maxSinglePositionPct: {
            maximum: 1,
            minimum: 0,
            type: 'number'
          },
          maxTop3Pct: {
            maximum: 1,
            minimum: 0,
            type: 'number'
          },
          minHoldingsCount: {
            maximum: 1000,
            minimum: 0,
            type: 'number'
          },
          restrictedAssetClasses: {
            items: {
              type: 'string'
            },
            type: 'array'
          },
          restrictedSymbols: {
            items: {
              type: 'string'
            },
            type: 'array'
          }
        },
        type: 'object'
      }
    },
    type: 'object'
  };

  public readonly name = 'compliance_check';

  public readonly outputSchema: ToolJsonSchema = {
    additionalProperties: false,
    properties: {
      assumptions: {
        items: {
          type: 'string'
        },
        type: 'array'
      },
      baseCurrency: {
        type: 'string'
      },
      generatedAt: {
        type: 'string'
      },
      holdingsCount: {
        type: 'number'
      },
      overallStatus: {
        enum: ['COMPLIANT', 'NON_COMPLIANT', 'NEEDS_REVIEW'],
        type: 'string'
      },
      portfolioValueInBaseCurrency: {
        type: 'number'
      },
      results: {
        items: {
          additionalProperties: false,
          properties: {
            currentValue: {
              type: 'number'
            },
            description: {
              type: 'string'
            },
            details: {
              type: 'string'
            },
            ruleId: {
              type: 'string'
            },
            ruleName: {
              type: 'string'
            },
            status: {
              enum: ['pass', 'fail', 'warn', 'skip'],
              type: 'string'
            },
            threshold: {
              type: 'number'
            }
          },
          required: [
            'currentValue',
            'description',
            'details',
            'ruleId',
            'ruleName',
            'status',
            'threshold'
          ],
          type: 'object'
        },
        type: 'array'
      },
      rulesChecked: {
        type: 'number'
      },
      rulesFailed: {
        type: 'number'
      },
      rulesPassed: {
        type: 'number'
      },
      warnings: {
        items: {
          additionalProperties: false,
          properties: {
            code: {
              type: 'string'
            },
            message: {
              type: 'string'
            }
          },
          required: ['code', 'message'],
          type: 'object'
        },
        type: 'array'
      }
    },
    required: [
      'assumptions',
      'baseCurrency',
      'generatedAt',
      'holdingsCount',
      'overallStatus',
      'portfolioValueInBaseCurrency',
      'results',
      'rulesChecked',
      'rulesFailed',
      'rulesPassed',
      'warnings'
    ],
    type: 'object'
  };

  public constructor(
    private readonly portfolioService: PortfolioService,
    private readonly userService: UserService
  ) {}

  public async execute(
    input: ComplianceCheckInput,
    context: ToolExecutionContext
  ): Promise<ComplianceCheckOutput> {
    const rules = this.resolveRules(input.rules);

    const [portfolioDetails, user] = await Promise.all([
      this.portfolioService.getDetails({
        impersonationId: undefined,
        userId: context.userId,
        withSummary: true
      }),
      this.userService.user({ id: context.userId })
    ]);

    const holdings = Object.values(portfolioDetails.holdings ?? {}).map(
      (holding) => ({
        allocationInPortfolio: 0,
        assetClass: (holding.assetClass ?? 'UNKNOWN').toString(),
        name: holding.name ?? holding.symbol,
        sectors: holding.sectors ?? [],
        symbol: holding.symbol,
        valueInBaseCurrency: holding.valueInBaseCurrency ?? 0
      })
    );

    const holdingsValueInBaseCurrency = holdings.reduce((sum, holding) => {
      return sum + holding.valueInBaseCurrency;
    }, 0);

    const cashInBaseCurrency = portfolioDetails.summary?.cash ?? 0;
    const portfolioValueInBaseCurrency =
      portfolioDetails.summary?.totalValueInBaseCurrency ??
      holdingsValueInBaseCurrency + cashInBaseCurrency;

    for (const holding of holdings) {
      holding.allocationInPortfolio =
        portfolioValueInBaseCurrency > 0
          ? holding.valueInBaseCurrency / portfolioValueInBaseCurrency
          : 0;
    }

    holdings.sort((holdingA, holdingB) => {
      return holdingB.allocationInPortfolio - holdingA.allocationInPortfolio;
    });

    const holdingsCount = holdings.length;
    const warnings: ComplianceCheckOutput['warnings'] = [];

    if (holdingsCount === 0) {
      warnings.push({
        code: 'empty_portfolio',
        message:
          'No holdings are available; concentration and diversification checks are limited.'
      });
    }

    const { maxAssetClassExposure, maxAssetClassName } =
      this.getMaxAssetClassExposure(holdings);

    const {
      maxSectorExposure,
      maxSectorName,
      sectorCoverageInPortfolio,
      hasSectorData
    } = this.getMaxSectorExposure(holdings);

    if (holdingsCount > 0 && sectorCoverageInPortfolio < 0.5) {
      warnings.push({
        code: 'limited_sector_metadata',
        message:
          'Sector metadata covers less than 50% of portfolio allocation; sector checks may be incomplete.'
      });
    }

    const top3Allocation = holdings.slice(0, 3).reduce((sum, holding) => {
      return sum + holding.allocationInPortfolio;
    }, 0);

    const maxSingleAllocation = holdings[0]?.allocationInPortfolio ?? 0;
    const cashAllocation =
      portfolioValueInBaseCurrency > 0
        ? cashInBaseCurrency / portfolioValueInBaseCurrency
        : 0;

    const restrictedSymbolSet = new Set(
      rules.restrictedSymbols.map((symbol) => symbol.toUpperCase())
    );
    const restrictedAssetClassSet = new Set(
      rules.restrictedAssetClasses.map((assetClass) => assetClass.toUpperCase())
    );

    const matchedRestrictedSymbols = holdings
      .map((holding) => holding.symbol.toUpperCase())
      .filter((symbol) => restrictedSymbolSet.has(symbol));

    const matchedRestrictedAssetClasses = holdings
      .map((holding) => holding.assetClass.toUpperCase())
      .filter((assetClass) => restrictedAssetClassSet.has(assetClass));

    const results: ComplianceRuleResult[] = [
      holdingsCount === 0
        ? this.buildRuleResult({
            currentValue: 0,
            description:
              'No single position should exceed the configured maximum allocation.',
            details: 'Skipped because portfolio has no holdings.',
            ruleId: 'max_single_position',
            ruleName: 'Max Single Position',
            status: 'skip',
            threshold: rules.maxSinglePositionPct
          })
        : this.buildPassFailRule({
            currentValue: maxSingleAllocation,
            description:
              'No single position should exceed the configured maximum allocation.',
            details: `Largest position allocation is ${(maxSingleAllocation * 100).toFixed(2)}%.`,
            isPassing: maxSingleAllocation <= rules.maxSinglePositionPct,
            ruleId: 'max_single_position',
            ruleName: 'Max Single Position',
            threshold: rules.maxSinglePositionPct
          }),
      holdingsCount === 0
        ? this.buildRuleResult({
            currentValue: 0,
            description:
              'Top 3 holdings should remain below the configured concentration limit.',
            details: 'Skipped because portfolio has no holdings.',
            ruleId: 'max_top3_concentration',
            ruleName: 'Max Top-3 Concentration',
            status: 'skip',
            threshold: rules.maxTop3Pct
          })
        : this.buildPassFailRule({
            currentValue: top3Allocation,
            description:
              'Top 3 holdings should remain below the configured concentration limit.',
            details: `Top-3 concentration is ${(top3Allocation * 100).toFixed(2)}%.`,
            isPassing: top3Allocation <= rules.maxTop3Pct,
            ruleId: 'max_top3_concentration',
            ruleName: 'Max Top-3 Concentration',
            threshold: rules.maxTop3Pct
          }),
      holdingsCount === 0
        ? this.buildRuleResult({
            currentValue: 0,
            description:
              'No single sector should exceed the configured concentration threshold.',
            details: 'Skipped because portfolio has no holdings.',
            ruleId: 'max_sector_concentration',
            ruleName: 'Max Sector Concentration',
            status: 'skip',
            threshold: rules.maxSectorPct
          })
        : !hasSectorData
          ? this.buildRuleResult({
              currentValue: 0,
              description:
                'No single sector should exceed the configured concentration threshold.',
              details: 'No sector metadata available for current holdings.',
              ruleId: 'max_sector_concentration',
              ruleName: 'Max Sector Concentration',
              status: 'warn',
              threshold: rules.maxSectorPct
            })
          : this.buildPassFailRule({
              currentValue: maxSectorExposure,
              description:
                'No single sector should exceed the configured concentration threshold.',
              details: `${maxSectorName} sector allocation is ${(maxSectorExposure * 100).toFixed(2)}%.`,
              isPassing: maxSectorExposure <= rules.maxSectorPct,
              ruleId: 'max_sector_concentration',
              ruleName: 'Max Sector Concentration',
              threshold: rules.maxSectorPct
            }),
      holdingsCount === 0
        ? this.buildRuleResult({
            currentValue: 0,
            description:
              'No single asset class should exceed the configured concentration threshold.',
            details: 'Skipped because portfolio has no holdings.',
            ruleId: 'max_asset_class_concentration',
            ruleName: 'Max Asset Class Concentration',
            status: 'skip',
            threshold: rules.maxAssetClassPct
          })
        : this.buildPassFailRule({
            currentValue: maxAssetClassExposure,
            description:
              'No single asset class should exceed the configured concentration threshold.',
            details: `${maxAssetClassName} allocation is ${(maxAssetClassExposure * 100).toFixed(2)}%.`,
            isPassing: maxAssetClassExposure <= rules.maxAssetClassPct,
            ruleId: 'max_asset_class_concentration',
            ruleName: 'Max Asset Class Concentration',
            threshold: rules.maxAssetClassPct
          }),
      holdingsCount === 0
        ? this.buildRuleResult({
            currentValue: 0,
            description:
              'Portfolio should contain at least the minimum number of holdings.',
            details:
              'No holdings present; add positions before enforcing this rule.',
            ruleId: 'min_holdings_count',
            ruleName: 'Minimum Holdings Count',
            status: 'warn',
            threshold: rules.minHoldingsCount
          })
        : this.buildPassFailRule({
            currentValue: holdingsCount,
            description:
              'Portfolio should contain at least the minimum number of holdings.',
            details: `Portfolio currently contains ${holdingsCount} holdings.`,
            isPassing: holdingsCount >= rules.minHoldingsCount,
            ruleId: 'min_holdings_count',
            ruleName: 'Minimum Holdings Count',
            threshold: rules.minHoldingsCount
          }),
      portfolioValueInBaseCurrency <= 0
        ? this.buildRuleResult({
            currentValue: 0,
            description:
              'Cash allocation should remain below the configured percentage.',
            details: 'Skipped because total portfolio value is non-positive.',
            ruleId: 'max_cash_allocation',
            ruleName: 'Max Cash Allocation',
            status: 'skip',
            threshold: rules.maxCashPct
          })
        : this.buildPassFailRule({
            currentValue: cashAllocation,
            description:
              'Cash allocation should remain below the configured percentage.',
            details: `Cash allocation is ${(cashAllocation * 100).toFixed(2)}%.`,
            isPassing: cashAllocation <= rules.maxCashPct,
            ruleId: 'max_cash_allocation',
            ruleName: 'Max Cash Allocation',
            threshold: rules.maxCashPct
          }),
      rules.restrictedSymbols.length === 0
        ? this.buildRuleResult({
            currentValue: 0,
            description: 'Restricted symbols must not appear in holdings.',
            details: 'No restricted symbols configured.',
            ruleId: 'restricted_symbols',
            ruleName: 'Restricted Symbols',
            status: 'skip',
            threshold: 0
          })
        : this.buildPassFailRule({
            currentValue: matchedRestrictedSymbols.length,
            description: 'Restricted symbols must not appear in holdings.',
            details:
              matchedRestrictedSymbols.length > 0
                ? `Restricted symbols present: ${matchedRestrictedSymbols.join(', ')}.`
                : 'No restricted symbols are present.',
            isPassing: matchedRestrictedSymbols.length === 0,
            ruleId: 'restricted_symbols',
            ruleName: 'Restricted Symbols',
            threshold: 0
          }),
      rules.restrictedAssetClasses.length === 0
        ? this.buildRuleResult({
            currentValue: 0,
            description:
              'Restricted asset classes must not appear in holdings.',
            details: 'No restricted asset classes configured.',
            ruleId: 'restricted_asset_classes',
            ruleName: 'Restricted Asset Classes',
            status: 'skip',
            threshold: 0
          })
        : this.buildPassFailRule({
            currentValue: matchedRestrictedAssetClasses.length,
            description:
              'Restricted asset classes must not appear in holdings.',
            details:
              matchedRestrictedAssetClasses.length > 0
                ? `Restricted asset classes present: ${matchedRestrictedAssetClasses.join(', ')}.`
                : 'No restricted asset classes are present.',
            isPassing: matchedRestrictedAssetClasses.length === 0,
            ruleId: 'restricted_asset_classes',
            ruleName: 'Restricted Asset Classes',
            threshold: 0
          })
    ];

    const rulesPassed = results.filter(
      ({ status }) => status === 'pass'
    ).length;
    const rulesFailed = results.filter(
      ({ status }) => status === 'fail'
    ).length;

    const overallStatus: ComplianceCheckOutput['overallStatus'] =
      rulesFailed > 0
        ? 'NON_COMPLIANT'
        : results.some(({ status }) => status === 'warn') || warnings.length > 0
          ? 'NEEDS_REVIEW'
          : 'COMPLIANT';

    return {
      assumptions: [
        'Compliance checks are deterministic threshold evaluations over current portfolio composition.',
        'Sector exposure relies on available holdings metadata and normalized sector weights.',
        'Rules marked as skip were not applicable or were not configured.'
      ],
      baseCurrency:
        user?.settings?.settings?.baseCurrency?.toString() ?? DEFAULT_CURRENCY,
      generatedAt: new Date().toISOString(),
      holdingsCount,
      overallStatus,
      portfolioValueInBaseCurrency,
      results,
      rulesChecked: results.length,
      rulesFailed,
      rulesPassed,
      warnings
    };
  }

  private buildPassFailRule({
    currentValue,
    description,
    details,
    isPassing,
    ruleId,
    ruleName,
    threshold
  }: {
    currentValue: number;
    description: string;
    details: string;
    isPassing: boolean;
    ruleId: string;
    ruleName: string;
    threshold: number;
  }): ComplianceRuleResult {
    return {
      currentValue,
      description,
      details,
      ruleId,
      ruleName,
      status: isPassing ? 'pass' : 'fail',
      threshold
    };
  }

  private buildRuleResult(result: ComplianceRuleResult): ComplianceRuleResult {
    return result;
  }

  private getMaxAssetClassExposure(
    holdings: {
      allocationInPortfolio: number;
      assetClass: string;
    }[]
  ) {
    const allocationByAssetClass = holdings.reduce(
      (response, holding) => {
        response[holding.assetClass] =
          (response[holding.assetClass] ?? 0) + holding.allocationInPortfolio;

        return response;
      },
      {} as Record<string, number>
    );

    const rankedAssetClasses = Object.entries(allocationByAssetClass).sort(
      (assetClassA, assetClassB) => assetClassB[1] - assetClassA[1]
    );

    return {
      maxAssetClassExposure: rankedAssetClasses[0]?.[1] ?? 0,
      maxAssetClassName: rankedAssetClasses[0]?.[0] ?? 'UNKNOWN'
    };
  }

  private getMaxSectorExposure(
    holdings: {
      allocationInPortfolio: number;
      sectors: {
        name: string;
        weight: number;
      }[];
    }[]
  ) {
    let sectorCoverageInPortfolio = 0;

    const allocationBySector = holdings.reduce(
      (response, holding) => {
        if (!holding.sectors?.length) {
          return response;
        }

        sectorCoverageInPortfolio += holding.allocationInPortfolio;

        for (const sector of holding.sectors) {
          const normalizedWeight = this.normalizeWeight(sector.weight);

          response[sector.name] =
            (response[sector.name] ?? 0) +
            holding.allocationInPortfolio * normalizedWeight;
        }

        return response;
      },
      {} as Record<string, number>
    );

    const rankedSectors = Object.entries(allocationBySector).sort(
      (sectorA, sectorB) => sectorB[1] - sectorA[1]
    );

    return {
      hasSectorData: rankedSectors.length > 0,
      maxSectorExposure: rankedSectors[0]?.[1] ?? 0,
      maxSectorName: rankedSectors[0]?.[0] ?? 'UNKNOWN',
      sectorCoverageInPortfolio
    };
  }

  private normalizeWeight(weight: number) {
    if (!Number.isFinite(weight)) {
      return 0;
    }

    if (weight < 0) {
      return 0;
    }

    const normalizedWeight = weight > 1 ? weight / 100 : weight;

    return Math.min(1, normalizedWeight);
  }

  private resolveRules(
    inputRules: ComplianceCheckInput['rules']
  ): ResolvedRules {
    return {
      maxAssetClassPct: this.clamp(
        inputRules?.maxAssetClassPct,
        0,
        1,
        DEFAULT_RULES.maxAssetClassPct
      ),
      maxCashPct: this.clamp(
        inputRules?.maxCashPct,
        0,
        1,
        DEFAULT_RULES.maxCashPct
      ),
      maxSectorPct: this.clamp(
        inputRules?.maxSectorPct,
        0,
        1,
        DEFAULT_RULES.maxSectorPct
      ),
      maxSinglePositionPct: this.clamp(
        inputRules?.maxSinglePositionPct,
        0,
        1,
        DEFAULT_RULES.maxSinglePositionPct
      ),
      maxTop3Pct: this.clamp(
        inputRules?.maxTop3Pct,
        0,
        1,
        DEFAULT_RULES.maxTop3Pct
      ),
      minHoldingsCount: this.clamp(
        inputRules?.minHoldingsCount,
        0,
        1000,
        DEFAULT_RULES.minHoldingsCount
      ),
      restrictedAssetClasses: (inputRules?.restrictedAssetClasses ?? [])
        .map((assetClass) => assetClass.trim())
        .filter(Boolean),
      restrictedSymbols: (inputRules?.restrictedSymbols ?? [])
        .map((symbol) => symbol.trim())
        .filter(Boolean)
    };
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
