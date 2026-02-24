import { resolveMvpEvalBaseUrl } from './mvp-evals.config';

describe('resolveMvpEvalBaseUrl', () => {
  it('uses MVP_EVAL_BASE_URL when explicitly provided', () => {
    expect(
      resolveMvpEvalBaseUrl({
        MVP_EVAL_BASE_URL: 'http://localhost:9090/api/v1'
      } as NodeJS.ProcessEnv)
    ).toBe('http://localhost:9090/api/v1');
  });

  it('falls back to HOST and PORT when base URL is not set', () => {
    expect(
      resolveMvpEvalBaseUrl({
        HOST: '127.0.0.1',
        PORT: '4444'
      } as NodeJS.ProcessEnv)
    ).toBe('http://127.0.0.1:4444/api/v1');
  });

  it('uses localhost defaults when HOST and PORT are missing', () => {
    expect(resolveMvpEvalBaseUrl({} as NodeJS.ProcessEnv)).toBe(
      'http://127.0.0.1:3333/api/v1'
    );
  });
});
