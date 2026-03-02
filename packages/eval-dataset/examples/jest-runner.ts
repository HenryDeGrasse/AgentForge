/**
 * Example: run AgentForge eval cases against your own finance AI agent using Jest.
 *
 * Adapts the dataset's EvalCaseDefinition assertions to whatever HTTP shape
 * your agent returns. Adjust the `callYourAgent()` function to match your API.
 *
 * Run: npx jest examples/jest-runner.ts
 */
import {
  EvalCaseDefinition,
  loadAll,
  byCategory,
  liveEligible
} from '@agentforge/finance-eval-dataset';

// ─── Adapt this to your agent's API ───────────────────────────────────────────

interface AgentResponse {
  confidence: string;
  elapsedMs: number;
  invokedToolNames?: string[];
  response: string;
  sources: string[];
  status: string;
  toolCalls: number;
  warnings: string[];
}

async function callYourAgent(
  message: string,
  toolNames?: string[]
): Promise<AgentResponse> {
  const res = await fetch('http://localhost:3333/api/v1/ai/chat', {
    body: JSON.stringify({ message, toolNames }),
    headers: {
      Authorization: `Bearer ${process.env.DEMO_JWT}`,
      'Content-Type': 'application/json'
    },
    method: 'POST'
  });
  return res.json() as Promise<AgentResponse>;
}

// ─── Generic assertion helper ──────────────────────────────────────────────────

function assertCase(evalCase: EvalCaseDefinition, response: AgentResponse) {
  const { expect: ex } = evalCase;
  const lower = response.response.toLowerCase();

  // Status
  if (response.status !== ex.status) {
    throw new Error(
      `[${evalCase.id}] status: expected "${ex.status}", got "${response.status}"`
    );
  }

  // mustIncludeAny (OR)
  if (ex.mustIncludeAny.length > 0) {
    const found = ex.mustIncludeAny.some((p) =>
      lower.includes(p.toLowerCase())
    );
    if (!found) {
      throw new Error(
        `[${evalCase.id}] mustIncludeAny: none of [${ex.mustIncludeAny.join(', ')}] found`
      );
    }
  }

  // mustNotIncludeAny
  for (const phrase of ex.mustNotIncludeAny) {
    if (lower.includes(phrase.toLowerCase())) {
      throw new Error(
        `[${evalCase.id}] mustNotIncludeAny: forbidden phrase "${phrase}" found`
      );
    }
  }

  // mustContainAll (AND)
  if (ex.mustContainAll) {
    const missing = ex.mustContainAll.filter(
      (p) => !lower.includes(p.toLowerCase())
    );
    if (missing.length > 0) {
      throw new Error(
        `[${evalCase.id}] mustContainAll: missing [${missing.join(', ')}]`
      );
    }
  }

  // tool counts
  if (ex.minToolCalls !== undefined && response.toolCalls < ex.minToolCalls) {
    throw new Error(
      `[${evalCase.id}] minToolCalls: expected >= ${ex.minToolCalls}, got ${response.toolCalls}`
    );
  }

  // required tools
  if (response.invokedToolNames) {
    for (const tool of ex.requiredTools) {
      if (!response.invokedToolNames.includes(tool)) {
        throw new Error(`[${evalCase.id}] required tool "${tool}" not invoked`);
      }
    }
  }
}

// ─── Jest test suite ──────────────────────────────────────────────────────────

const cases = loadAll()
  .filter(liveEligible) // only cases safe for live LLMs
  .filter(byCategory('single-tool')); // change or remove this filter as needed

describe('AgentForge finance eval — single-tool live', () => {
  for (const evalCase of cases) {
    it(
      evalCase.id,
      async () => {
        const response = await callYourAgent(
          evalCase.request.message,
          evalCase.request.toolNames
        );
        assertCase(evalCase, response);
      },
      30_000
    ); // 30s timeout per case
  }
});
