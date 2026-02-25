import {
  ANALYZE_RISK_INPUT_SCHEMA,
  ANALYZE_RISK_OUTPUT_SCHEMA
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

interface AnalyzeRiskInput {
  concentrationSingleThreshold?: number;
  concentrationTop3Threshold?: number;
  sectorConcentrationThreshold?: number;
}

type RiskSeverity = 'high' | 'low' | 'medium';

interface AnalyzeRiskOutput {
  assumptions: string[];
  baseCurrency: string;
  exposures: {
    assetClassExposures: {
      allocationInPortfolio: number;
      assetClass: string;
    }[];
    sectorCoverageInPortfolio: number;
    top3AllocationInPortfolio: number;
    topHoldings: {
      allocationInPortfolio: number;
      assetClass: string;
      name: string;
      symbol: string;
      valueInBaseCurrency: number;
    }[];
    topSectorExposures: {
      allocationInPortfolio: number;
      sector: string;
    }[];
  };
  flags: {
    code: string;
    description: string;
    metricName: string;
    metricValue: number;
    severity: RiskSeverity;
    threshold: number;
    title: string;
  }[];
  generatedAt: string;
  holdingsCount: number;
  overallRiskLevel: 'HIGH' | 'LOW' | 'MEDIUM';
  portfolioValueInBaseCurrency: number;
  volatilityProxyScore: number;
  warnings: {
    code: string;
    message: string;
  }[];
}

const DEFAULT_SINGLE_POSITION_THRESHOLD = 0.35;
const DEFAULT_TOP3_THRESHOLD = 0.75;
const DEFAULT_SECTOR_THRESHOLD = 0.4;
const VOLATILITY_MEDIUM_THRESHOLD = 0.5;
const VOLATILITY_HIGH_THRESHOLD = 0.7;
const TOP_EXPOSURE_ROWS = 5;

@Injectable()
export class AnalyzeRiskTool implements ToolDefinition<
  AnalyzeRiskInput,
  AnalyzeRiskOutput
> {
  public readonly description =
    'Analyze deterministic portfolio risk flags for concentration, sector exposure and a simple volatility proxy.';

  public readonly inputSchema: ToolJsonSchema = ANALYZE_RISK_INPUT_SCHEMA;

  public readonly name = 'analyze_risk';

  public readonly outputSchema: ToolJsonSchema = ANALYZE_RISK_OUTPUT_SCHEMA;

  public constructor(
    private readonly portfolioService: PortfolioService,
    private readonly userService: UserService
  ) {}

  public async execute(
    input: AnalyzeRiskInput,
    context: ToolExecutionContext
  ): Promise<ToolResultEnvelope<AnalyzeRiskOutput>> {
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

    const portfolioValueInBaseCurrency =
      portfolioDetails.summary?.totalValueInBaseCurrency ??
      Object.values(portfolioDetails.holdings ?? {}).reduce((sum, holding) => {
        return sum + (holding.valueInBaseCurrency ?? 0);
      }, 0);

    const holdings = Object.values(portfolioDetails.holdings ?? {})
      .map((holding) => {
        const valueInBaseCurrency = holding.valueInBaseCurrency ?? 0;

        return {
          allocationInPortfolio:
            portfolioValueInBaseCurrency > 0
              ? valueInBaseCurrency / portfolioValueInBaseCurrency
              : (holding.allocationInPercentage ?? 0),
          assetClass: holding.assetClass ?? 'UNKNOWN',
          name: holding.name ?? holding.symbol,
          sectors: holding.sectors ?? [],
          symbol: holding.symbol,
          valueInBaseCurrency
        };
      })
      .sort((holdingA, holdingB) => {
        return holdingB.valueInBaseCurrency - holdingA.valueInBaseCurrency;
      });

    const holdingsCount = holdings.length;

    const singleThreshold = this.getThreshold(
      input?.concentrationSingleThreshold,
      DEFAULT_SINGLE_POSITION_THRESHOLD
    );

    const top3Threshold = this.getThreshold(
      input?.concentrationTop3Threshold,
      DEFAULT_TOP3_THRESHOLD
    );

    const sectorThreshold = this.getThreshold(
      input?.sectorConcentrationThreshold,
      DEFAULT_SECTOR_THRESHOLD
    );

    const top3AllocationInPortfolio = holdings
      .slice(0, 3)
      .reduce((sum, holding) => {
        return sum + holding.allocationInPortfolio;
      }, 0);

    const topHolding = holdings[0];

    const assetClassExposures = this.getAssetClassExposures(holdings);
    const { sectorCoverageInPortfolio, topSectorExposures, topSectorMetric } =
      this.getSectorExposure(holdings);

    const volatilityProxyScore = this.getVolatilityProxyScore({
      holdings,
      top3AllocationInPortfolio,
      topHoldingAllocationInPortfolio: topHolding?.allocationInPortfolio ?? 0
    });

    const flags: AnalyzeRiskOutput['flags'] = [];

    if ((topHolding?.allocationInPortfolio ?? 0) >= singleThreshold) {
      flags.push({
        code: 'single_position_concentration',
        description:
          'A single holding exceeds the concentration threshold and can dominate portfolio outcomes.',
        metricName: 'top_holding_allocation',
        metricValue: topHolding.allocationInPortfolio,
        severity:
          topHolding.allocationInPortfolio >= singleThreshold + 0.15
            ? 'high'
            : 'medium',
        threshold: singleThreshold,
        title: 'Single-position concentration'
      });
    }

    if (top3AllocationInPortfolio >= top3Threshold) {
      flags.push({
        code: 'top3_concentration',
        description:
          'The top 3 holdings represent most of the portfolio and reduce diversification.',
        metricName: 'top3_allocation',
        metricValue: top3AllocationInPortfolio,
        severity:
          top3AllocationInPortfolio >= top3Threshold + 0.1 ? 'high' : 'medium',
        threshold: top3Threshold,
        title: 'Top-3 concentration'
      });
    }

    if (
      topSectorMetric &&
      topSectorMetric.allocationInPortfolio >= sectorThreshold
    ) {
      flags.push({
        code: 'sector_concentration',
        description:
          'Sector exposure is concentrated in one sector based on available metadata.',
        metricName: `sector_${topSectorMetric.sector}`,
        metricValue: topSectorMetric.allocationInPortfolio,
        severity:
          topSectorMetric.allocationInPortfolio >= sectorThreshold + 0.1
            ? 'high'
            : 'medium',
        threshold: sectorThreshold,
        title: 'Sector concentration'
      });
    }

    if (volatilityProxyScore >= VOLATILITY_HIGH_THRESHOLD) {
      flags.push({
        code: 'volatility_proxy_high',
        description:
          'Portfolio composition implies high volatility under this deterministic proxy model.',
        metricName: 'volatility_proxy_score',
        metricValue: volatilityProxyScore,
        severity: 'high',
        threshold: VOLATILITY_HIGH_THRESHOLD,
        title: 'Elevated volatility proxy'
      });
    } else if (volatilityProxyScore >= VOLATILITY_MEDIUM_THRESHOLD) {
      flags.push({
        code: 'volatility_proxy_medium',
        description:
          'Portfolio composition implies medium volatility under this deterministic proxy model.',
        metricName: 'volatility_proxy_score',
        metricValue: volatilityProxyScore,
        severity: 'medium',
        threshold: VOLATILITY_MEDIUM_THRESHOLD,
        title: 'Moderate volatility proxy'
      });
    }

    const warnings: AnalyzeRiskOutput['warnings'] = [];

    if (holdingsCount === 0) {
      warnings.push({
        code: 'no_holdings_data',
        message: 'No holdings are available to analyze portfolio risk.'
      });
    }

    if (portfolioValueInBaseCurrency <= 0) {
      warnings.push({
        code: 'non_positive_portfolio_total',
        message:
          'Total portfolio value is zero or negative; allocations may be unstable.'
      });
    }

    if (holdingsCount > 0 && holdingsCount < 3) {
      warnings.push({
        code: 'sparse_portfolio',
        message:
          'Risk analysis is less reliable because fewer than 3 holdings are available.'
      });
    }

    if (holdingsCount > 0 && sectorCoverageInPortfolio < 0.5) {
      warnings.push({
        code: 'limited_sector_metadata',
        message:
          'Sector metadata covers less than 50% of portfolio allocation; sector flags may be incomplete.'
      });
    }

    const severityRank: Record<RiskSeverity, number> = {
      high: 3,
      low: 1,
      medium: 2
    };

    const maxSeverity = flags.reduce<RiskSeverity | null>((response, flag) => {
      if (!response || severityRank[flag.severity] > severityRank[response]) {
        return flag.severity;
      }

      return response;
    }, null);

    const overallRiskLevel: AnalyzeRiskOutput['overallRiskLevel'] =
      maxSeverity === 'high' ||
      volatilityProxyScore >= VOLATILITY_HIGH_THRESHOLD
        ? 'HIGH'
        : maxSeverity === 'medium' ||
            volatilityProxyScore >= VOLATILITY_MEDIUM_THRESHOLD
          ? 'MEDIUM'
          : 'LOW';

    return {
      data: {
        assumptions: [
          'Volatility proxy uses deterministic asset-class risk weights with a concentration penalty.',
          'Sector exposure aggregates per-holding sector weights and normalizes weights above 1 as percentages.',
          'Risk flags are threshold-based and not a prediction of future returns.'
        ],
        baseCurrency,
        exposures: {
          assetClassExposures,
          sectorCoverageInPortfolio,
          top3AllocationInPortfolio,
          topHoldings: holdings.slice(0, TOP_EXPOSURE_ROWS).map((holding) => {
            return {
              allocationInPortfolio: holding.allocationInPortfolio,
              assetClass: holding.assetClass,
              name: holding.name,
              symbol: holding.symbol,
              valueInBaseCurrency: holding.valueInBaseCurrency
            };
          }),
          topSectorExposures
        },
        flags,
        generatedAt: new Date().toISOString(),
        holdingsCount,
        overallRiskLevel,
        portfolioValueInBaseCurrency,
        volatilityProxyScore,
        warnings
      },
      status:
        holdingsCount === 0 ||
        portfolioValueInBaseCurrency <= 0 ||
        (holdingsCount > 0 && holdingsCount < 3)
          ? 'partial'
          : 'success'
    };
  }

  private getAssetClassExposures(
    holdings: {
      allocationInPortfolio: number;
      assetClass: string;
    }[]
  ) {
    const exposures = holdings.reduce(
      (response, holding) => {
        response[holding.assetClass] =
          (response[holding.assetClass] ?? 0) + holding.allocationInPortfolio;

        return response;
      },
      {} as Record<string, number>
    );

    return Object.entries(exposures)
      .map(([assetClass, allocationInPortfolio]) => {
        return {
          allocationInPortfolio,
          assetClass
        };
      })
      .sort((exposureA, exposureB) => {
        return (
          exposureB.allocationInPortfolio - exposureA.allocationInPortfolio
        );
      });
  }

  private getSectorExposure(
    holdings: {
      allocationInPortfolio: number;
      sectors: {
        name: string;
        weight: number;
      }[];
    }[]
  ) {
    let sectorCoverageInPortfolio = 0;

    const sectorExposures = holdings.reduce(
      (response, holding) => {
        if (!holding.sectors?.length) {
          return response;
        }

        sectorCoverageInPortfolio += holding.allocationInPortfolio;

        for (const sector of holding.sectors) {
          const normalizedWeight = this.normalizeSectorWeight(sector.weight);

          response[sector.name] =
            (response[sector.name] ?? 0) +
            holding.allocationInPortfolio * normalizedWeight;
        }

        return response;
      },
      {} as Record<string, number>
    );

    const topSectorExposures = Object.entries(sectorExposures)
      .map(([sector, allocationInPortfolio]) => {
        return {
          allocationInPortfolio,
          sector
        };
      })
      .sort((sectorA, sectorB) => {
        return sectorB.allocationInPortfolio - sectorA.allocationInPortfolio;
      })
      .slice(0, TOP_EXPOSURE_ROWS);

    return {
      sectorCoverageInPortfolio,
      topSectorExposures,
      topSectorMetric: topSectorExposures[0]
    };
  }

  private getThreshold(value: number | undefined, fallback: number) {
    if (Number.isFinite(value)) {
      return Math.max(0, Math.min(1, value));
    }

    return fallback;
  }

  private getVolatilityProxyScore({
    holdings,
    top3AllocationInPortfolio,
    topHoldingAllocationInPortfolio
  }: {
    holdings: {
      allocationInPortfolio: number;
      assetClass: string;
    }[];
    top3AllocationInPortfolio: number;
    topHoldingAllocationInPortfolio: number;
  }) {
    const weightedRisk = holdings.reduce((sum, holding) => {
      return (
        sum +
        holding.allocationInPortfolio *
          this.getAssetClassRiskWeight(holding.assetClass)
      );
    }, 0);

    const concentrationPenalty = Math.min(
      0.25,
      topHoldingAllocationInPortfolio * 0.2 + top3AllocationInPortfolio * 0.1
    );

    return Math.min(1, weightedRisk + concentrationPenalty);
  }

  private getAssetClassRiskWeight(assetClass: string) {
    const riskWeightByAssetClass: Record<string, number> = {
      COMMODITY: 0.65,
      CRYPTOCURRENCY: 1,
      CURRENCY: 0.5,
      EQUITY: 0.75,
      ETF: 0.55,
      FIXED_INCOME: 0.3,
      LIQUIDITY: 0.1,
      REAL_ESTATE: 0.55,
      UNKNOWN: 0.5
    };

    return riskWeightByAssetClass[assetClass] ?? riskWeightByAssetClass.UNKNOWN;
  }

  private normalizeSectorWeight(weight: number) {
    if (!Number.isFinite(weight)) {
      return 0;
    }

    if (weight < 0) {
      return 0;
    }

    const normalizedWeight = weight > 1 ? weight / 100 : weight;

    return Math.min(1, normalizedWeight);
  }
}
