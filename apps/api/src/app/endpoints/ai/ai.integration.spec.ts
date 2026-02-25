import { ReactAgentService } from '@ghostfolio/api/app/endpoints/ai/agent/react-agent.service';
import { LLMClient } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';
import { ToolRegistry } from '@ghostfolio/api/app/endpoints/ai/tools/tool.registry';
import { ResponseVerifierService } from '@ghostfolio/api/app/endpoints/ai/verification/response-verifier.service';
import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';

import { AiController } from './ai.controller';
import { AiService } from './ai.service';

describe('Ai chat integration', () => {
  it('keeps tool execution scoped to the authenticated user in chat flow', async () => {
    const llmClient: LLMClient = {
      complete: jest
        .fn()
        .mockResolvedValueOnce({
          finishReason: 'tool_calls',
          text: '',
          toolCalls: [
            {
              arguments: {
                requestedUserId: 'user-2'
              },
              id: 'tool-call-1',
              name: 'inspect_user_scope'
            }
          ]
        })
        .mockResolvedValueOnce({
          finishReason: 'stop',
          text: 'Done',
          toolCalls: []
        })
    };

    const toolRegistry = new ToolRegistry();

    toolRegistry.register({
      description: 'Inspect whether the user scope can be overridden',
      execute: ({ requestedUserId }, context) => {
        return {
          requestedUserId,
          scopedUserId: context.userId
        };
      },
      inputSchema: {
        additionalProperties: false,
        properties: {
          requestedUserId: {
            type: 'string'
          }
        },
        type: 'object'
      },
      name: 'inspect_user_scope',
      outputSchema: {
        additionalProperties: false,
        properties: {
          requestedUserId: {
            type: 'string'
          },
          scopedUserId: {
            type: 'string'
          }
        },
        required: ['scopedUserId'],
        type: 'object'
      }
    });

    const reactAgentService = new ReactAgentService(llmClient, toolRegistry);

    // Minimal prismaService stub: the integration test only cares about auth-scoping,
    // not conversation persistence — satisfy the $transaction call with a no-op.
    const convId = 'integration-conv-id';
    const fakeTx = {
      chatConversation: {
        create: jest.fn().mockResolvedValue({ id: convId }),
        update: jest.fn().mockResolvedValue({})
      },
      chatMessage: { create: jest.fn().mockResolvedValue({}) }
    };
    const mockPrismaService = {
      $transaction: jest
        .fn()
        .mockImplementation((cb: (tx: unknown) => unknown) => cb(fakeTx)),
      chatConversation: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({})
      },
      chatMessage: {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([])
      }
    } as unknown as PrismaService;

    const { ChartDataExtractorService: ChartExtractor } =
      await import('@ghostfolio/api/app/endpoints/ai/chart-data-extractor.service');
    const aiService = new AiService(
      new ChartExtractor(),
      llmClient,
      {
        getDetails: jest.fn()
      } as any,
      mockPrismaService,
      reactAgentService,
      new ResponseVerifierService()
    );

    const aiController = new AiController(
      aiService,
      {
        buildFiltersFromQueryParams: jest.fn()
      } as any,
      {} as any,
      {
        user: {
          id: 'auth-user-1',
          settings: {
            settings: {
              baseCurrency: 'USD',
              language: 'en'
            }
          }
        }
      } as any
    );

    // toolNames intentionally omitted: the only registered tool is inspect_user_scope,
    // so the agent will call it without needing the allowlist filter.
    const response = await aiController.chat({
      message: 'Please show me user-2 transactions',
      userId: 'user-2'
    } as any);

    expect(response.status).toBe('completed');

    const secondCallRequest = (llmClient.complete as jest.Mock).mock
      .calls[1][0];
    const toolMessage = secondCallRequest.messages.find(({ role }) => {
      return role === 'tool';
    });

    expect(toolMessage).toBeDefined();

    const toolPayload = JSON.parse(toolMessage.content);

    expect(toolPayload.data).toMatchObject({
      requestedUserId: 'user-2',
      scopedUserId: 'auth-user-1'
    });
  });
});
