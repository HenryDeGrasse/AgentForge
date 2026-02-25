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

    // actual field: assetClassExposures (plural), value: allocationInPortfolio (decimal 0-1)
    const assetClassExposure =
      data['assetClassExposures'] ?? data['assetClassExposure'];

    if (Array.isArray(assetClassExposure) && assetClassExposure.length > 0) {
      charts.push({
        chartType: 'doughnut',
        data: {
          items: assetClassExposure
            .slice(0, ChartDataExtractorService.MAX_DOUGHNUT_ITEMS)
            .map((e: Record<string, unknown>) => ({
              name: String(e['assetClass'] ?? e['name'] ?? 'Unknown'),
              value:
                Math.round(
                  Number(
                    e['allocationInPortfolio'] ??
                      e['percentage'] ??
                      e['value'] ??
                      0
                  ) *
                    100 *
                    100
                ) / 100
            }))
        },
        label: 'Asset Class Exposure',
        toolName: 'analyze_risk'
      });
    }

    // actual field: topSectorExposures, value: allocationInPortfolio (decimal 0-1)
    const sectorExposure = data['topSectorExposures'] ?? data['sectorExposure'];

    if (Array.isArray(sectorExposure) && sectorExposure.length > 0) {
      charts.push({
        chartType: 'horizontalBar',
        data: {
          items: sectorExposure
            .slice(0, 5)
            .map((s: Record<string, unknown>) => ({
              name: String(s['sector'] ?? s['name'] ?? 'Unknown'),
              value:
                Math.round(
                  Number(
                    s['allocationInPortfolio'] ??
                      s['percentage'] ??
                      s['value'] ??
                      0
                  ) *
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
            value: Number(p['close'] ?? p['price'] ?? p['value'] ?? 0)
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
              String(t['currentPercentage'] ?? t['current'] ?? ''),
              String(t['targetPercentage'] ?? t['target'] ?? ''),
              String(t['drift'] ?? t['driftPercentage'] ?? '')
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

    return [
      {
        chartType: 'table',
        data: {
          columns: ['Category', 'Amount'],
          rows: [
            ['Short-Term Gains', String(gainsObj['shortTerm'] ?? '$0')],
            ['Long-Term Gains', String(gainsObj['longTerm'] ?? '$0')],
            ['Total', String(gainsObj['total'] ?? '$0')]
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
    const rules = data['rules'] ?? data['results'];

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
              String(r['name'] ?? r['rule'] ?? ''),
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
    const comparison = data['comparison'] ?? data['results'];

    if (!Array.isArray(comparison) || comparison.length === 0) {
      // Try flat shape: { portfolioReturn, benchmarkReturn }
      if (
        data['portfolioReturn'] !== undefined &&
        data['benchmarkReturn'] !== undefined
      ) {
        return [
          {
            chartType: 'horizontalBar',
            data: {
              items: [
                {
                  name: 'Portfolio',
                  value: Number(data['portfolioReturn'])
                },
                {
                  name: String(data['benchmarkName'] ?? 'Benchmark'),
                  value: Number(data['benchmarkReturn'])
                }
              ]
            },
            label: 'Performance Comparison',
            toolName: 'performance_compare'
          }
        ];
      }

      return [];
    }

    return [
      {
        chartType: 'horizontalBar',
        data: {
          items: comparison.slice(0, 5).map((c: Record<string, unknown>) => ({
            name: String(c['name'] ?? c['label'] ?? 'Unknown'),
            value: Number(c['return'] ?? c['performance'] ?? c['value'] ?? 0)
          }))
        },
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
              String(t['price'] ?? t['unitPrice'] ?? '')
            ])
        },
        label: 'Transaction History',
        toolName: 'get_transaction_history'
      }
    ];
  }
}
