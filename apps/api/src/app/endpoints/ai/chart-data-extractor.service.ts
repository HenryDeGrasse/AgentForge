import { ExecutedToolEntry } from '@ghostfolio/api/app/endpoints/ai/agent/react-agent.service';
import type { ChartDataItem } from '@ghostfolio/common/interfaces';

import { Injectable } from '@nestjs/common';

/**
 * Pure deterministic service — no LLM involvement.
 * Extracts chart-worthy data from tool result envelopes.
 * Never throws; returns [] on malformed/unknown shapes.
 */
@Injectable()
export class ChartDataExtractorService {
  private static readonly MAX_DOUGHNUT_ITEMS = 10;
  private static readonly MAX_LINE_POINTS = 180;
  private static readonly MAX_TABLE_ROWS = 20;

  public extract(executedTools: ExecutedToolEntry[]): ChartDataItem[] {
    const charts: ChartDataItem[] = [];

    for (const entry of executedTools) {
      if (
        entry.envelope.status !== 'success' &&
        entry.envelope.status !== 'partial'
      ) {
        continue;
      }

      try {
        const items = this.extractForTool(entry.toolName, entry.envelope.data);
        charts.push(...items);
      } catch {
        // Skip malformed tool results — never break the response
      }
    }

    return charts;
  }

  private extractForTool(
    toolName: string,
    data: Record<string, unknown> | undefined
  ): ChartDataItem[] {
    if (!data) {
      return [];
    }

    switch (toolName) {
      case 'get_portfolio_summary':
        return this.extractPortfolioSummary(data);
      case 'analyze_risk':
        return this.extractRiskAnalysis(data);
      case 'market_data_lookup':
        return this.extractMarketData(data);
      case 'rebalance_suggest':
        return this.extractRebalanceSuggestions(data);
      case 'tax_estimate':
        return this.extractTaxEstimate(data);
      case 'compliance_check':
        return this.extractComplianceCheck(data);
      case 'performance_compare':
        return this.extractPerformanceCompare(data);
      case 'get_transaction_history':
        return this.extractTransactionHistory(data);
      case 'simulate_trades':
        return this.extractSimulateTrades(data);
      case 'stress_test':
        return this.extractStressTest(data);
      default:
        return [];
    }
  }

  private extractPortfolioSummary(
    data: Record<string, unknown>
  ): ChartDataItem[] {
    const holdings = data['topHoldings'] ?? data['holdings'];

    if (!Array.isArray(holdings) || holdings.length === 0) {
      return [];
    }

    const items = holdings
      .slice(0, ChartDataExtractorService.MAX_DOUGHNUT_ITEMS)
      .map((h: Record<string, unknown>) => ({
        name: String(h['name'] ?? h['symbol'] ?? 'Unknown'),
        // allocationInPortfolio is a decimal (0-1); multiply by 100 for %
        value:
          Math.round(
            Number(
              h['allocationInPortfolio'] ??
                h['allocationPercentage'] ??
                h['allocation'] ??
                0
            ) *
              100 *
              100
          ) / 100
      }));

    // Add "Other" bucket if truncated
    if (holdings.length > ChartDataExtractorService.MAX_DOUGHNUT_ITEMS) {
      const shownTotal = items.reduce(
        (sum: number, i: { value: number }) => sum + i.value,
        0
      );
      const otherValue = Math.max(0, 100 - shownTotal);

      if (otherValue > 0) {
        items.push({ name: 'Other', value: otherValue });
      }
    }

    return [
      {
        chartType: 'doughnut',
        data: { items },
        label: 'Portfolio Allocation',
        toolName: 'get_portfolio_summary'
      }
    ];
  }

