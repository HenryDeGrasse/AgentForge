/**
 * Deterministic tool stub profiles for eval fixtures.
 *
 * Each profile returns 10 tool stubs with fixed data.
 * All stubs push to an invocationLog for auth scoping and tool count assertions.
 * Schemas are imported from production — zero drift by construction.
 */
import {
  ANALYZE_RISK_INPUT_SCHEMA,
  ANALYZE_RISK_OUTPUT_SCHEMA,
  COMPLIANCE_CHECK_INPUT_SCHEMA,
  COMPLIANCE_CHECK_OUTPUT_SCHEMA,
  MARKET_DATA_LOOKUP_INPUT_SCHEMA,
  MARKET_DATA_LOOKUP_OUTPUT_SCHEMA,
  PERFORMANCE_COMPARE_INPUT_SCHEMA,
  PERFORMANCE_COMPARE_OUTPUT_SCHEMA,
  PORTFOLIO_SUMMARY_INPUT_SCHEMA,
  PORTFOLIO_SUMMARY_OUTPUT_SCHEMA,
  REBALANCE_SUGGEST_INPUT_SCHEMA,
  REBALANCE_SUGGEST_OUTPUT_SCHEMA,
  SIMULATE_TRADES_INPUT_SCHEMA,
  SIMULATE_TRADES_OUTPUT_SCHEMA,
  STRESS_TEST_INPUT_SCHEMA,
  STRESS_TEST_OUTPUT_SCHEMA,
  TAX_ESTIMATE_INPUT_SCHEMA,
  TAX_ESTIMATE_OUTPUT_SCHEMA,
  TRANSACTION_HISTORY_INPUT_SCHEMA,
  TRANSACTION_HISTORY_OUTPUT_SCHEMA
} from '@ghostfolio/api/app/endpoints/ai/tools/schemas';
import type { ToolDefinition } from '@ghostfolio/api/app/endpoints/ai/tools/tool.types';

import type { EvalProfile } from '../eval-case.schema';

// ─── Invocation Log ────────────────────────────────────────────────────────────

export interface ToolInvocationEntry {
  input: unknown;
  toolName: string;
  userId: string;
}

// ─── Factory ───────────────────────────────────────────────────────────────────

export function buildToolsForProfile(
  profile: EvalProfile,
  invocationLog: ToolInvocationEntry[] = []
): ToolDefinition[] {
  if (profile === 'rich') {
    return buildRichProfileTools(invocationLog);
  }

  return buildEmptyProfileTools(invocationLog);
}

// ─── Rich Profile ──────────────────────────────────────────────────────────────

