import {
  STRESS_TEST_INPUT_SCHEMA,
  STRESS_TEST_OUTPUT_SCHEMA
} from '@ghostfolio/api/app/endpoints/ai/tools/schemas';
import {
  ToolDefinition,
  ToolExecutionContext,
  ToolJsonSchema,
  ToolResultEnvelope
} from '@ghostfolio/api/app/endpoints/ai/tools/tool.types';
import { PortfolioService } from '@ghostfolio/api/app/portfolio/portfolio.service';

import { Injectable } from '@nestjs/common';

interface StressShock {
  assetClass: string;
  shockPercent: number;
}

interface StressScenario {
  description: string;
  name: string;
  shocks: StressShock[];
}

interface StressTestInput {
  customShocks?: StressShock[];
  scenarioId?: string;
}

interface WarningItem {
  code: string;
  message: string;
}

interface PositionImpact {
  currentValueInBaseCurrency: number;
  lossInBaseCurrency: number;
  lossPct: number;
  stressedValueInBaseCurrency: number;
  symbol: string;
}

interface AssetClassImpact {
  currentValueInBaseCurrency: number;
  lossPct: number;
  name: string;
  stressedValueInBaseCurrency: number;
}

interface StressTestOutput {
  assetClassImpacts: AssetClassImpact[];
  availableScenarioIds?: string[];
  currentValueInBaseCurrency: number;
  disclaimers: string[];
  mostVulnerable: { lossPct: number; symbol: string }[];
  positionImpacts: PositionImpact[];
  recoveryNeededPct: number;
  scenario: {
    description: string;
    id: string;
    name: string;
    shocks: StressShock[];
  };
  status: 'partial' | 'success';
  stressedValueInBaseCurrency: number;
  totalLossInBaseCurrency: number;
  totalLossPct: number;
  warnings: WarningItem[];
}

export const STRESS_SCENARIOS: Record<string, StressScenario> = {
  covid_crash: {
    description:
      'Simulates a COVID-19 style crash: equities -35%, bonds +2%, crypto -50%, gold +5%.',
    name: 'COVID-19 Crash',
    shocks: [
      { assetClass: 'EQUITY', shockPercent: -35 },
      { assetClass: 'ETF', shockPercent: -30 },
      { assetClass: 'FIXED_INCOME', shockPercent: 2 },
      { assetClass: 'CRYPTOCURRENCY', shockPercent: -50 },
      { assetClass: 'COMMODITY', shockPercent: 5 },
      { assetClass: 'REAL_ESTATE', shockPercent: -15 }
    ]
  },
  crypto_winter: {
    description:
      'Simulates a crypto winter: crypto -80%, equities -5%, other assets minimal impact.',
    name: 'Crypto Winter',
    shocks: [
      { assetClass: 'CRYPTOCURRENCY', shockPercent: -80 },
      { assetClass: 'EQUITY', shockPercent: -5 },
      { assetClass: 'ETF', shockPercent: -3 }
    ]
  },
  dot_com_bust: {
    description:
      'Simulates a dot-com bust: equities -75%, bonds +15%, commodities flat.',
    name: 'Dot-Com Bust',
    shocks: [
      { assetClass: 'EQUITY', shockPercent: -75 },
      { assetClass: 'ETF', shockPercent: -60 },
      { assetClass: 'FIXED_INCOME', shockPercent: 15 },
      { assetClass: 'COMMODITY', shockPercent: 0 },
      { assetClass: 'REAL_ESTATE', shockPercent: -10 }
    ]
  },
  market_crash_2008: {
    description:
      'Simulates a 2008-style financial crisis: equities -50%, bonds +5%, commodities +25%, real estate -35%.',
    name: '2008 Financial Crisis',
    shocks: [
      { assetClass: 'EQUITY', shockPercent: -50 },
      { assetClass: 'ETF', shockPercent: -40 },
      { assetClass: 'FIXED_INCOME', shockPercent: 5 },
      { assetClass: 'COMMODITY', shockPercent: 25 },
      { assetClass: 'REAL_ESTATE', shockPercent: -35 },
      { assetClass: 'CRYPTOCURRENCY', shockPercent: -60 }
    ]
  },
  rising_rates: {
    description:
      'Simulates a rising interest rate environment: bonds -15%, equities -10%, real estate -20%.',
    name: 'Rising Interest Rates',
    shocks: [
      { assetClass: 'FIXED_INCOME', shockPercent: -15 },
      { assetClass: 'EQUITY', shockPercent: -10 },
      { assetClass: 'ETF', shockPercent: -8 },
      { assetClass: 'REAL_ESTATE', shockPercent: -20 },
      { assetClass: 'COMMODITY', shockPercent: 5 }
    ]
  },
  stagflation: {
    description:
      'Simulates stagflation: equities -25%, bonds -10%, commodities +15%.',
    name: 'Stagflation',
    shocks: [
      { assetClass: 'EQUITY', shockPercent: -25 },
      { assetClass: 'ETF', shockPercent: -20 },
      { assetClass: 'FIXED_INCOME', shockPercent: -10 },
      { assetClass: 'COMMODITY', shockPercent: 15 },
      { assetClass: 'REAL_ESTATE', shockPercent: -15 },
      { assetClass: 'CRYPTOCURRENCY', shockPercent: -30 }
    ]
  }
};

