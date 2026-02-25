/**
 * Labeled Scenarios — Nightly Live Tier
 *
 * Schedule-only runner: gated by RUN_LABELED_EVALS=1.
 * Runs 30+ labeled scenarios against the live API.
 * Budget: <15min wall clock, ~$0.50 per run.
 * Does NOT block merges — outputs a coverage report.
 *
 * Cases are loaded at MODULE SCOPE.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  assertChatResponseShape,
  assertEvalInvariants,
  assertLiveSources,
  type VerifiedResponseLike
} from './eval-assert';
import { validateEvalSuite } from './eval-case.schema';
import { resolveMvpEvalBaseUrl } from './mvp-evals.config';

// ─── Configuration ─────────────────────────────────────────────────────────────

const BASE_URL = resolveMvpEvalBaseUrl();
const RUN_LABELED_EVALS = process.env.RUN_LABELED_EVALS === '1';

const describeIfEnabled = RUN_LABELED_EVALS ? describe : describe.skip;

// ─── Module-scope case loading ─────────────────────────────────────────────────

const allCases = validateEvalSuite(
  JSON.parse(readFileSync(join(__dirname, 'labeled-scenarios.json'), 'utf8'))
);

const liveCases = allCases.filter((c) => c.liveEligible);

// ─── Types ─────────────────────────────────────────────────────────────────────

type EvalProfile = 'empty' | 'rich';

interface UserCreateResponse {
  accessToken: string;
  authToken: string;
}

// ─── Suite ─────────────────────────────────────────────────────────────────────

jest.setTimeout(120_000);

describeIfEnabled('Labeled Scenarios (nightly)', () => {
  const credentialsByProfile: Record<
    EvalProfile,
    { accessToken: string; authToken: string }
  > = {
    empty: { accessToken: '', authToken: '' },
    rich: { accessToken: '', authToken: '' }
  };

  const summaryRows: {
    caseId: string;
    category: string;
    elapsedMs: number;
    estimatedCostUsd: number;
    outcome: 'fail' | 'pass';
    reason: string;
    subcategory: string;
    toolCalls: number;
  }[] = [];

  let totalCostUsd = 0;

  beforeAll(async () => {
    await assertApiHealthy();

    credentialsByProfile.rich = await createUserCredentials();
    await seedRichPortfolio(credentialsByProfile.rich.authToken);

    credentialsByProfile.empty = await createUserCredentials();
  });

  afterAll(async () => {
    if (summaryRows.length) {
      // eslint-disable-next-line no-console
      console.table(summaryRows);

      const passCount = summaryRows.filter((r) => r.outcome === 'pass').length;

      // eslint-disable-next-line no-console
      console.log(
        `Labeled Scenarios: ${passCount}/${summaryRows.length} passed, ` +
          `total cost: $${totalCostUsd.toFixed(4)}`
      );
    }

    // Cost budget guard
    if (totalCostUsd > 1.0) {
      // eslint-disable-next-line no-console
      console.error(
        `WARNING: Labeled Scenarios exceeded cost budget: $${totalCostUsd.toFixed(4)} > $1.00`
      );
    }

    // Cleanup users
    for (const profile of Object.keys(credentialsByProfile) as EvalProfile[]) {
      const { accessToken, authToken } = credentialsByProfile[profile];

      if (!authToken) {
        continue;
      }

      try {
        await deleteJson({
          authToken,
          body: { accessToken },
          path: '/user'
        });
      } catch {
        // Best-effort cleanup
      }
    }
  });

  for (const evalCase of liveCases) {
    it(`[${evalCase.meta.subcategory}] ${evalCase.id}`, async () => {
      const authToken = credentialsByProfile[evalCase.profile].authToken;
      const startedAt = Date.now();

      let response: VerifiedResponseLike | undefined;

      try {
        response = await postJson<VerifiedResponseLike>({
          authToken,
          body: evalCase.request,
          path: '/ai/chat'
        });

        assertChatResponseShape(response);
        assertEvalInvariants(evalCase, response);
        assertLiveSources(response, evalCase);

        totalCostUsd += response.estimatedCostUsd;

        summaryRows.push({
          caseId: evalCase.id,
          category: evalCase.meta.category,
          elapsedMs: response.elapsedMs,
          estimatedCostUsd: response.estimatedCostUsd,
          outcome: 'pass',
          reason: '',
          subcategory: evalCase.meta.subcategory,
          toolCalls: response.toolCalls
        });
      } catch (error) {
        totalCostUsd += response?.estimatedCostUsd ?? 0;

        summaryRows.push({
          caseId: evalCase.id,
          category: evalCase.meta.category,
          elapsedMs: response?.elapsedMs ?? Date.now() - startedAt,
          estimatedCostUsd: response?.estimatedCostUsd ?? 0,
          outcome: 'fail',
          reason: error instanceof Error ? error.message : String(error),
          subcategory: evalCase.meta.subcategory,
          toolCalls: response?.toolCalls ?? 0
        });

        throw error;
      }
    });
  }
});

// ─── HTTP Helpers ──────────────────────────────────────────────────────────────

async function assertApiHealthy() {
  const response = await fetch(`${BASE_URL}/health`, { method: 'GET' });

  if (!response.ok) {
    throw new Error(
      `Labeled Scenarios require a healthy API at ${BASE_URL}. Received ${response.status}.`
    );
  }
}

async function createUserCredentials() {
  const response = await postJson<UserCreateResponse>({
    body: {},
    path: '/user'
  });

  if (!response.authToken || !response.accessToken) {
    throw new Error(
      'Expected /user to return authToken and accessToken for eval setup.'
    );
  }

  return { accessToken: response.accessToken, authToken: response.authToken };
}

async function seedRichPortfolio(authToken: string) {
  const symbols = [
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    '44444444-4444-4444-8444-444444444444'
  ];

  const activities = Array.from({ length: 30 }, (_, index) => ({
    currency: 'USD',
    dataSource: 'MANUAL',
    date: new Date(Date.UTC(2025, 0, index + 1)).toISOString(),
    fee: 0,
    quantity: (index % 3) + 1,
    symbol: symbols[index % symbols.length],
    type: 'BUY',
    unitPrice: 100 + (index % 5) * 15
  }));

  await postJson({
    authToken,
    body: { activities },
    path: '/import'
  });
}

async function deleteJson({
  authToken,
  body,
  path
}: {
  authToken: string;
  body: unknown;
  path: string;
}): Promise<void> {
  const response = await fetch(`${BASE_URL}${path}`, {
    body: JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    },
    method: 'DELETE'
  });

  if (!response.ok) {
    throw new Error(`DELETE ${path} failed (${response.status})`);
  }
}

async function postJson<T>({
  authToken,
  body,
  path
}: {
  authToken?: string;
  body: unknown;
  path: string;
}): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
    },
    method: 'POST'
  });

  const rawBody = await response.text();
  let payload: unknown = {};

  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    payload = rawBody;
  }

  if (!response.ok) {
    throw new Error(
      `POST ${path} failed (${response.status}): ${JSON.stringify(payload)}`
    );
  }

  return payload as T;
}
