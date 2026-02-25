#!/usr/bin/env ts-node
/**
 * Coverage Matrix Reporter
 *
 * Reads golden-sets.json and labeled-scenarios.json, then outputs a
 * markdown table showing eval coverage by subcategory, category, and difficulty.
 *
 * Usage:
 *   npx ts-node -P apps/api/tsconfig.spec.json apps/api/test/ai/coverage-matrix.ts
 *   npx ts-node -P apps/api/tsconfig.spec.json apps/api/test/ai/coverage-matrix.ts --output=json
 *   npx ts-node -P apps/api/tsconfig.spec.json apps/api/test/ai/coverage-matrix.ts --output=markdown > apps/api/test/ai/README.md
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { validateEvalSuite, type EvalCaseDefinition } from './eval-case.schema';

// ─── Load all eval cases ────────────────────────────────────────────────────────

function loadCases(filename: string): EvalCaseDefinition[] {
  try {
    const raw = JSON.parse(
      readFileSync(join(__dirname, filename), 'utf8')
    );

    return validateEvalSuite(raw);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`Warning: Could not load ${filename}: ${error}`);

    return [];
  }
}

const goldenCases = loadCases('golden-sets.json');
const labeledCases = loadCases('labeled-scenarios.json');
const allCases = [...goldenCases, ...labeledCases];

// ─── Build coverage data ────────────────────────────────────────────────────────

interface CoverageEntry {
  category: string;
  difficulty: string;
  goldenCount: number;
  labeledCount: number;
  liveEligible: number;
  subcategory: string;
  totalCount: number;
}

function buildCoverageMap(): Map<string, CoverageEntry> {
  const map = new Map<string, CoverageEntry>();

  for (const c of allCases) {
    const key = c.meta.subcategory;

    if (!map.has(key)) {
      map.set(key, {
        category: c.meta.category,
        difficulty: c.meta.difficulty,
        goldenCount: 0,
        labeledCount: 0,
        liveEligible: 0,
        subcategory: c.meta.subcategory,
        totalCount: 0
      });
    }

    const entry = map.get(key)!;
    entry.totalCount++;

    if (c.meta.stage === 'golden') {
      entry.goldenCount++;
    } else {
      entry.labeledCount++;
    }

    if (c.liveEligible) {
      entry.liveEligible++;
    }

    // Use highest difficulty found
    const difficultyRank = { advanced: 3, basic: 1, intermediate: 2 };

    if (
      difficultyRank[c.meta.difficulty as keyof typeof difficultyRank] >
      difficultyRank[entry.difficulty as keyof typeof difficultyRank]
    ) {
      entry.difficulty = c.meta.difficulty;
    }
  }

  return map;
}

// ─── Aligned table helpers ───────────────────────────────────────────────────────

type Row = string[];

/** Pad a string to width, right-aligning if the value looks numeric */
function pad(value: string, width: number, numeric = false): string {
  return numeric ? value.padStart(width) : value.padEnd(width);
}

function renderTable(headers: string[], rows: Row[], numericCols: number[] = []): string {
  const colWidths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length))
  );

  const isNum = (i: number) => numericCols.includes(i);

  const header = '| ' + headers.map((h, i) => pad(h, colWidths[i], isNum(i))).join(' | ') + ' |';
  const separator = '|-' + colWidths.map((w, i) => (isNum(i) ? '-'.repeat(w - 1) + ':' : '-'.repeat(w))).join('-|-') + '-|';
  const dataRows = rows.map(
    (r) => '| ' + r.map((cell, i) => pad(cell, colWidths[i], isNum(i))).join(' | ') + ' |'
  );

  return [header, separator, ...dataRows].join('\n');
}

// ─── Output formatters ──────────────────────────────────────────────────────────

const DIFFICULTY_BADGE: Record<string, string> = {
  advanced: '🔴 advanced',
  basic: '🟢 basic',
  intermediate: '🟡 intermediate'
};