const DISCLAIMERS = [
  'Stress scenarios are hypothetical and simplified.',
  'Actual market events may differ significantly from modeled scenarios.'
];

@Injectable()
export class StressTestTool implements ToolDefinition<
  StressTestInput,
  StressTestOutput
> {
  public readonly description =
    'Run stress test scenarios against current portfolio to estimate losses under adverse market conditions. Available scenarios: market_crash_2008, dot_com_bust, covid_crash, rising_rates, crypto_winter, stagflation. Alternatively provide customShocks.';

  public readonly inputSchema: ToolJsonSchema = STRESS_TEST_INPUT_SCHEMA;

  public readonly name = 'stress_test';

  public readonly outputSchema: ToolJsonSchema = STRESS_TEST_OUTPUT_SCHEMA;

  public constructor(private readonly portfolioService: PortfolioService) {}

  public async execute(
    input: StressTestInput,
    context: ToolExecutionContext
  ): Promise<ToolResultEnvelope<StressTestOutput>> {
    const availableIds = Object.keys(STRESS_SCENARIOS);

    // Resolve scenario
    let scenarioId: string;
    let scenarioName: string;
    let scenarioDescription: string;
    let shocks: StressShock[];

    if (input.scenarioId) {
      const scenario = STRESS_SCENARIOS[input.scenarioId];

      if (!scenario) {
        return {
          data: {
            assetClassImpacts: [],
            availableScenarioIds: availableIds,
            currentValueInBaseCurrency: 0,
            disclaimers: DISCLAIMERS,
            mostVulnerable: [],
            positionImpacts: [],
            recoveryNeededPct: 0,
            scenario: {
              description: '',
              id: input.scenarioId,
              name: 'Unknown',
              shocks: []
            },
            status: 'partial',
            stressedValueInBaseCurrency: 0,
            totalLossInBaseCurrency: 0,
            totalLossPct: 0,
            warnings: [
              {
                code: 'unknown_scenario',
                message: `Unknown scenario "${input.scenarioId}". Available: ${availableIds.join(', ')}.`
              }
            ]
          },
          status: 'partial'
        };
      }

      scenarioId = input.scenarioId;
      scenarioName = scenario.name;
      scenarioDescription = scenario.description;
      shocks = scenario.shocks;
    } else if (input.customShocks?.length > 0) {
      scenarioId = 'custom';
      scenarioName = 'Custom Stress Test';
      scenarioDescription = 'User-defined stress scenario.';
      shocks = input.customShocks;
    } else {
      return {
        error: {
          code: 'missing_input',
          message:
            'Provide either scenarioId or customShocks. Available scenarios: ' +
            availableIds.join(', ')
        },
        status: 'error'
      };
    }

    // Fetch portfolio
    const [portfolioDetails] = await Promise.all([
      this.portfolioService.getDetails({
        impersonationId: undefined,
        userId: context.userId,
        withSummary: true
      })
    ]);

    const holdings = Object.values(portfolioDetails.holdings ?? {});
    const warnings: WarningItem[] = [];

    // Build shock map
    const shockMap = new Map<string, number>();

    for (const s of shocks) {
      shockMap.set(s.assetClass, s.shockPercent);
    }

    // Find default shock for unknown asset classes (use EQUITY shock as conservative default)
    const defaultShock = shockMap.get('EQUITY') ?? 0;

    // Process each position
    const positionImpacts: PositionImpact[] = [];
    let totalCurrentValue = 0;
    let totalStressedValue = 0;

    // Asset class aggregation
    const assetClassAgg = new Map<
      string,
      { currentValue: number; stressedValue: number }
    >();

    for (const holding of holdings) {
      const currentValue = holding.valueInBaseCurrency ?? 0;
      const assetClass = holding.assetClass ?? 'UNKNOWN';

      let shockPercent: number;

      if (shockMap.has(assetClass)) {
        shockPercent = shockMap.get(assetClass);
      } else if (assetClass === 'UNKNOWN') {
        shockPercent = defaultShock;
        warnings.push({
          code: 'unknown_asset_class',
          message: `${holding.symbol} has unknown asset class; applied conservative default shock of ${defaultShock}%.`
        });
      } else {
        // Asset class not in scenario shocks — assume 0% shock
        shockPercent = 0;
      }

      const stressedValue = currentValue * (1 + shockPercent / 100);

      positionImpacts.push({
        currentValueInBaseCurrency: currentValue,
        lossInBaseCurrency: stressedValue - currentValue,
        lossPct: currentValue > 0 ? shockPercent : 0,
        stressedValueInBaseCurrency: Math.max(0, stressedValue),
        symbol: holding.symbol
      });

      totalCurrentValue += currentValue;
      totalStressedValue += Math.max(0, stressedValue);

      // Aggregate by asset class
      const existing = assetClassAgg.get(assetClass) ?? {
        currentValue: 0,
        stressedValue: 0
      };
      existing.currentValue += currentValue;
      existing.stressedValue += Math.max(0, stressedValue);
      assetClassAgg.set(assetClass, existing);
    }

    // Asset class impacts
    const assetClassImpacts: AssetClassImpact[] = Array.from(
      assetClassAgg.entries()
    )
      .map(([name, agg]) => ({
        currentValueInBaseCurrency: agg.currentValue,
        lossPct:
          agg.currentValue > 0
            ? ((agg.stressedValue - agg.currentValue) / agg.currentValue) * 100
            : 0,
        name,
        stressedValueInBaseCurrency: agg.stressedValue
      }))
      .sort((a, b) => a.lossPct - b.lossPct);

    // Most vulnerable (top 5, sorted by lossPct ascending — most negative first)
    const mostVulnerable = [...positionImpacts]
      .sort((a, b) => a.lossPct - b.lossPct)
      .slice(0, 5)
      .map((p) => ({ lossPct: p.lossPct, symbol: p.symbol }));

    // Total loss
    const totalLoss = totalStressedValue - totalCurrentValue;
    const totalLossPct =
      totalCurrentValue > 0 ? (totalLoss / totalCurrentValue) * 100 : 0;

    // Recovery needed
    let recoveryNeededPct: number;

    if (totalStressedValue === 0 && totalCurrentValue > 0) {
      recoveryNeededPct = 9999;
      warnings.push({
        code: 'total_loss',
        message:
          'Portfolio would be completely wiped out under this scenario. Recovery is not possible from zero.'
      });
    } else if (totalStressedValue > 0) {
      recoveryNeededPct = (totalCurrentValue / totalStressedValue - 1) * 100;
    } else {
      recoveryNeededPct = 0;
    }

    const output: StressTestOutput = {
      assetClassImpacts,
      currentValueInBaseCurrency: totalCurrentValue,
      disclaimers: DISCLAIMERS,
      mostVulnerable,
      positionImpacts,
      recoveryNeededPct,
      scenario: {
        description: scenarioDescription,
        id: scenarioId,
        name: scenarioName,
        shocks
      },
      status: 'success',
      stressedValueInBaseCurrency: totalStressedValue,
      totalLossInBaseCurrency: totalLoss,
      totalLossPct,
      warnings
    };

    return { data: output, status: 'success' };
  }
}