function buildRichProfileTools(log: ToolInvocationEntry[]): ToolDefinition[] {
  return [
    {
      description:
        'Return portfolio totals, allocation percentages and top holdings.',
      execute: (input, context) => {
        log.push({
          input,
          toolName: 'get_portfolio_summary',
          userId: context.userId
        });

        return {
          baseCurrency: 'USD',
          generatedAt: '2025-06-01T00:00:00.000Z',
          latestActivityDate: '2025-05-30T00:00:00.000Z',
          snapshotCreatedAt: '2025-06-01T00:00:00.000Z',
          topHoldings: [
            {
              allocationInHoldings: 0.4,
              allocationInPortfolio: 0.38,
              assetClass: 'EQUITY',
              currency: 'USD',
              dataSource: 'MANUAL',
              marketPrice: 150,
              name: 'Asset A',
              quantity: 26.67,
              symbol: 'SYM-A',
              valueInBaseCurrency: 4000
            },
            {
              allocationInHoldings: 0.3,
              allocationInPortfolio: 0.29,
              assetClass: 'EQUITY',
              currency: 'USD',
              dataSource: 'MANUAL',
              marketPrice: 120,
              name: 'Asset B',
              quantity: 25,
              symbol: 'SYM-B',
              valueInBaseCurrency: 3000
            },
            {
              allocationInHoldings: 0.2,
              allocationInPortfolio: 0.19,
              assetClass: 'BOND',
              currency: 'USD',
              dataSource: 'MANUAL',
              marketPrice: 100,
              name: 'Asset C',
              quantity: 20,
              symbol: 'SYM-C',
              valueInBaseCurrency: 2000
            },
            {
              allocationInHoldings: 0.1,
              allocationInPortfolio: 0.095,
              assetClass: 'COMMODITY',
              currency: 'USD',
              dataSource: 'MANUAL',
              marketPrice: 50,
              name: 'Asset D',
              quantity: 20,
              symbol: 'SYM-D',
              valueInBaseCurrency: 1000
            }
          ],
          totals: {
            activityCount: 30,
            cashInBaseCurrency: 500,
            holdingsCount: 4,
            holdingsValueInBaseCurrency: 10000,
            totalPortfolioValueInBaseCurrency: 10500
          },
          warnings: []
        };
      },
      inputSchema: PORTFOLIO_SUMMARY_INPUT_SCHEMA,
      name: 'get_portfolio_summary',
      outputSchema: PORTFOLIO_SUMMARY_OUTPUT_SCHEMA
    },
    {
      description: 'Return paginated transaction history.',
      execute: (input, context) => {
        log.push({
          input,
          toolName: 'get_transaction_history',
          userId: context.userId
        });

        return {
          page: {
            cursor: 0,
            hasMore: false,
            pageSize: 30,
            returnedCount: 5,
            totalCount: 30
          },
          summary: {
            buyValueInBaseCurrency: 9500,
            byType: { BUY: 30 },
            pageFeesInBaseCurrency: 0,
            pageValueInBaseCurrency: 1500,
            sellValueInBaseCurrency: 0
          },
          transactions: [
            {
              accountId: 'acc-1',
              accountName: 'Main',
              currency: 'USD',
              dataSource: 'MANUAL',
              date: '2025-01-01',
              fee: 0,
              feeInBaseCurrency: 0,
              id: 'tx-1',
              quantity: 2,
              symbol: 'SYM-A',
              type: 'BUY',
              unitPrice: 100,
              value: 200,
              valueInBaseCurrency: 200
            },
            {
              accountId: 'acc-1',
              accountName: 'Main',
              currency: 'USD',
              dataSource: 'MANUAL',
              date: '2025-01-02',
              fee: 0,
              feeInBaseCurrency: 0,
              id: 'tx-2',
              quantity: 3,
              symbol: 'SYM-B',
              type: 'BUY',
              unitPrice: 115,
              value: 345,
              valueInBaseCurrency: 345
            },
            {
              accountId: 'acc-1',
              accountName: 'Main',
              currency: 'USD',
              dataSource: 'MANUAL',
              date: '2025-01-03',
              fee: 0,
              feeInBaseCurrency: 0,
              id: 'tx-3',
              quantity: 1,
              symbol: 'SYM-C',
              type: 'BUY',
              unitPrice: 100,
              value: 100,
              valueInBaseCurrency: 100
            },
            {
              accountId: 'acc-1',
              accountName: 'Main',
              currency: 'USD',
              dataSource: 'MANUAL',
              date: '2025-01-04',
              fee: 0,
              feeInBaseCurrency: 0,
              id: 'tx-4',
              quantity: 2,
              symbol: 'SYM-D',
              type: 'BUY',
              unitPrice: 130,
              value: 260,
              valueInBaseCurrency: 260
            },
            {
              accountId: 'acc-1',
              accountName: 'Main',
              currency: 'USD',
              dataSource: 'MANUAL',
              date: '2025-01-05',
              fee: 0,
              feeInBaseCurrency: 0,
              id: 'tx-5',
              quantity: 3,
              symbol: 'SYM-A',
              type: 'BUY',
              unitPrice: 145,
              value: 435,
              valueInBaseCurrency: 435
            }
          ],
          warnings: []
        };
      },
      inputSchema: TRANSACTION_HISTORY_INPUT_SCHEMA,
      name: 'get_transaction_history',
      outputSchema: TRANSACTION_HISTORY_OUTPUT_SCHEMA
    },
    {
      description: 'Analyze portfolio risk exposures and concentration.',
      execute: (input, context) => {
        log.push({ input, toolName: 'analyze_risk', userId: context.userId });

        return {
          assumptions: ['Risk analysis based on current holdings only'],
          baseCurrency: 'USD',
          exposures: {
            assetClassExposures: [
              { allocationInPortfolio: 0.7, assetClass: 'EQUITY' },
              { allocationInPortfolio: 0.2, assetClass: 'BOND' },
              { allocationInPortfolio: 0.1, assetClass: 'COMMODITY' }
            ],
            sectorCoverageInPortfolio: 0,
            top3AllocationInPortfolio: 0.9,
            topHoldings: [
              {
                allocationInPortfolio: 0.4,
                assetClass: 'EQUITY',
                name: 'Asset A',
                symbol: 'SYM-A',
                valueInBaseCurrency: 4000
              },
              {
                allocationInPortfolio: 0.3,
                assetClass: 'EQUITY',
                name: 'Asset B',
                symbol: 'SYM-B',
                valueInBaseCurrency: 3000
              },
              {
                allocationInPortfolio: 0.2,
                assetClass: 'BOND',
                name: 'Asset C',
                symbol: 'SYM-C',
                valueInBaseCurrency: 2000
              }
            ],
            topSectorExposures: []
          },
          flags: [
            {
              code: 'single_position_concentration',
              description: 'SYM-A is 40% of portfolio',
              metricName: 'singlePositionPct',
              metricValue: 0.4,
              severity: 'high',
              threshold: 0.25,
              title: 'Single Position Concentration'
            }
          ],
          generatedAt: '2025-06-01T00:00:00.000Z',
          holdingsCount: 4,
          overallRiskLevel: 'MEDIUM',
          portfolioValueInBaseCurrency: 10000,
          volatilityProxyScore: 0.45,
          warnings: []
        };
      },
      inputSchema: ANALYZE_RISK_INPUT_SCHEMA,
      name: 'analyze_risk',
      outputSchema: ANALYZE_RISK_OUTPUT_SCHEMA
    },
    {
      description: 'Look up market data for a given symbol.',
      execute: (input, context) => {
        log.push({
          input,
          toolName: 'market_data_lookup',
          userId: context.userId
        });

        return {
          assetClass: 'EQUITY',
          assetSubClass: 'STOCK',
          countries: [{ code: 'US', weight: 1.0 }],
          currency: 'USD',
          dataSource: 'MANUAL',
          historicalData: [],
          marketPrice: 150,
          name: 'Asset A',
          priceChange: {
            absoluteChange: 3.67,
            percentChange: 0.025,
            periodDays: 1
          },
          priceUpdatedAt: '2025-06-01T00:00:00.000Z',
          sectors: [{ name: 'Technology', weight: 1.0 }],
          symbol: 'SYM-A',
          warnings: []
        };
      },
      inputSchema: MARKET_DATA_LOOKUP_INPUT_SCHEMA,
      name: 'market_data_lookup',
      outputSchema: MARKET_DATA_LOOKUP_OUTPUT_SCHEMA
    },
    {
      description: 'Compare portfolio performance against benchmarks.',
      execute: (input, context) => {
        log.push({
          input,
          toolName: 'performance_compare',
          userId: context.userId
        });

        return {
          assumptions: ['Returns are time-weighted'],
          baseCurrency: 'USD',
          benchmarks: [
            {
              dataSource: 'YAHOO',
              marketCondition: 'BULL',
              name: 'S&P 500',
              performances: {
                allTimeHigh: { date: '2025-05-15', performancePercent: -0.02 }
              },
              symbol: 'SPY',
              trend200d: 'UP',
              trend50d: 'UP'
            }
          ],
          comparison: {
            outperformingBenchmarks: [],
            underperformingBenchmarks: ['SPY']
          },
          dateRange: 'ytd',
          period: { endDate: '2025-06-01', startDate: '2025-01-01' },
          portfolio: {
            currentNetWorth: 10500,
            currentValueInBaseCurrency: 10000,
            firstOrderDate: '2025-01-01',
            hasErrors: false,
            netPerformance: 800,
            netPerformancePercentage: 0.08,
            netPerformancePercentageWithCurrencyEffect: 0.08,
            netPerformanceWithCurrencyEffect: 800,
            totalInvestment: 9500
          },
          warnings: []
        };
      },
      inputSchema: PERFORMANCE_COMPARE_INPUT_SCHEMA,
      name: 'performance_compare',
      outputSchema: PERFORMANCE_COMPARE_OUTPUT_SCHEMA
    },
    {
      description: 'Estimate taxes on realized gains.',
      execute: (input, context) => {
        log.push({ input, toolName: 'tax_estimate', userId: context.userId });

        return {
          assumptions: [
            'FIFO cost basis method',
            'Short-term = held < 12 months'
          ],
          baseCurrency: 'USD',
          disclaimers: ['This is an estimate, not tax advice'],
          jurisdiction: 'US',
          realizedGains: {
            longTerm: {
              gainInBaseCurrency: 200,
              lossInBaseCurrency: 0,
              netInBaseCurrency: 200,
              transactionCount: 1
            },
            shortTerm: {
              gainInBaseCurrency: 140,
              lossInBaseCurrency: 0,
              netInBaseCurrency: 140,
              transactionCount: 2
            },
            total: {
              gainInBaseCurrency: 340,
              lossInBaseCurrency: 0,
              netInBaseCurrency: 340,
              transactionCount: 3
            }
          },
          taxLossHarvestingCandidates: [],
          taxYear: 2025,
          warnings: []
        };
      },
      inputSchema: TAX_ESTIMATE_INPUT_SCHEMA,
      name: 'tax_estimate',
      outputSchema: TAX_ESTIMATE_OUTPUT_SCHEMA
    },
    {
      description: 'Check portfolio compliance against rules.',
      execute: (input, context) => {
        log.push({
          input,
          toolName: 'compliance_check',
          userId: context.userId
        });

        return {
          assumptions: ['Using default rule thresholds'],
          baseCurrency: 'USD',
          generatedAt: '2025-06-01T00:00:00.000Z',
          holdingsCount: 4,
          overallStatus: 'NON_COMPLIANT',
          portfolioValueInBaseCurrency: 10000,
          results: [
            {
              currentValue: 0.4,
              description: 'No single position exceeds 25%',
              details: 'SYM-A at 40%',
              ruleId: 'max_single_position',
              ruleName: 'Max Single Position',
              status: 'fail',
              threshold: 0.25
            }
          ],
          rulesChecked: 1,
          rulesFailed: 1,
          rulesPassed: 0,
          warnings: []
        };
      },
      inputSchema: COMPLIANCE_CHECK_INPUT_SCHEMA,
      name: 'compliance_check',
      outputSchema: COMPLIANCE_CHECK_OUTPUT_SCHEMA
    },
    {
      description: 'Suggest trades to rebalance the portfolio.',
      execute: (input, context) => {
        log.push({
          input,
          toolName: 'rebalance_suggest',
          userId: context.userId
        });

        return {
          assumptions: ['Equal weight strategy applied'],
          baseCurrency: 'USD',
          currentAllocations: [
            {
              currentPct: 0.4,
              currentValueInBaseCurrency: 4000,
              name: 'Asset A',
              symbol: 'SYM-A'
            },
            {
              currentPct: 0.3,
              currentValueInBaseCurrency: 3000,
              name: 'Asset B',
              symbol: 'SYM-B'
            },
            {
              currentPct: 0.2,
              currentValueInBaseCurrency: 2000,
              name: 'Asset C',
              symbol: 'SYM-C'
            },
            {
              currentPct: 0.1,
              currentValueInBaseCurrency: 1000,
              name: 'Asset D',
              symbol: 'SYM-D'
            }
          ],
          disclaimers: ['This is a suggestion, not financial advice'],
          generatedAt: '2025-06-01T00:00:00.000Z',
          portfolioValueInBaseCurrency: 10000,
          strategy: 'equal_weight',
          suggestedTrades: [
            {
              action: 'SELL',
              currentPct: 0.4,
              driftPct: 0.15,
              name: 'Asset A',
              quantityEstimate: 10,
              symbol: 'SYM-A',
              targetPct: 0.25,
              valueInBaseCurrency: 1500
            },
            {
              action: 'SELL',
              currentPct: 0.3,
              driftPct: 0.05,
              name: 'Asset B',
              quantityEstimate: 4.17,
              symbol: 'SYM-B',
              targetPct: 0.25,
              valueInBaseCurrency: 500
            },
            {
              action: 'BUY',
              currentPct: 0.2,
              driftPct: -0.05,
              name: 'Asset C',
              quantityEstimate: 5,
              symbol: 'SYM-C',
              targetPct: 0.25,
              valueInBaseCurrency: 500
            },
            {
              action: 'BUY',
              currentPct: 0.1,
              driftPct: -0.15,
              name: 'Asset D',
              quantityEstimate: 30,
              symbol: 'SYM-D',
              targetPct: 0.25,
              valueInBaseCurrency: 1500
            }
          ],
          summary: {
            constraintsApplied: [],
            estimatedTurnoverPct: 0.3,
            totalBuyValueInBaseCurrency: 2000,
            totalSellValueInBaseCurrency: 2000,
            totalTradesCount: 4,
            tradesLimitedByConstraints: false
          },
          targetAllocations: [
            {
              name: 'Asset A',
              symbol: 'SYM-A',
              targetPct: 0.25,
              targetValueInBaseCurrency: 2500,
              tradeAction: 'SELL' as const,
              tradeSuggested: true
            },
            {
              name: 'Asset B',
              symbol: 'SYM-B',
              targetPct: 0.25,
              targetValueInBaseCurrency: 2500,
              tradeAction: 'SELL' as const,
              tradeSuggested: true
            },
            {
              name: 'Asset C',
              symbol: 'SYM-C',
              targetPct: 0.25,
              targetValueInBaseCurrency: 2500,
              tradeAction: 'BUY' as const,
              tradeSuggested: true
            },
            {
              name: 'Asset D',
              symbol: 'SYM-D',
              targetPct: 0.25,
              targetValueInBaseCurrency: 2500,
              tradeAction: 'BUY' as const,
              tradeSuggested: true
            }
          ],
          warnings: []
        };
      },
      inputSchema: REBALANCE_SUGGEST_INPUT_SCHEMA,
      name: 'rebalance_suggest',
      outputSchema: REBALANCE_SUGGEST_OUTPUT_SCHEMA
    },
    {
      description: 'Simulate hypothetical trades against the portfolio.',
      execute: (input, context) => {
        log.push({
          input,
          toolName: 'simulate_trades',
          userId: context.userId
        });

        return {
          data: {
            status: 'success',
            portfolioBefore: {
              cashBalance: 500,
              positions: [
                {
                  allocationPct: 0.38,
                  symbol: 'SYM-A',
                  valueInBaseCurrency: 4000
                },
                {
                  allocationPct: 0.29,
                  symbol: 'SYM-B',
                  valueInBaseCurrency: 3000
                },
                {
                  allocationPct: 0.19,
                  symbol: 'SYM-C',
                  valueInBaseCurrency: 2000
                },
                {
                  allocationPct: 0.095,
                  symbol: 'SYM-D',
                  valueInBaseCurrency: 1000
                }
              ],
              totalValueInBaseCurrency: 10500
            },
            hypotheticalPortfolio: {
              cashBalance: 350,
              positions: [
                {
                  allocationPct: 0.33,
                  symbol: 'SYM-A',
                  valueInBaseCurrency: 3500
                },
                {
                  allocationPct: 0.33,
                  symbol: 'SYM-B',
                  valueInBaseCurrency: 3500
                },
                {
                  allocationPct: 0.19,
                  symbol: 'SYM-C',
                  valueInBaseCurrency: 2000
                },
                {
                  allocationPct: 0.14,
                  symbol: 'SYM-D',
                  valueInBaseCurrency: 1450
                }
              ],
              totalValueInBaseCurrency: 10450
            },
            tradeResults: [
              {
                acceptedQuantity: 10,
                action: 'sell',
                costInBaseCurrency: 1500,
                priceUsed: 150,
                requestedQuantity: 10,
                status: 'executed',
                symbol: 'SYM-A',
                warnings: []
              },
              {
                acceptedQuantity: 5,
                action: 'buy',
                costInBaseCurrency: 600,
                priceUsed: 120,
                requestedQuantity: 5,
                status: 'executed',
                symbol: 'SYM-B',
                warnings: []
              }
            ],
            impact: {
              allocationChanges: [
                {
                  changePct: -0.05,
                  currentPct: 0.38,
                  newPct: 0.33,
                  symbol: 'SYM-A'
                },
                {
                  changePct: 0.04,
                  currentPct: 0.29,
                  newPct: 0.33,
                  symbol: 'SYM-B'
                }
              ],
              cashDelta: -150,
              concentrationWarnings: [],
              totalValueChangeInBaseCurrency: -50
            },
            disclaimers: ['Hypothetical simulation only.'],
            warnings: []
          },
          status: 'success'
        };
      },
      inputSchema: SIMULATE_TRADES_INPUT_SCHEMA,
      name: 'simulate_trades',
      outputSchema: SIMULATE_TRADES_OUTPUT_SCHEMA
    },
    {
      description: 'Run portfolio stress tests against predefined scenarios.',
      execute: (input, context) => {
        log.push({
          input,
          toolName: 'stress_test',
          userId: context.userId
        });

        return {
          data: {
            status: 'success',
            scenario: {
              description:
                'Simulates a 2008-style financial crisis: equities -50%, bonds +5%, commodities +25%, real estate -35%.',
              id: 'market_crash_2008',
              name: '2008 Financial Crisis',
              shocks: [
                { assetClass: 'EQUITY', shockPercent: -0.3 },
                { assetClass: 'BOND', shockPercent: -0.05 }
              ]
            },
            currentValueInBaseCurrency: 10500,
            stressedValueInBaseCurrency: 8500,
            totalLossInBaseCurrency: 2000,
            totalLossPct: 0.19,
            positionImpacts: [
              {
                currentValueInBaseCurrency: 4000,
                lossInBaseCurrency: 1200,
                lossPct: 0.3,
                stressedValueInBaseCurrency: 2800,
                symbol: 'SYM-A'
              },
              {
                currentValueInBaseCurrency: 3000,
                lossInBaseCurrency: 750,
                lossPct: 0.25,
                stressedValueInBaseCurrency: 2250,
                symbol: 'SYM-B'
              }
            ],
            assetClassImpacts: [
              {
                currentValueInBaseCurrency: 7000,
                lossPct: 0.3,
                name: 'EQUITY',
                stressedValueInBaseCurrency: 4900
              },
              {
                currentValueInBaseCurrency: 2000,
                lossPct: 0.05,
                name: 'BOND',
                stressedValueInBaseCurrency: 1900
              }
            ],
            mostVulnerable: [{ lossPct: 0.3, symbol: 'SYM-A' }],
            recoveryNeededPct: 0.25,
            disclaimers: ['Stress test results are hypothetical.'],
            warnings: []
          },
          status: 'success'
        };
      },
      inputSchema: STRESS_TEST_INPUT_SCHEMA,
      name: 'stress_test',
      outputSchema: STRESS_TEST_OUTPUT_SCHEMA
    }
  ];
}