const CATEGORY_EMOJI: Record<string, string> = {
  'adversarial': '🛡️  adversarial',
  'auth': '🔐 auth',
  'edge-case': '⚠️  edge-case',
  'guardrail': '🚧 guardrail',
  'multi-tool': '🔗 multi-tool',
  'single-tool': '🔧 single-tool'
};

function toMarkdown(entries: CoverageEntry[]): string {
  const lines: string[] = [];
  const now = new Date().toISOString();

  lines.push('# AI Eval Coverage Matrix\n');
  lines.push(`> Generated ${now}\n`);

  // Summary banner
  lines.push('## Summary\n');
  lines.push(
    renderTable(
      ['Tier', 'Cases', 'Live-eligible'],
      [
        ['Stage 1 — Golden Sets (fast, every commit)', String(goldenCases.length), String(goldenCases.filter((c) => c.liveEligible).length)],
        ['Stage 2 — Labeled Scenarios (nightly)', String(labeledCases.length), String(labeledCases.filter((c) => c.liveEligible).length)],
        ['Total', String(allCases.length), String(allCases.filter((c) => c.liveEligible).length)]
      ],
      [1, 2]
    )
  );

  lines.push('');

  // Main coverage table
  lines.push('## Coverage by Subcategory\n');
  lines.push(
    renderTable(
      ['Subcategory', 'Category', 'Golden', 'Labeled', 'Live', 'Total', 'Difficulty'],
      entries.map((e) => [
        e.subcategory,
        CATEGORY_EMOJI[e.category] ?? e.category,
        String(e.goldenCount),
        String(e.labeledCount),
        String(e.liveEligible),
        String(e.totalCount),
        DIFFICULTY_BADGE[e.difficulty] ?? e.difficulty
      ]),
      [2, 3, 4, 5]
    )
  );

  lines.push('');

  // Category summary
  const categoryMap = new Map<string, { total: number; live: number }>();

  for (const entry of entries) {
    const existing = categoryMap.get(entry.category) ?? { live: 0, total: 0 };
    categoryMap.set(entry.category, {
      live: existing.live + entry.liveEligible,
      total: existing.total + entry.totalCount
    });
  }

  lines.push('## By Category\n');
  lines.push(
    renderTable(
      ['Category', 'Total', 'Live'],
      [...categoryMap.entries()].sort().map(([cat, { live, total }]) => [
        CATEGORY_EMOJI[cat] ?? cat,
        String(total),
        String(live)
      ]),
      [1, 2]
    )
  );

  lines.push('');

  // Coverage gaps
  lines.push('## Coverage Gaps\n');

  const coveredSubcategories = new Set(entries.map((e) => e.subcategory));
  const allSubcategories = [
    'compliance',
    'empty-data',
    'guardrail-circuit-breaker',
    'guardrail-cost',
    'guardrail-iterations',
    'guardrail-timeout',
    'malformed-query',
    'market-data',
    'multi-tool-orchestration',
    'performance',
    'portfolio-summary',
    'prompt-injection',
    'rebalance',
    'risk-analysis',
    'schema-safety',
    'tax',
    'transaction-history',
    'user-scoping'
  ];

  const missing = allSubcategories.filter(
    (s) => !coveredSubcategories.has(s)
  );

  if (missing.length > 0) {
    for (const sub of missing) {
      lines.push(`- ❌ **${sub}** — no eval cases yet (requires live LLM; deferred to Stage 3)`);
    }
  } else {
    lines.push('✅ All subcategories have at least 1 eval case.');
  }

  return lines.join('\n');
}

function toJson(entries: CoverageEntry[]): string {
  return JSON.stringify(
    {
      entries,
      generated: new Date().toISOString(),
      summary: {
        goldenCount: goldenCases.length,
        labeledCount: labeledCases.length,
        totalCount: allCases.length
      }
    },
    null,
    2
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────

const coverageMap = buildCoverageMap();
const entries = [...coverageMap.values()].sort((a, b) =>
  a.subcategory.localeCompare(b.subcategory)
);

const outputMode = process.argv.includes('--output=json') ? 'json' : 'markdown';

// eslint-disable-next-line no-console
console.log(outputMode === 'json' ? toJson(entries) : toMarkdown(entries));
