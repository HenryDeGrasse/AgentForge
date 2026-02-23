import { ReactAgentRunResult } from '@ghostfolio/api/app/endpoints/ai/agent/react-agent.service';
import {
  SAFE_FALLBACK_RESPONSE,
  SLOW_RESPONSE_THRESHOLD_MS
} from '@ghostfolio/api/app/endpoints/ai/contracts/final-response.schema';

import { Test, TestingModule } from '@nestjs/testing';

import { ResponseVerifierService } from './response-verifier.service';

const BASE_RESULT: ReactAgentRunResult = {
  elapsedMs: 1200,
  estimatedCostUsd: 0.001,
  iterations: 2,
  response: 'Your portfolio looks diversified.',
  status: 'completed',
  toolCalls: 2
};

describe('ResponseVerifierService', () => {
  let service: ResponseVerifierService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ResponseVerifierService]
    }).compile();

    service = module.get<ResponseVerifierService>(ResponseVerifierService);
  });

  // ─── confidence ────────────────────────────────────────────────────────────

  describe('confidence', () => {
    it('assigns HIGH when status=completed and toolCalls > 0', () => {
      const result = service.verify(BASE_RESULT, [
        'get_portfolio_summary',
        'analyze_risk'
      ]);

      expect(result.confidence).toBe('high');
    });

    it('assigns MEDIUM when status=completed but toolCalls === 0', () => {
      const result = service.verify({ ...BASE_RESULT, toolCalls: 0 }, []);

      expect(result.confidence).toBe('medium');
    });

    it('assigns MEDIUM when status=partial', () => {
      const result = service.verify({ ...BASE_RESULT, status: 'partial' }, [
        'get_portfolio_summary'
      ]);

      expect(result.confidence).toBe('medium');
    });

    it('assigns LOW when status=failed', () => {
      const result = service.verify(
        { ...BASE_RESULT, status: 'failed', toolCalls: 1 },
        ['get_portfolio_summary']
      );

      expect(result.confidence).toBe('low');
    });
  });

  // ─── sources ───────────────────────────────────────────────────────────────

  describe('sources', () => {
    it('populates sources from provided toolNames when toolCalls > 0', () => {
      const tools = ['get_portfolio_summary', 'analyze_risk'];
      const result = service.verify(BASE_RESULT, tools);

      expect(result.sources).toEqual(tools);
    });

    it('returns empty sources when toolCalls === 0', () => {
      const result = service.verify({ ...BASE_RESULT, toolCalls: 0 }, [
        'get_portfolio_summary'
      ]);

      expect(result.sources).toEqual([]);
    });

    it('returns empty sources when no toolNames provided', () => {
      const result = service.verify(BASE_RESULT, []);

      expect(result.sources).toEqual([]);
    });
  });

  // ─── warnings ──────────────────────────────────────────────────────────────

  describe('warnings', () => {
    it('returns no warnings for a clean completed result with tools', () => {
      const result = service.verify(BASE_RESULT, ['get_portfolio_summary']);

      expect(result.warnings).toEqual([]);
    });

    it('adds warning when status=failed', () => {
      const result = service.verify({ ...BASE_RESULT, status: 'failed' }, []);

      expect(result.warnings).toContain(
        'Response could not be completed. Please try again.'
      );
    });

    it('adds warning when status=partial', () => {
      const result = service.verify({ ...BASE_RESULT, status: 'partial' }, []);

      expect(result.warnings).toContain(
        'Response may be incomplete due to an early stop.'
      );
    });

    it('adds warning when toolCalls === 0', () => {
      const result = service.verify({ ...BASE_RESULT, toolCalls: 0 }, []);

      expect(result.warnings).toContain(
        'No portfolio data tools were used; response may not reflect current data.'
      );
    });

    it('adds warning when elapsedMs exceeds slow threshold', () => {
      const result = service.verify(
        { ...BASE_RESULT, elapsedMs: SLOW_RESPONSE_THRESHOLD_MS + 1 },
        ['get_portfolio_summary']
      );

      expect(result.warnings).toContain(
        'Response took longer than expected; data may be delayed.'
      );
    });

    it('does NOT add slow warning when elapsedMs is below threshold', () => {
      const result = service.verify(
        { ...BASE_RESULT, elapsedMs: SLOW_RESPONSE_THRESHOLD_MS - 1 },
        ['get_portfolio_summary']
      );

      expect(result.warnings).not.toContain(
        'Response took longer than expected; data may be delayed.'
      );
    });

    it('adds COST_LIMIT guardrail warning', () => {
      const result = service.verify(
        { ...BASE_RESULT, guardrail: 'COST_LIMIT', status: 'partial' },
        []
      );

      expect(result.warnings).toContain(
        'Response was cut short due to cost constraints.'
      );
    });

    it('adds MAX_ITERATIONS guardrail warning', () => {
      const result = service.verify(
        { ...BASE_RESULT, guardrail: 'MAX_ITERATIONS', status: 'partial' },
        []
      );

      expect(result.warnings).toContain(
        'Response was cut short after reaching the reasoning step limit.'
      );
    });

    it('adds TIMEOUT guardrail warning', () => {
      const result = service.verify(
        { ...BASE_RESULT, guardrail: 'TIMEOUT', status: 'partial' },
        []
      );

      expect(result.warnings).toContain(
        'Response was cut short due to a timeout.'
      );
    });

    it('adds CIRCUIT_BREAKER guardrail warning', () => {
      const result = service.verify(
        {
          ...BASE_RESULT,
          guardrail: 'CIRCUIT_BREAKER',
          iterations: 0,
          status: 'failed',
          toolCalls: 0
        },
        []
      );

      expect(result.warnings).toContain(
        'The AI provider is temporarily unavailable. Please try again later.'
      );
    });

    it('can accumulate multiple warnings at once', () => {
      const result = service.verify(
        {
          ...BASE_RESULT,
          elapsedMs: SLOW_RESPONSE_THRESHOLD_MS + 1,
          status: 'partial',
          toolCalls: 0
        },
        []
      );

      expect(result.warnings.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ─── safe fallback response ─────────────────────────────────────────────────

  describe('safe fallback response', () => {
    it('replaces empty response string with SAFE_FALLBACK_RESPONSE', () => {
      const result = service.verify({ ...BASE_RESULT, response: '' }, []);

      expect(result.response).toBe(SAFE_FALLBACK_RESPONSE);
    });

    it('replaces whitespace-only response with SAFE_FALLBACK_RESPONSE', () => {
      const result = service.verify(
        { ...BASE_RESULT, response: '   \n\t  ' },
        []
      );

      expect(result.response).toBe(SAFE_FALLBACK_RESPONSE);
    });

    it('preserves non-empty response unchanged', () => {
      const result = service.verify(BASE_RESULT, ['get_portfolio_summary']);

      expect(result.response).toBe(BASE_RESULT.response);
    });
  });

  // ─── passthrough fields ─────────────────────────────────────────────────────

  describe('passthrough fields', () => {
    it('copies elapsedMs, estimatedCostUsd, iterations, toolCalls, status, guardrail', () => {
      const input: ReactAgentRunResult = {
        ...BASE_RESULT,
        guardrail: 'TIMEOUT',
        status: 'partial'
      };

      const result = service.verify(input, []);

      expect(result.elapsedMs).toBe(input.elapsedMs);
      expect(result.estimatedCostUsd).toBe(input.estimatedCostUsd);
      expect(result.iterations).toBe(input.iterations);
      expect(result.toolCalls).toBe(input.toolCalls);
      expect(result.status).toBe(input.status);
      expect(result.guardrail).toBe(input.guardrail);
    });

    it('omits guardrail field when none triggered', () => {
      const result = service.verify(BASE_RESULT, ['get_portfolio_summary']);

      expect(result.guardrail).toBeUndefined();
    });
  });
});