  private extractRiskAnalysis(data: Record<string, unknown>): ChartDataItem[] {
    const charts: ChartDataItem[] = [];

    // analyze_risk nests exposure arrays inside data.exposures — read from there.
    // Bug fixed: previously accessed data['assetClassExposures'] (top-level) which
    // was always undefined since the real path is data.exposures.assetClassExposures.
    const exposures = data['exposures'] as Record<string, unknown> | undefined;

    const assetClassExposure = exposures?.['assetClassExposures'];

    if (Array.isArray(assetClassExposure) && assetClassExposure.length > 0) {
      charts.push({
        chartType: 'doughnut',
        data: {
          items: assetClassExposure
            .slice(0, ChartDataExtractorService.MAX_DOUGHNUT_ITEMS)
            .map((e: Record<string, unknown>) => ({
              name: String(e['assetClass'] ?? e['name'] ?? 'Unknown'),
              // allocationInPortfolio is decimal (0-1); multiply by 100 for %
              value:
                Math.round(
                  Number(e['allocationInPortfolio'] ?? e['percentage'] ?? 0) *
                    100 *
                    100
                ) / 100
            }))
        },
        label: 'Asset Class Exposure',
        toolName: 'analyze_risk'
      });
    }

    // Bug fixed: previously accessed data['topSectorExposures'] (top-level) which
    // was always undefined since the real path is data.exposures.topSectorExposures.
    const sectorExposure = exposures?.['topSectorExposures'];

    if (Array.isArray(sectorExposure) && sectorExposure.length > 0) {
      charts.push({
        chartType: 'horizontalBar',
        data: {
          items: sectorExposure
            .slice(0, 5)
            .map((s: Record<string, unknown>) => ({
              name: String(s['sector'] ?? s['name'] ?? 'Unknown'),
              // allocationInPortfolio is decimal (0-1); multiply by 100 for %
              value:
                Math.round(
                  Number(s['allocationInPortfolio'] ?? s['percentage'] ?? 0) *
                    100 *
                    100
                ) / 100
            }))
        },
        label: 'Top Sector Exposure',
        toolName: 'analyze_risk'
      });
    }

    return charts;
  }

  private extractMarketData(data: Record<string, unknown>): ChartDataItem[] {
    const historical = data['historicalData'] ?? data['history'];

    if (!Array.isArray(historical) || historical.length === 0) {
      return [];
    }

    // Downsample if too long
    let points = historical;

    if (points.length > ChartDataExtractorService.MAX_LINE_POINTS) {
      const step = points.length / ChartDataExtractorService.MAX_LINE_POINTS;
      points = Array.from(
        { length: ChartDataExtractorService.MAX_LINE_POINTS },
        (_, i) =>
          historical[Math.min(Math.floor(i * step), historical.length - 1)]
      );
    }

    return [
      {
        chartType: 'line',
        data: {
          items: points.map((p: Record<string, unknown>) => ({
            date: String(p['date'] ?? ''),
            // Bug fixed: tool returns `marketPrice`, not `close` or `price`.
            // Added marketPrice as the primary lookup key.
            value: Number(
              p['marketPrice'] ?? p['close'] ?? p['price'] ?? p['value'] ?? 0
            )
          }))
        },
        label: String(data['symbol'] ?? 'Market Data'),
        toolName: 'market_data_lookup'
      }
    ];
  }

  private extractRebalanceSuggestions(
    data: Record<string, unknown>
  ): ChartDataItem[] {
    const trades = data['suggestedTrades'] ?? data['trades'];

    if (!Array.isArray(trades) || trades.length === 0) {
      return [];
    }

    return [
      {
        chartType: 'table',
        data: {
          columns: ['Symbol', 'Action', 'Current %', 'Target %', 'Drift %'],
          rows: trades
            .slice(0, ChartDataExtractorService.MAX_TABLE_ROWS)
            .map((t: Record<string, unknown>) => [
              String(t['symbol'] ?? ''),
              String(t['action'] ?? ''),
              // Bug fixed: tool uses currentPct/targetPct/driftPct, not
              // currentPercentage/targetPercentage/drift/driftPercentage.
              String(
                t['currentPct'] ?? t['currentPercentage'] ?? t['current'] ?? ''
              ),
              String(
                t['targetPct'] ?? t['targetPercentage'] ?? t['target'] ?? ''
              ),
              String(t['driftPct'] ?? t['drift'] ?? t['driftPercentage'] ?? '')
            ])
        },
        label: 'Suggested Trades',
        toolName: 'rebalance_suggest'
      }
    ];
  }

