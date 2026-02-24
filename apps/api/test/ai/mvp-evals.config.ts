const DEFAULT_MVP_EVAL_HOST = '127.0.0.1';
const DEFAULT_MVP_EVAL_PORT = '3333';

export function resolveMvpEvalBaseUrl(env: NodeJS.ProcessEnv = process.env) {
  if (env.MVP_EVAL_BASE_URL) {
    return env.MVP_EVAL_BASE_URL;
  }

  const host = env.HOST ?? DEFAULT_MVP_EVAL_HOST;
  const port = env.PORT ?? DEFAULT_MVP_EVAL_PORT;

  return `http://${host}:${port}/api/v1`;
}
