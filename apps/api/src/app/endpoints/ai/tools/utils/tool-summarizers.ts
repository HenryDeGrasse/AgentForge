/**
 * Deterministic tool output summarizers.
 *
 * Each tool gets a summarizer that extracts key facts from its output and
 * produces a human-readable `[SUMMARY]` block. The LLM receives the summary
 * plus truncated raw JSON for detail lookups. Full JSON stays in the envelope
 * for WS-1 citation checking.
 */

/**
 * Maximum characters of raw JSON appended after the summary.
 * Keeps the combined content within AGENT_TOOL_OUTPUT_MAX_CHARS.
 */
export const SUMMARY_RAW_CHARS = 16_000;

type Summarizer = (output: unknown) => string;

// ─── Per-tool summarizers ──────────────────────────────────────────────

function summarizePortfolioSummary(output: unknown): string {
  const data = output as Record<string, unknown> | null;

  if (!data || typeof data !== 'object') {
    return '[SUMMARY] Portfolio summary: no data available.';
  }

  const holdings = Array.isArray(data.holdings) ? data.holdings : [];
  const totalHoldings = data.totalHoldings ?? holdings.length;
  const baseCurrency = data.baseCurrency ?? 'N/A';
  const totalValue = data.totalValueInBaseCurrency;
  const cash = data.cash;

  const totalLine =
    totalValue != null
      ? ` Total: $${Number(totalValue).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`
      : '';

  const cashLine =
    cash != null && Number(cash) > 0
      ? ` Cash: $${Number(cash).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`
      : '';

  // List ALL holdings (not just top 5) with dollar values to prevent
  // the LLM from digging through raw JSON and producing garbled output.
  const holdingLines = holdings
    .map((h: Record<string, unknown>) => {
      const symbol = h.symbol ?? 'N/A';
      const name = h.name ?? symbol;
      const alloc =
        h.allocationPercentage != null
          ? `${Number(h.allocationPercentage).toFixed(1)}%`
          : 'N/A';
      const value =
        h.valueInBaseCurrency != null
          ? `$${Number(h.valueInBaseCurrency).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : 'N/A';
      const assetType = h.assetSubClass ?? h.assetClass ?? '';

      return `  - ${symbol} (${name}): ${alloc} — ${value}${assetType ? ` [${assetType}]` : ''}`;
    })
    .join('\n');

  return [
    `[SUMMARY] Portfolio: ${totalHoldings} holdings in ${baseCurrency}.${totalLine}${cashLine}`,
    holdingLines
      ? `Holdings:\n${holdingLines}`
      : 'No holding details available.'
  ].join('\n');
}

function summarizeAnalyzeRisk(output: unknown): string {
  const data = output as Record<string, unknown> | null;

  if (!data || typeof data !== 'object') {
    return '[SUMMARY] Risk analysis: no data available.';
  }

  const level = data.overallRiskLevel ?? 'UNKNOWN';
  const volProxy = data.volatilityProxyScore;
  const holdingsCount = data.holdingsCount ?? 'N/A';

  const lines = [
    `[SUMMARY] Risk level: ${level}. Holdings: ${holdingsCount}. Volatility proxy: ${volProxy != null ? Number(volProxy).toFixed(2) : 'N/A'}.`
  ];

  // Flags
  const flags = Array.isArray(data.flags) ? data.flags : [];

  if (flags.length > 0) {
    const flagLines = flags.map(
      (f: Record<string, unknown>) =>
        `  ⚠ ${f.title} (${f.severity}): ${f.metricName}=${Number(f.metricValue ?? 0).toFixed(2)}, threshold=${Number(f.threshold ?? 0).toFixed(2)}`
    );

    lines.push(`Risk flags:\n${flagLines.join('\n')}`);
  }

  // Top holdings exposure
  const exposures = data.exposures as Record<string, unknown> | undefined;

  if (exposures) {
    const topHoldings = Array.isArray(exposures.topHoldings)
      ? exposures.topHoldings
      : [];
    const holdingLines = topHoldings
      .slice(0, 5)
      .map(
        (h: Record<string, unknown>) =>
          `  - ${h.symbol}: ${(Number(h.allocationInPortfolio ?? 0) * 100).toFixed(1)}% ($${Number(h.valueInBaseCurrency ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) [${h.assetClass}]`
      );

    if (holdingLines.length > 0) {
      lines.push(`Top holdings:\n${holdingLines.join('\n')}`);
    }
  }

  // Statistical metrics
  const stats = data.statisticalMetrics as Record<string, unknown> | undefined;

  if (stats) {
    const pct = (v: unknown) =>
      v != null ? `${(Number(v) * 100).toFixed(2)}%` : 'N/A';
    const num = (v: unknown) => (v != null ? Number(v).toFixed(2) : 'N/A');

    lines.push(
      `Statistical metrics (${stats.periodStartDate} to ${stats.periodEndDate}, ${stats.dataPointCount} data points):` +
        `\n  Sharpe: ${num(stats.sharpeRatio)} | Sortino: ${num(stats.sortinoRatio)}` +
        `\n  Annualized return: ${pct(stats.annualizedReturnPct)} | Volatility: ${pct(stats.annualizedVolatilityPct)}` +
        `\n  Max drawdown: ${pct(stats.maxDrawdownPct)} | Current drawdown: ${pct(stats.currentDrawdownPct)}` +
        `\n  VaR(95%): ${pct(stats.varPct95)} | CVaR(95%): ${pct(stats.cvarPct95)}` +
        (stats.beta != null ? `\n  Beta: ${num(stats.beta)}` : '') +
        (stats.alpha != null ? ` | Alpha: ${pct(stats.alpha)}` : '')
    );
  }

  // Warnings
  const warnings = Array.isArray(data.warnings)
    ? (data.warnings as Record<string, unknown>[])
    : [];

  if (warnings.length > 0) {
    lines.push(`Warnings: ${warnings.map((w) => w.message).join('; ')}`);
  }

  return lines.join('\n');
}

function summarizePerformanceCompare(output: unknown): string {
  const data = output as Record<string, unknown> | null;

  if (!data || typeof data !== 'object') {
    return '[SUMMARY] Performance comparison: no data available.';
  }

  const portfolio = data.portfolio as Record<string, unknown> | undefined;
  const perfPct = portfolio?.netPerformancePercentage;
  const dateRange = data.dateRange ?? 'N/A';
  const comparison = data.comparison as Record<string, unknown> | undefined;
  const outperforming = Array.isArray(comparison?.outperformingBenchmarks)
    ? comparison.outperformingBenchmarks
    : [];
  const underperforming = Array.isArray(comparison?.underperformingBenchmarks)
    ? comparison.underperformingBenchmarks
    : [];

  const lines = [
    `[SUMMARY] Performance (${dateRange}): portfolio return ${perfPct != null ? `${(Number(perfPct) * 100).toFixed(1)}%` : 'N/A'}.`
  ];

  if (outperforming.length > 0) {
    lines.push(`Outperforming: ${outperforming.join(', ')}.`);
  }

  if (underperforming.length > 0) {
    lines.push(`Underperforming: ${underperforming.join(', ')}.`);
  }

  return lines.join(' ');
}

function summarizeTaxEstimate(output: unknown): string {
  const data = output as Record<string, unknown> | null;

  if (!data || typeof data !== 'object') {
    return '[SUMMARY] Tax estimate: no data available.';
  }

  const taxYear = data.taxYear ?? 'N/A';
  const realized = data.realizedGains as
    | Record<string, Record<string, unknown>>
    | undefined;

  const lines = [`[SUMMARY] Tax estimate (${taxYear}):`];

  if (realized?.total) {
    const net = realized.total.netInBaseCurrency ?? 0;
    const ltGain = realized.longTerm?.gainInBaseCurrency ?? 0;
    const stGain = realized.shortTerm?.gainInBaseCurrency ?? 0;
    const txCount = realized.total.transactionCount ?? 0;

    lines.push(
      `  Realized — net: $${Number(net).toFixed(2)}, long-term gain: $${Number(ltGain).toFixed(2)}, short-term gain: $${Number(stGain).toFixed(2)} (${txCount} transaction(s)).`
    );
  } else {
    lines.push('  No realized gains/losses recorded.');
  }

  // Hypothetical impact (only present when hypotheticalTrades were requested)
  const hypo = data.hypotheticalImpact as Record<string, unknown> | undefined;

  if (hypo) {
    const totalGain = hypo.totalEstimatedGainInBaseCurrency ?? 0;
    const ltGain = hypo.totalLongTermGainInBaseCurrency ?? 0;
    const stGain = hypo.totalShortTermGainInBaseCurrency ?? 0;
    const trades = Array.isArray(hypo.trades) ? hypo.trades : [];

    lines.push(
      `  Hypothetical trade impact — estimated gain: $${Number(totalGain).toFixed(2)} (long-term: $${Number(ltGain).toFixed(2)}, short-term: $${Number(stGain).toFixed(2)}).`
    );

    for (const t of trades as Record<string, unknown>[]) {
      const gain = Number(t.estimatedGainInBaseCurrency ?? 0).toFixed(2);
      const term = t.isLongTerm ? 'long-term' : 'short-term';
      const qty = Number(t.quantitySold ?? 0).toFixed(4);
      const warn = t.warning ? ` ⚠ ${t.warning}` : '';

      lines.push(
        `    • ${t.symbol}: sell ${qty} shares → estimated gain $${gain} (${term})${warn}`
      );
    }
  }

  // TLH candidates
  const tlh = Array.isArray(data.taxLossHarvestingCandidates)
    ? (data.taxLossHarvestingCandidates as Record<string, unknown>[])
    : [];

  if (tlh.length > 0) {
    lines.push(`  TLH candidates (${tlh.length}):`);

    for (const c of tlh.slice(0, 3)) {
      const loss = Number(c.unrealizedLossInBaseCurrency ?? 0).toFixed(2);

      lines.push(`    • ${c.symbol}: unrealized loss $${loss}`);
    }
  }

  const warnings = Array.isArray(data.warnings)
    ? (data.warnings as Record<string, unknown>[])
    : [];

  if (warnings.length > 0) {
    lines.push(`  Warnings: ${warnings.map((w) => w.message).join('; ')}`);
  }

  return lines.join('\n');
}

function summarizeTransactionHistory(output: unknown): string {
  const data = output as Record<string, unknown> | null;

  if (!data || typeof data !== 'object') {
    return '[SUMMARY] Transaction history: no data available.';
  }

  const transactions = Array.isArray(data.transactions)
    ? data.transactions
    : [];
  const count = data.totalCount ?? transactions.length;

  const typeCounts: Record<string, number> = {};

  for (const t of transactions) {
    const type = (t as Record<string, unknown>).type as string;

    if (type) {
      typeCounts[type] = (typeCounts[type] ?? 0) + 1;
    }
  }

  const typeBreakdown = Object.entries(typeCounts)
    .map(([type, n]) => `${type}: ${n}`)
    .join(', ');

  return [
    `[SUMMARY] ${count} transactions.`,
    typeBreakdown ? `Types: ${typeBreakdown}.` : ''
  ]
    .filter(Boolean)
    .join(' ');
}

function summarizeComplianceCheck(output: unknown): string {
  const data = output as Record<string, unknown> | null;

  if (!data || typeof data !== 'object') {
    return '[SUMMARY] Compliance check: no data available.';
  }

  const compliant = data.isCompliant;
  const rules = Array.isArray(data.rules) ? data.rules : [];
  const passed = rules.filter(
    (r: Record<string, unknown>) => r.status === 'PASS'
  ).length;
  const failed = rules.filter(
    (r: Record<string, unknown>) => r.status === 'FAIL'
  ).length;

  return `[SUMMARY] Compliance: ${compliant ? 'COMPLIANT' : 'NON-COMPLIANT'}. ${passed} rules passed, ${failed} rules failed out of ${rules.length} total.`;
}

function summarizeRebalanceSuggest(output: unknown): string {
  const data = output as Record<string, unknown> | null;

  if (!data || typeof data !== 'object') {
    return '[SUMMARY] Rebalance suggestions: no data available.';
  }

  const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];

  if (suggestions.length === 0) {
    return '[SUMMARY] Rebalance: no suggestions. Portfolio may already be balanced.';
  }

  const lines = suggestions
    .slice(0, 5)
    .map(
      (s: Record<string, unknown>) =>
        `  - ${s.action} ${s.symbol}${s.amount != null ? ` ($${s.amount})` : ''}`
    );

  return [
    `[SUMMARY] ${suggestions.length} rebalance suggestion(s):`,
    ...lines
  ].join('\n');
}

function summarizeSimulateTrades(output: unknown): string {
  const data = output as Record<string, unknown> | null;

  if (!data || typeof data !== 'object') {
    return '[SUMMARY] Trade simulation: no data available.';
  }

  const sim = data.simulatedPortfolio as Record<string, unknown> | undefined;

  if (!sim) {
    return '[SUMMARY] Trade simulation completed. See raw data for details.';
  }

  return `[SUMMARY] Simulated portfolio: total value ${sim.totalValue ?? 'N/A'}, net change ${sim.netChange ?? 'N/A'}.`;
}

function summarizeStressTest(output: unknown): string {
  const data = output as Record<string, unknown> | null;

  if (!data || typeof data !== 'object') {
    return '[SUMMARY] Stress test: no data available.';
  }

  const scenarios = Array.isArray(data.scenarios) ? data.scenarios : [];

  if (scenarios.length === 0) {
    return '[SUMMARY] Stress test completed. No scenario data available.';
  }

  const lines = scenarios
    .slice(0, 5)
    .map(
      (s: Record<string, unknown>) =>
        `  - ${s.name}: ${s.portfolioImpact != null ? `${(Number(s.portfolioImpact) * 100).toFixed(1)}%` : 'N/A'} impact`
    );

  return [
    `[SUMMARY] Stress test — ${scenarios.length} scenario(s):`,
    ...lines
  ].join('\n');
}

function summarizeMarketDataLookup(output: unknown): string {
  const data = output as Record<string, unknown> | null;

  if (!data || typeof data !== 'object') {
    return '[SUMMARY] Market data: no data available.';
  }

  const quotes = Array.isArray(data.quotes) ? data.quotes : [];

  if (quotes.length === 0) {
    return '[SUMMARY] Market data lookup returned no quotes.';
  }

  const lines = quotes
    .slice(0, 10)
    .map(
      (q: Record<string, unknown>) =>
        `  - ${q.symbol}: ${q.price ?? 'N/A'} ${q.currency ?? ''}`
    );

  return [`[SUMMARY] ${quotes.length} quote(s):`, ...lines].join('\n');
}

// ─── Registry ──────────────────────────────────────────────────────────

const SUMMARIZERS: Record<string, Summarizer> = {
  analyze_risk: summarizeAnalyzeRisk,
  compliance_check: summarizeComplianceCheck,
  get_portfolio_summary: summarizePortfolioSummary,
  get_transaction_history: summarizeTransactionHistory,
  market_data_lookup: summarizeMarketDataLookup,
  performance_compare: summarizePerformanceCompare,
  rebalance_suggest: summarizeRebalanceSuggest,
  simulate_trades: summarizeSimulateTrades,
  stress_test: summarizeStressTest,
  tax_estimate: summarizeTaxEstimate
};

// ─── Public API ────────────────────────────────────────────────────────

/**
 * Summarize tool output for LLM context injection.
 *
 * Returns `[SUMMARY] ...key facts...\n\n--- RAW JSON ---\n{truncated}`.
 * If the tool has no registered summarizer, returns raw JSON only.
 * Summarizer errors fall back to raw JSON silently.
 */
export function summarizeToolOutput(
  toolName: string,
  output: unknown,
  rawSource?: unknown
): string {
  const rawTarget = rawSource ?? output;
  const rawJson =
    typeof rawTarget === 'string'
      ? rawTarget
      : JSON.stringify(rawTarget ?? null);

  const summarizer = SUMMARIZERS[toolName];

  if (!summarizer) {
    return rawJson;
  }

  let summary: string;

  try {
    summary = summarizer(output);
  } catch {
    // Summarizer failure: fall back to raw JSON
    return rawJson;
  }

  // Append truncated raw JSON for detail lookups
  const truncatedRaw =
    rawJson.length > SUMMARY_RAW_CHARS
      ? rawJson.slice(0, SUMMARY_RAW_CHARS) + '\n[RAW JSON truncated]'
      : rawJson;

  return `${summary}\n\n--- RAW JSON ---\n${truncatedRaw}`;
}