  private extractTaxEstimate(data: Record<string, unknown>): ChartDataItem[] {
    const gains = data['realizedGains'] ?? data['gains'];

    if (!gains || typeof gains !== 'object') {
      return [];
    }

    const gainsObj = gains as Record<string, unknown>;

    // Bug fixed: shortTerm/longTerm/total are bucket OBJECTS, not scalars.
    // Stringify them directly produced "[object Object]".
    // Now we read the netInBaseCurrency field from each bucket.
    const bucketNet = (key: string): string => {
      const bucket = gainsObj[key] as Record<string, unknown> | undefined;

      if (bucket && typeof bucket === 'object') {
        return String(bucket['netInBaseCurrency'] ?? 0);
      }

      // Fallback: if it's already a primitive (e.g. legacy shape)
      return String(gainsObj[key] ?? '$0');
    };

    return [
      {
        chartType: 'table',
        data: {
          columns: ['Category', 'Net Amount'],
          rows: [
            ['Short-Term Gains', bucketNet('shortTerm')],
            ['Long-Term Gains', bucketNet('longTerm')],
            ['Total', bucketNet('total')]
          ]
        },
        label: 'Tax Estimate',
        toolName: 'tax_estimate'
      }
    ];
  }

  private extractComplianceCheck(
    data: Record<string, unknown>
  ): ChartDataItem[] {
    // Tool output field is `results`, not `rules`
    const rules = data['results'] ?? data['rules'];

    if (!Array.isArray(rules) || rules.length === 0) {
      return [];
    }

    return [
      {
        chartType: 'table',
        data: {
          columns: ['Rule', 'Status', 'Current', 'Threshold'],
          rows: rules
            .slice(0, ChartDataExtractorService.MAX_TABLE_ROWS)
            .map((r: Record<string, unknown>) => [
              // Bug fixed: tool uses `ruleName`, not `name` or `rule`.
              String(r['ruleName'] ?? r['name'] ?? r['rule'] ?? ''),
              String(r['status'] ?? ''),
              String(r['currentValue'] ?? r['current'] ?? ''),
              String(r['threshold'] ?? '')
            ])
        },
        label: 'Compliance Results',
        toolName: 'compliance_check'
      }
    ];
  }

  private extractPerformanceCompare(
    data: Record<string, unknown>
  ): ChartDataItem[] {
    // Bug fixed: the old code looked for data['comparison'] (an object, not array)
    // or flat portfolioReturn/benchmarkReturn fields — neither matched the real shape.
    // Real shape: data.portfolio.netPerformancePercentage + data.benchmarks[].
    const portfolio = data['portfolio'] as Record<string, unknown> | undefined;

    if (!portfolio) {
      return [];
    }

    const items: { name: string; value: number }[] = [];

    // Portfolio period return (already a whole-number %)
    const portfolioReturn = Number(portfolio['netPerformancePercentage'] ?? 0);

    items.push({ name: 'Portfolio', value: portfolioReturn });

    // Benchmark ATH performance (what's available in the tool output)
    const benchmarks = data['benchmarks'];

    if (Array.isArray(benchmarks)) {
      for (const b of benchmarks.slice(0, 4)) {
        const bench = b as Record<string, unknown>;
        const perfs = bench['performances'] as
          | Record<string, unknown>
          | undefined;
        const ath = perfs?.['allTimeHigh'] as
          | Record<string, unknown>
          | undefined;

        items.push({
          name: String(bench['name'] ?? bench['symbol'] ?? 'Benchmark'),
          value: Number(ath?.['performancePercent'] ?? 0)
        });
      }
    }

    return [
      {
        chartType: 'horizontalBar',
        data: { items },
        label: 'Performance Comparison',
        toolName: 'performance_compare'
      }
    ];
  }