// ─── Empty Profile ─────────────────────────────────────────────────────────────

function buildEmptyProfileTools(log: ToolInvocationEntry[]): ToolDefinition[] {
  return [
    {
      description:
        'Return portfolio totals, allocation percentages and top holdings.',
      execute: (input, context) => {
        log.push({
          input,
          toolName: 'get_portfolio_summary',
          userId: context.userId
        });

        return {
          baseCurrency: 'USD',
          generatedAt: '2025-06-01T00:00:00.000Z',
          latestActivityDate: '',
          snapshotCreatedAt: '',
          topHoldings: [],
          totals: {
            activityCount: 0,
            cashInBaseCurrency: 0,
            holdingsCount: 0,
            holdingsValueInBaseCurrency: 0,
            totalPortfolioValueInBaseCurrency: 0
          },
          warnings: [
            {
              code: 'no_holdings_data',
              message: 'No holdings were found for this user.'
            }
          ]
        };
      },
      inputSchema: PORTFOLIO_SUMMARY_INPUT_SCHEMA,
      name: 'get_portfolio_summary',
      outputSchema: PORTFOLIO_SUMMARY_OUTPUT_SCHEMA
    },
    {
      description: 'Return paginated transaction history.',
      execute: (input, context) => {
        log.push({
          input,
          toolName: 'get_transaction_history',
          userId: context.userId
        });

        return {
          page: {
            cursor: 0,
            hasMore: false,
            pageSize: 25,
            returnedCount: 0,
            totalCount: 0
          },
          summary: {
            buyValueInBaseCurrency: 0,
            byType: {},
            pageFeesInBaseCurrency: 0,
            pageValueInBaseCurrency: 0,
            sellValueInBaseCurrency: 0
          },
          transactions: [],
          warnings: [
            { code: 'no_activity_history', message: 'No transactions found.' }
          ]
        };
      },
      inputSchema: TRANSACTION_HISTORY_INPUT_SCHEMA,
      name: 'get_transaction_history',
      outputSchema: TRANSACTION_HISTORY_OUTPUT_SCHEMA
    },
    {
      description: 'Analyze portfolio risk exposures and concentration.',
      execute: (input, context) => {
        log.push({ input, toolName: 'analyze_risk', userId: context.userId });

        return {
          assumptions: [],
          baseCurrency: 'USD',
          exposures: {
            assetClassExposures: [],
            sectorCoverageInPortfolio: 0,
            top3AllocationInPortfolio: 0,
            topHoldings: [],
            topSectorExposures: []
          },
          flags: [],
          generatedAt: '2025-06-01T00:00:00.000Z',
          holdingsCount: 0,
          overallRiskLevel: 'LOW',
          portfolioValueInBaseCurrency: 0,
          volatilityProxyScore: 0,
          warnings: [
            { code: 'no_holdings_data', message: 'No holdings to analyze.' }
          ]
        };
      },
      inputSchema: ANALYZE_RISK_INPUT_SCHEMA,
      name: 'analyze_risk',
      outputSchema: ANALYZE_RISK_OUTPUT_SCHEMA
    },
    {
      description: 'Look up market data for a given symbol.',
      execute: (input, context) => {
        log.push({
          input,
          toolName: 'market_data_lookup',
          userId: context.userId
        });

        return {
          assetClass: '',
          assetSubClass: '',
          countries: [],
          currency: '',
          dataSource: '',
          historicalData: [],
          marketPrice: 0,
          name: '',
          priceChange: { absoluteChange: 0, percentChange: 0, periodDays: 0 },
          priceUpdatedAt: '',
          sectors: [],
          symbol: '',
          warnings: [{ code: 'no_data', message: 'No market data available.' }]
        };
      },
      inputSchema: MARKET_DATA_LOOKUP_INPUT_SCHEMA,
      name: 'market_data_lookup',
      outputSchema: MARKET_DATA_LOOKUP_OUTPUT_SCHEMA
    },
    {
      description: 'Compare portfolio performance against benchmarks.',
      execute: (input, context) => {
        log.push({
          input,
          toolName: 'performance_compare',
          userId: context.userId
        });

        return {
          assumptions: [],
          baseCurrency: 'USD',
          benchmarks: [],
          comparison: {
            outperformingBenchmarks: [],
            underperformingBenchmarks: []
          },
          dateRange: 'ytd',
          period: { endDate: '', startDate: '' },
          portfolio: {
            currentNetWorth: 0,
            currentValueInBaseCurrency: 0,
            firstOrderDate: '',
            hasErrors: false,
            netPerformance: 0,
            netPerformancePercentage: 0,
            netPerformancePercentageWithCurrencyEffect: 0,
            netPerformanceWithCurrencyEffect: 0,
            totalInvestment: 0
          },
          warnings: [
            { code: 'no_holdings_data', message: 'No holdings to compare.' }
          ]
        };
      },
      inputSchema: PERFORMANCE_COMPARE_INPUT_SCHEMA,
      name: 'performance_compare',
      outputSchema: PERFORMANCE_COMPARE_OUTPUT_SCHEMA
    },
    {
      description: 'Estimate taxes on realized gains.',
      execute: (input, context) => {
        log.push({ input, toolName: 'tax_estimate', userId: context.userId });

        return {
          assumptions: [],
          baseCurrency: 'USD',
          disclaimers: [],
          jurisdiction: 'US',
          realizedGains: {
            longTerm: {
              gainInBaseCurrency: 0,
              lossInBaseCurrency: 0,
              netInBaseCurrency: 0,
              transactionCount: 0
            },
            shortTerm: {
              gainInBaseCurrency: 0,
              lossInBaseCurrency: 0,
              netInBaseCurrency: 0,
              transactionCount: 0
            },
            total: {
              gainInBaseCurrency: 0,
              lossInBaseCurrency: 0,
              netInBaseCurrency: 0,
              transactionCount: 0
            }
          },
          taxLossHarvestingCandidates: [],
          taxYear: 2025,
          warnings: [
            {
              code: 'no_activity_history',
              message: 'No transactions for tax estimation.'
            }
          ]
        };
      },
      inputSchema: TAX_ESTIMATE_INPUT_SCHEMA,
      name: 'tax_estimate',
      outputSchema: TAX_ESTIMATE_OUTPUT_SCHEMA
    },
    {
      description: 'Check portfolio compliance against rules.',
      execute: (input, context) => {
        log.push({
          input,
          toolName: 'compliance_check',
          userId: context.userId
        });

        return {
          assumptions: [],
          baseCurrency: 'USD',
          generatedAt: '2025-06-01T00:00:00.000Z',
          holdingsCount: 0,
          overallStatus: 'NEEDS_REVIEW',
          portfolioValueInBaseCurrency: 0,
          results: [],
          rulesChecked: 0,
          rulesFailed: 0,
          rulesPassed: 0,
          warnings: [
            { code: 'no_holdings_data', message: 'No holdings to check.' }
          ]
        };
      },
      inputSchema: COMPLIANCE_CHECK_INPUT_SCHEMA,
      name: 'compliance_check',
      outputSchema: COMPLIANCE_CHECK_OUTPUT_SCHEMA
    },
    {
      description: 'Suggest trades to rebalance the portfolio.',
      execute: (input, context) => {
        log.push({
          input,
          toolName: 'rebalance_suggest',
          userId: context.userId
        });

        return {
          assumptions: [],
          baseCurrency: 'USD',
          currentAllocations: [],
          disclaimers: [],
          generatedAt: '2025-06-01T00:00:00.000Z',
          portfolioValueInBaseCurrency: 0,
          strategy: 'equal_weight',
          suggestedTrades: [],
          summary: {
            constraintsApplied: [],
            estimatedTurnoverPct: 0,
            totalBuyValueInBaseCurrency: 0,
            totalSellValueInBaseCurrency: 0,
            totalTradesCount: 0,
            tradesLimitedByConstraints: false
          },
          targetAllocations: [],
          warnings: [
            { code: 'no_holdings_data', message: 'No holdings to rebalance.' }
          ]
        };
      },
      inputSchema: REBALANCE_SUGGEST_INPUT_SCHEMA,
      name: 'rebalance_suggest',
      outputSchema: REBALANCE_SUGGEST_OUTPUT_SCHEMA
    },
    {
      description: 'Simulate hypothetical trades against the portfolio.',
      execute: (input, context) => {
        log.push({
          input,
          toolName: 'simulate_trades',
          userId: context.userId
        });

        return {
          data: {
            status: 'partial',
            portfolioBefore: {
              cashBalance: 0,
              positions: [],
              totalValueInBaseCurrency: 0
            },
            hypotheticalPortfolio: {
              cashBalance: 0,
              positions: [],
              totalValueInBaseCurrency: 0
            },
            tradeResults: [],
            impact: {
              allocationChanges: [],
              cashDelta: 0,
              concentrationWarnings: [],
              totalValueChangeInBaseCurrency: 0
            },
            disclaimers: ['Hypothetical simulation only.'],
            warnings: [
              { code: 'no_holdings_data', message: 'No holdings to simulate.' }
            ]
          },
          status: 'partial'
        };
      },
      inputSchema: SIMULATE_TRADES_INPUT_SCHEMA,
      name: 'simulate_trades',
      outputSchema: SIMULATE_TRADES_OUTPUT_SCHEMA
    },
    {
      description: 'Run portfolio stress tests against predefined scenarios.',
      execute: (input, context) => {
        log.push({
          input,
          toolName: 'stress_test',
          userId: context.userId
        });

        return {
          data: {
            status: 'partial',
            scenario: {
              description: 'No holdings available for stress testing.',
              id: 'market_crash_2008',
              name: '2008 Financial Crisis',
              shocks: [{ assetClass: 'EQUITY', shockPercent: -0.3 }]
            },
            currentValueInBaseCurrency: 0,
            stressedValueInBaseCurrency: 0,
            totalLossInBaseCurrency: 0,
            totalLossPct: 0,
            positionImpacts: [],
            assetClassImpacts: [],
            mostVulnerable: [],
            recoveryNeededPct: 0,
            disclaimers: ['Stress test results are hypothetical.'],
            warnings: [
              {
                code: 'no_holdings_data',
                message: 'No holdings to stress test.'
              }
            ]
          },
          status: 'partial'
        };
      },
      inputSchema: STRESS_TEST_INPUT_SCHEMA,
      name: 'stress_test',
      outputSchema: STRESS_TEST_OUTPUT_SCHEMA
    }
  ];
}
