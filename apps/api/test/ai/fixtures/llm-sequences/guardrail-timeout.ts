import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

/**
 * Timeout guardrail: the LLM mock will use a slow promise that never resolves
 * until fake timers advance past timeoutMs.
 * This sequence is a placeholder — the actual slow behavior is controlled
 * by the mock implementation in the test, not by the fixture data.
 */
export const guardrailTimeout: LLMCompletionResponse[] = [
  {
    finishReason: 'stop',
    text: 'This response should never be delivered — timeout fires first.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