  private extractTransactionHistory(
    data: Record<string, unknown>
  ): ChartDataItem[] {
    const transactions = data['transactions'] ?? data['items'];

    if (!Array.isArray(transactions) || transactions.length === 0) {
      return [];
    }

    return [
      {
        chartType: 'table',
        data: {
          columns: ['Date', 'Type', 'Symbol', 'Quantity', 'Price'],
          rows: transactions
            .slice(0, ChartDataExtractorService.MAX_TABLE_ROWS)
            .map((t: Record<string, unknown>) => [
              String(t['date'] ?? ''),
              String(t['type'] ?? ''),
              String(t['symbol'] ?? ''),
              String(t['quantity'] ?? ''),
              String(t['unitPrice'] ?? t['price'] ?? '')
            ])
        },
        label: 'Transaction History',
        toolName: 'get_transaction_history'
      }
    ];
  }

  private extractSimulateTrades(
    data: Record<string, unknown>
  ): ChartDataItem[] {
    const charts: ChartDataItem[] = [];

    // Before allocation chart
    const before = data['portfolioBefore'] as Record<string, unknown>;

    if (before) {
      const positions = before['positions'];

      if (Array.isArray(positions) && positions.length > 0) {
        charts.push({
          chartType: 'doughnut',
          data: {
            items: positions
              .slice(0, ChartDataExtractorService.MAX_DOUGHNUT_ITEMS)
              .map((p: Record<string, unknown>) => ({
                name: String(p['symbol'] ?? 'Unknown'),
                value:
                  Math.round(Number(p['allocationPct'] ?? 0) * 100 * 100) / 100
              }))
          },
          label: 'Current Allocation',
          toolName: 'simulate_trades'
        });
      }
    }

    // After allocation chart
    const after = data['hypotheticalPortfolio'] as Record<string, unknown>;

    if (after) {
      const positions = after['positions'];

      if (Array.isArray(positions) && positions.length > 0) {
        charts.push({
          chartType: 'doughnut',
          data: {
            items: positions
              .slice(0, ChartDataExtractorService.MAX_DOUGHNUT_ITEMS)
              .map((p: Record<string, unknown>) => ({
                name: String(p['symbol'] ?? 'Unknown'),
                value:
                  Math.round(Number(p['allocationPct'] ?? 0) * 100 * 100) / 100
              }))
          },
          label: 'Hypothetical Allocation',
          toolName: 'simulate_trades'
        });
      }
    }

    return charts;
  }

  private extractStressTest(data: Record<string, unknown>): ChartDataItem[] {
    const charts: ChartDataItem[] = [];

    // Position losses chart
    const positionImpacts = data['positionImpacts'];

    if (Array.isArray(positionImpacts) && positionImpacts.length > 0) {
      charts.push({
        chartType: 'horizontalBar',
        data: {
          items: positionImpacts
            .slice(0, ChartDataExtractorService.MAX_DOUGHNUT_ITEMS)
            .map((p: Record<string, unknown>) => ({
              name: String(p['symbol'] ?? 'Unknown'),
              value: Math.round(Number(p['lossPct'] ?? 0) * 100) / 100
            }))
        },
        label:
          String(
            (data['scenario'] as Record<string, unknown>)?.['name'] ??
              'Stress Test'
          ) + ' — Position Losses (%)',
        toolName: 'stress_test'
      });
    }

    // Asset class aggregation chart
    const assetClassImpacts = data['assetClassImpacts'];

    if (Array.isArray(assetClassImpacts) && assetClassImpacts.length > 0) {
      charts.push({
        chartType: 'horizontalBar',
        data: {
          items: assetClassImpacts.map((a: Record<string, unknown>) => ({
            name: String(a['name'] ?? 'Unknown'),
            value: Math.round(Number(a['lossPct'] ?? 0) * 100) / 100
          }))
        },
        label: 'Asset Class Impact (%)',
        toolName: 'stress_test'
      });
    }

    return charts;
  }
}
