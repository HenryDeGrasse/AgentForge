import { LLMClient } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';
import { ToolRegistry } from '@ghostfolio/api/app/endpoints/ai/tools/tool.registry';

import { ReactAgentService } from './react-agent.service';

describe('ReactAgentService', () => {
  let llmClient: LLMClient;
  let reactAgentService: ReactAgentService;
  let toolRegistry: ToolRegistry;

  const defaultGuardrails = {
    circuitBreakerCooldownMs: 60_000,
    circuitBreakerFailureThreshold: 3,
    costLimitUsd: 1,
    fallbackCostPer1kTokensUsd: 0.002,
    maxIterations: 4,
    timeoutMs: 1000
  };

  beforeEach(() => {
    llmClient = {
      complete: jest.fn()
    };

    toolRegistry = new ToolRegistry();
    reactAgentService = new ReactAgentService(llmClient, toolRegistry);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('runs the ReAct tool loop and returns a completed response', async () => {
    toolRegistry.register({
      description: 'Get portfolio summary data',
      execute: jest.fn().mockResolvedValue({
        status: 'success',
        totalValue: 12345
      }),
      inputSchema: {
        properties: {
          lookback: {
            type: 'string'
          }
        },
        required: ['lookback'],
        type: 'object'
      },
      name: 'get_portfolio_summary'
    });

    (llmClient.complete as jest.Mock)
      .mockResolvedValueOnce({
        finishReason: 'tool_calls',
        text: '',
        toolCalls: [
          {
            arguments: { lookback: '1y' },
            id: 'tool-call-1',
            name: 'get_portfolio_summary'
          }
        ],
        usage: {
          estimatedCostUsd: 0.001
        }
      })
      .mockResolvedValueOnce({
        finishReason: 'stop',
        text: 'Your portfolio is concentrated in 3 assets.',
        toolCalls: [],
        usage: {
          estimatedCostUsd: 0.001
        }
      });

    const result = await reactAgentService.run({
      guardrails: defaultGuardrails,
      prompt: 'Summarize my portfolio risk.',
      userId: 'user-1'
    });

    expect(result.status).toBe('completed');
    expect(result.response).toBe('Your portfolio is concentrated in 3 assets.');
    expect(result.iterations).toBe(2);

    expect(llmClient.complete).toHaveBeenCalledTimes(2);

    const secondCallRequest = (llmClient.complete as jest.Mock).mock
      .calls[1][0];

    expect(
      secondCallRequest.messages.some(({ role }) => {
        return role === 'tool';
      })
    ).toBe(true);
  });

  it('returns a partial response when max iterations is reached', async () => {
    toolRegistry.register({
      description: 'No-op',
      execute: jest.fn().mockResolvedValue({ status: 'success' }),
      inputSchema: {
        type: 'object'
      },
      name: 'get_portfolio_summary'
    });

    (llmClient.complete as jest.Mock).mockResolvedValue({
      finishReason: 'tool_calls',
      text: '',
      toolCalls: [
        {
          arguments: {},
          id: 'tool-call-1',
          name: 'get_portfolio_summary'
        }
      ]
    });

    const result = await reactAgentService.run({
      guardrails: {
        ...defaultGuardrails,
        maxIterations: 2
      },
      prompt: 'Loop forever please',
      userId: 'user-1'
    });

    expect(result.status).toBe('partial');
    expect(result.guardrail).toBe('MAX_ITERATIONS');
    expect(result.iterations).toBe(2);
  });

  it('returns a partial response when timeout guardrail is triggered by a slow model call', async () => {
    (llmClient.complete as jest.Mock).mockImplementation(() => {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            finishReason: 'stop',
            text: 'This came too late',
            toolCalls: []
          });
        }, 25);
      });
    });

    const result = await reactAgentService.run({
      guardrails: {
        ...defaultGuardrails,
        timeoutMs: 5
      },
      prompt: 'Please answer slowly',
      userId: 'user-1'
    });

    expect(result.status).toBe('partial');
    expect(result.guardrail).toBe('TIMEOUT');
  });

  it('returns a partial response when timeout guardrail is triggered during tool execution', async () => {
    toolRegistry.register({
      description: 'slow tool',
      execute: () => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({ status: 'success' });
          }, 25);
        });
      },
      inputSchema: {
        type: 'object'
      },
      name: 'slow_tool'
    });

    (llmClient.complete as jest.Mock).mockResolvedValue({
      finishReason: 'tool_calls',
      text: '',
      toolCalls: [
        {
          arguments: {},
          id: 'slow-tool-1',
          name: 'slow_tool'
        }
      ]
    });

    const result = await reactAgentService.run({
      guardrails: {
        ...defaultGuardrails,
        timeoutMs: 5
      },
      prompt: 'Run slow tool',
      userId: 'user-1'
    });

    expect(result.status).toBe('partial');
    expect(result.guardrail).toBe('TIMEOUT');
  });

  it('returns a partial response when cost limit guardrail is triggered by estimatedCostUsd', async () => {
    (llmClient.complete as jest.Mock).mockResolvedValue({
      finishReason: 'stop',
      text: 'Costly answer',
      toolCalls: [],
      usage: {
        estimatedCostUsd: 0.2
      }
    });

    const result = await reactAgentService.run({
      guardrails: {
        ...defaultGuardrails,
        costLimitUsd: 0.05
      },
      prompt: 'Give me everything about my portfolio',
      userId: 'user-1'
    });

    expect(result.status).toBe('partial');
    expect(result.guardrail).toBe('COST_LIMIT');
    expect(result.iterations).toBe(1);
  });

  it('returns a partial response when cost limit is derived from token usage fallback', async () => {
    (llmClient.complete as jest.Mock).mockResolvedValue({
      finishReason: 'stop',
      text: 'Token expensive answer',
      toolCalls: [],
      usage: {
        totalTokens: 60_000
      }
    });

    const result = await reactAgentService.run({
      guardrails: {
        ...defaultGuardrails,
        costLimitUsd: 0.05,
        fallbackCostPer1kTokensUsd: 0.002
      },
      prompt: 'What is everything I own?',
      userId: 'user-1'
    });

    expect(result.status).toBe('partial');
    expect(result.guardrail).toBe('COST_LIMIT');
    expect(result.estimatedCostUsd).toBe(0.12);
  });

  it('injects a structured tool_not_found error message for unknown tools', async () => {
    (llmClient.complete as jest.Mock)
      .mockResolvedValueOnce({
        finishReason: 'tool_calls',
        text: '',
        toolCalls: [
          {
            arguments: { lookback: '1y' },
            id: 'missing-tool-1',
            name: 'missing_tool'
          }
        ]
      })
      .mockResolvedValueOnce({
        finishReason: 'stop',
        text: 'Done after missing tool',
        toolCalls: []
      });

    const result = await reactAgentService.run({
      guardrails: defaultGuardrails,
      prompt: 'Use a missing tool',
      userId: 'user-1'
    });

    expect(result.status).toBe('completed');
    expect(result.response).toBe('Done after missing tool');

    const secondCallRequest = (llmClient.complete as jest.Mock).mock
      .calls[1][0];
    const toolMessage = secondCallRequest.messages.find(({ role }) => {
      return role === 'tool';
    });

    expect(toolMessage).toBeDefined();
    expect(JSON.parse(toolMessage.content)).toMatchObject({
      error: {
        code: 'tool_not_found'
      },
      status: 'error'
    });
  });

  it('injects a structured error tool message when tool execution fails', async () => {
    toolRegistry.register({
      description: 'always fails',
      execute: jest.fn().mockRejectedValue(new Error('Boom from tool')),
      inputSchema: {
        type: 'object'
      },
      name: 'failing_tool'
    });

    (llmClient.complete as jest.Mock)
      .mockResolvedValueOnce({
        finishReason: 'tool_calls',
        text: '',
        toolCalls: [
          {
            arguments: {},
            id: 'failing-tool-1',
            name: 'failing_tool'
          }
        ]
      })
      .mockResolvedValueOnce({
        finishReason: 'stop',
        text: 'Recovered from tool error',
        toolCalls: []
      });

    const result = await reactAgentService.run({
      guardrails: defaultGuardrails,
      prompt: 'Run failing tool',
      userId: 'user-1'
    });

    expect(result.status).toBe('completed');
    expect(result.response).toBe('Recovered from tool error');

    const secondCallRequest = (llmClient.complete as jest.Mock).mock
      .calls[1][0];
    const toolMessage = secondCallRequest.messages.find(({ role }) => {
      return role === 'tool';
    });

    expect(toolMessage).toBeDefined();
    expect(JSON.parse(toolMessage.content)).toMatchObject({
      error: {
        code: 'tool_execution_failed',
        message: 'Boom from tool'
      },
      status: 'error'
    });
  });

  it('opens circuit breaker after repeated failures and recovers after cooldown', async () => {
    let now = 1_000;

    jest.spyOn(Date, 'now').mockImplementation(() => {
      return now;
    });

    (llmClient.complete as jest.Mock)
      .mockRejectedValueOnce(new Error('Provider unavailable #1'))
      .mockRejectedValueOnce(new Error('Provider unavailable #2'))
      .mockResolvedValueOnce({
        finishReason: 'stop',
        text: 'Recovered response',
        toolCalls: []
      })
      .mockResolvedValueOnce({
        finishReason: 'stop',
        text: 'Healthy after recovery',
        toolCalls: []
      });

    const guardrails = {
      ...defaultGuardrails,
      circuitBreakerCooldownMs: 100,
      circuitBreakerFailureThreshold: 2
    };

    const firstAttempt = await reactAgentService.run({
      guardrails,
      prompt: 'Try #1',
      userId: 'user-1'
    });

    const secondAttempt = await reactAgentService.run({
      guardrails,
      prompt: 'Try #2',
      userId: 'user-1'
    });

    const blockedAttempt = await reactAgentService.run({
      guardrails,
      prompt: 'Try #3',
      userId: 'user-1'
    });

    now += 101;

    const recoveredAttempt = await reactAgentService.run({
      guardrails,
      prompt: 'Try #4',
      userId: 'user-1'
    });

    const healthyAttempt = await reactAgentService.run({
      guardrails,
      prompt: 'Try #5',
      userId: 'user-1'
    });

    expect(firstAttempt.status).toBe('failed');
    expect(secondAttempt.status).toBe('failed');

    expect(blockedAttempt.status).toBe('partial');
    expect(blockedAttempt.guardrail).toBe('CIRCUIT_BREAKER');

    expect(recoveredAttempt.status).toBe('completed');
    expect(recoveredAttempt.response).toBe('Recovered response');

    expect(healthyAttempt.status).toBe('completed');
    expect(healthyAttempt.response).toBe('Healthy after recovery');

    expect(llmClient.complete).toHaveBeenCalledTimes(4);
  });
});
