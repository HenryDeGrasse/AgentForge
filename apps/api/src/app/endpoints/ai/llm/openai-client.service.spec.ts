import { OpenAiClientService } from './openai-client.service';

describe('OpenAiClientService', () => {
  it('maps OpenAI tool-calling responses into the adapter contract', async () => {
    const create = jest.fn().mockResolvedValue({
      choices: [
        {
          finish_reason: 'tool_calls',
          message: {
            content: null,
            tool_calls: [
              {
                function: {
                  arguments: '{"lookback":"1y"}',
                  name: 'get_portfolio_summary'
                },
                id: 'tool-call-1',
                type: 'function'
              }
            ]
          }
        }
      ],
      usage: {
        completion_tokens: 12,
        prompt_tokens: 8,
        total_tokens: 20
      }
    });

    const openAiClientService = new OpenAiClientService({
      chat: {
        completions: {
          create
        }
      }
    } as any);

    const response = await openAiClientService.complete({
      messages: [{ content: 'Summarize my portfolio', role: 'user' }],
      tools: [
        {
          description: 'Get allocation and totals',
          inputSchema: {
            properties: {
              lookback: {
                type: 'string'
              }
            },
            type: 'object'
          },
          name: 'get_portfolio_summary'
        }
      ]
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ content: 'Summarize my portfolio', role: 'user' }],
        model: expect.any(String)
      })
    );

    expect(response).toEqual({
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
        completionTokens: 12,
        estimatedCostUsd: 0.00004,
        promptTokens: 8,
        totalTokens: 20
      }
    });
  });

  it('maps structured responses when JSON schema mode is requested', async () => {
    const create = jest.fn().mockResolvedValue({
      choices: [
        {
          finish_reason: 'stop',
          message: {
            content: [{ text: '{"verdict":"safe"}' }],
            tool_calls: []
          }
        }
      ]
    });

    const openAiClientService = new OpenAiClientService({
      chat: {
        completions: {
          create
        }
      }
    } as any);

    const response = await openAiClientService.complete({
      messages: [{ content: 'Validate this portfolio response', role: 'user' }],
      response: {
        name: 'final_response',
        schema: {
          properties: {
            verdict: {
              type: 'string'
            }
          },
          required: ['verdict'],
          type: 'object'
        }
      }
    });

    expect(response).toEqual({
      finishReason: 'stop',
      structuredResponse: { verdict: 'safe' },
      text: '{"verdict":"safe"}',
      toolCalls: []
    });
  });

  it('falls back safely for invalid JSON and unknown finish reasons', async () => {
    const create = jest.fn().mockResolvedValue({
      choices: [
        {
          finish_reason: 'content_filter',
          message: {
            content: 'not-json',
            tool_calls: [
              {
                function: {
                  arguments: '{"x":1}',
                  name: 5
                },
                id: 'tool-call-1'
              }
            ]
          }
        }
      ]
    });

    const openAiClientService = new OpenAiClientService({
      chat: {
        completions: {
          create
        }
      }
    } as any);

    const response = await openAiClientService.complete({
      messages: [{ content: 'Return invalid json', role: 'user' }],
      response: {
        name: 'final_response',
        schema: {
          type: 'object'
        }
      }
    });

    expect(response).toEqual({
      finishReason: 'unknown',
      structuredResponse: {},
      text: 'not-json',
      toolCalls: []
    });
  });

  it('throws if no injected client is present and OPENAI_API_KEY is missing', async () => {
    const originalOpenAiApiKey = process.env.OPENAI_API_KEY;

    delete process.env.OPENAI_API_KEY;

    const openAiClientService = new OpenAiClientService();

    await expect(
      openAiClientService.complete({
        messages: [{ content: 'hello', role: 'user' }]
      })
    ).rejects.toThrow('Missing OPENAI_API_KEY environment variable.');

    if (originalOpenAiApiKey !== undefined) {
      process.env.OPENAI_API_KEY = originalOpenAiApiKey;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
  });
});
