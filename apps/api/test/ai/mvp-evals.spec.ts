import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { resolveMvpEvalBaseUrl } from './mvp-evals.config';

type ConfidenceLevel = 'high' | 'low' | 'medium';
type EvalProfile = 'empty' | 'rich';
type VerifiedStatus = 'completed' | 'failed' | 'partial';

interface ChatRequestPayload {
  message: string;
  toolNames: string[];
}

interface ChatResponsePayload {
  confidence: ConfidenceLevel;
  elapsedMs: number;
  estimatedCostUsd: number;
  iterations: number;
  response: string;
  sources: string[];
  status: VerifiedStatus;
  toolCalls: number;
  warnings: string[];
}

interface EvalCaseDefinition {
  expect: {
    minConfidence: ConfidenceLevel;
    minToolCalls: number;
    mustIncludeAny: string[];
    mustNotIncludeAny: string[];
    requiredSources: string[];
    status: VerifiedStatus;
  };
  id: string;
  profile: EvalProfile;
  request: ChatRequestPayload;
}

interface UserCreateResponse {
  accessToken: string;
  authToken: string;
}

const BASE_URL = resolveMvpEvalBaseUrl();
const RUN_MVP_EVALS = process.env.RUN_MVP_EVALS === '1';

const describeIfEnabled = RUN_MVP_EVALS ? describe : describe.skip;

const confidenceRank: Record<ConfidenceLevel, number> = {
  high: 3,
  low: 1,
  medium: 2
};

const evalCases = JSON.parse(
  readFileSync(join(__dirname, 'mvp-evals.json'), 'utf8')
) as EvalCaseDefinition[];

jest.setTimeout(240_000);

describeIfEnabled('MVP eval pack', () => {
  const credentialsByProfile: Record<
    EvalProfile,
    { accessToken: string; authToken: string }
  > = {
    empty: { accessToken: '', authToken: '' },
    rich: { accessToken: '', authToken: '' }
  };

  const summaryRows: {
    caseId: string;
    elapsedMs: number;
    estimatedCostUsd: number;
    outcome: 'fail' | 'pass';
    reason: string;
    toolCalls: number;
  }[] = [];

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
    }

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
        // Best-effort cleanup; do not fail the suite on teardown errors
      }
    }
  });

  for (const evalCase of evalCases) {
    it(evalCase.id, async () => {
      const authToken = credentialsByProfile[evalCase.profile].authToken;
      const startedAt = Date.now();

      let response: ChatResponsePayload | undefined;

      try {
        response = await postJson<ChatResponsePayload>({
          authToken,
          body: evalCase.request,
          path: '/ai/chat'
        });

        assertEvalInvariants(evalCase, response);

        summaryRows.push({
          caseId: evalCase.id,
          elapsedMs: response.elapsedMs,
          estimatedCostUsd: response.estimatedCostUsd,
          outcome: 'pass',
          reason: '',
          toolCalls: response.toolCalls
        });
      } catch (error) {
        summaryRows.push({
          caseId: evalCase.id,
          elapsedMs: response?.elapsedMs ?? Date.now() - startedAt,
          estimatedCostUsd: response?.estimatedCostUsd ?? 0,
          outcome: 'fail',
          reason: error instanceof Error ? error.message : String(error),
          toolCalls: response?.toolCalls ?? 0
        });

        throw error;
      }
    });
  }
});

async function assertApiHealthy() {
  const response = await fetch(`${BASE_URL}/health`, {
    method: 'GET'
  });

  if (!response.ok) {
    throw new Error(
      `MVP evals require a healthy API at ${BASE_URL}. Received ${response.status}.`
    );
  }
}

function assertChatResponseShape(
  payload: unknown
): asserts payload is ChatResponsePayload {
  const obj = payload as Record<string, unknown>;

  for (const key of [
    'status',
    'confidence',
    'response',
    'sources',
    'toolCalls',
    'elapsedMs'
  ]) {
    if (!(key in obj) || obj[key] === undefined) {
      throw new Error(
        `Chat response missing required field "${key}". Got keys: ${Object.keys(obj).join(', ')}`
      );
    }
  }
}

function assertEvalInvariants(
  evalCase: EvalCaseDefinition,
  response: ChatResponsePayload
) {
  const { expect: expected } = evalCase;

  assertChatResponseShape(response);

  expect(response.status).toBe(expected.status);
  expect(response.toolCalls).toBeGreaterThanOrEqual(expected.minToolCalls);

  expect(Object.keys(confidenceRank)).toContain(response.confidence);
  expect(confidenceRank[response.confidence]).toBeGreaterThanOrEqual(
    confidenceRank[expected.minConfidence]
  );

  for (const source of expected.requiredSources) {
    expect(response.sources).toContain(source);
  }

  const normalizedResponse = response.response.toLowerCase();

  if (expected.mustIncludeAny.length > 0) {
    expect(
      expected.mustIncludeAny.some((phrase) => {
        return normalizedResponse.includes(phrase.toLowerCase());
      })
    ).toBe(true);
  }

  for (const forbiddenPhrase of expected.mustNotIncludeAny) {
    expect(normalizedResponse).not.toContain(forbiddenPhrase.toLowerCase());
  }
}

async function createUserCredentials() {
  const response = await postJson<UserCreateResponse>({
    body: {},
    path: '/user'
  });

  if (!response.authToken || !response.accessToken) {
    throw new Error(
      'Expected /user to return authToken and accessToken for MVP eval setup.'
    );
  }

  return { accessToken: response.accessToken, authToken: response.authToken };
}

async function seedRichPortfolio(authToken: string) {
  // MANUAL data source auto-creates asset profiles for arbitrary symbols
  const symbols = [
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    '44444444-4444-4444-8444-444444444444'
  ];

  const activities = Array.from({ length: 30 }, (_, index) => {
    return {
      currency: 'USD',
      dataSource: 'MANUAL',
      date: new Date(Date.UTC(2025, 0, index + 1)).toISOString(),
      fee: 0,
      quantity: (index % 3) + 1,
      symbol: symbols[index % symbols.length],
      type: 'BUY',
      unitPrice: 100 + (index % 5) * 15
    };
  });

  await postJson({
    authToken,
    body: {
      activities
    },
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
