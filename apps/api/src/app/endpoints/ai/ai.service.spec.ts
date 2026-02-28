import { ReactAgentService } from '@ghostfolio/api/app/endpoints/ai/agent/react-agent.service';
import { VerifiedResponse } from '@ghostfolio/api/app/endpoints/ai/contracts/final-response.schema';
import {
  LLM_CLIENT_TOKEN,
  LLMClient
} from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';
import { ToolRouterService } from '@ghostfolio/api/app/endpoints/ai/routing/tool-router.service';
import { ResponseVerifierService } from '@ghostfolio/api/app/endpoints/ai/verification/response-verifier.service';
import { PortfolioService } from '@ghostfolio/api/app/portfolio/portfolio.service';
import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';

import { Test } from '@nestjs/testing';
import { StatusCodes, getReasonPhrase } from 'http-status-codes';

import { AiService } from './ai.service';

/** Builds a minimal prismaService stub that records calls and satisfies the chat() transaction. */
function buildPrismaStub(convId = 'test-conv-id') {
  const txCreate = jest
    .fn()
    .mockResolvedValueOnce({ id: convId }) // chatConversation.create
    .mockResolvedValue({}); // chatMessage.create (×2)

  const txStub = {
    chatConversation: {
      create: txCreate,
      update: jest.fn().mockResolvedValue({})
    },
    chatMessage: { create: txCreate }
  };

  return {
    $transaction: jest
      .fn()
      .mockImplementation((cb: (tx: unknown) => unknown) => cb(txStub)),
    chatConversation: {
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({})
    },
    chatMessage: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([])
    }
  };
}

/** Creates a minimal AiService with lightweight stubs for all deps. */
function buildService({
  llmComplete = jest.fn(),
  agentRun = jest.fn().mockResolvedValue({
    elapsedMs: 100,
    estimatedCostUsd: 0,
    executedTools: [],
    iterations: 1,
    response: 'ok',
    status: 'completed',
    toolCalls: 0
  }),
  verifierVerify = jest.fn().mockImplementation((r) => ({
    ...r,
    chartData: [],
    confidence: 'high',
    warnings: [],
    sources: []
  })),
  portfolioGetDetails = jest.fn(),
  prismaService = buildPrismaStub()
} = {}) {
  return new AiService(
    { extract: jest.fn().mockReturnValue([]) } as any,
    { extract: jest.fn().mockReturnValue([]) } as any,
    { complete: llmComplete } as LLMClient,
    { getDetails: portfolioGetDetails } as any as PortfolioService,
    prismaService as any as PrismaService,
    { run: agentRun } as any as ReactAgentService,
    { verify: verifierVerify } as any as ResponseVerifierService,
    {
      selectTools: jest.fn().mockImplementation((_msg, available, caller) => ({
        tools: caller ?? available,
        source: caller ? 'caller_override' : 'fallback_all'
      }))
    } as any
  );
}

describe('AiService', () => {
  // ─── DI wiring ─────────────────────────────────────────────────────────────

  it('resolves the LLM adapter via DI and forwards generateText calls', async () => {
    const llmClient: LLMClient = {
      complete: jest.fn().mockResolvedValue({
        finishReason: 'stop',
        text: 'Portfolio summary',
        toolCalls: []
      })
    };

    const verifier = { verify: jest.fn().mockImplementation((r) => r) };

    const { ActionExtractorService } =
      await import('@ghostfolio/api/app/endpoints/ai/action-extractor.service');
    const { ChartDataExtractorService } =
      await import('@ghostfolio/api/app/endpoints/ai/chart-data-extractor.service');

    const module = await Test.createTestingModule({
      providers: [
        ActionExtractorService,
        AiService,
        ChartDataExtractorService,
        { provide: LLM_CLIENT_TOKEN, useValue: llmClient },
        { provide: PortfolioService, useValue: { getDetails: jest.fn() } },
        { provide: PrismaService, useValue: buildPrismaStub() },
        { provide: ReactAgentService, useValue: { run: jest.fn() } },
        { provide: ResponseVerifierService, useValue: verifier },
        {
          provide: ToolRouterService,
          useValue: {
            selectTools: jest
              .fn()
              .mockImplementation((_msg, available, caller) => ({
                tools: caller ?? available,
                source: caller ? 'caller_override' : 'fallback_all'
              }))
          }
        }
      ]
    }).compile();

    const aiService = module.get(AiService);
    const response = await aiService.generateText({
      prompt: 'Summarize my holdings'
    });

    expect(llmClient.complete).toHaveBeenCalledWith({
      messages: [{ content: 'Summarize my holdings', role: 'user' }],
      temperature: 0
    });

    expect(response).toEqual({
      finishReason: 'stop',
      text: 'Portfolio summary',
      toolCalls: []
    });
  });

  // ─── health ─────────────────────────────────────────────────────────────────

  it('returns an OK health status', () => {
    const service = buildService();

    expect(service.getHealth()).toEqual({
      status: getReasonPhrase(StatusCodes.OK)
    });
  });

  // ─── chat ──────────────────────────────────────────────────────────────────

  it('forwards chat requests to the ReAct agent with server-scoped userId', async () => {
    const rawResult = {
      elapsedMs: 500,
      estimatedCostUsd: 0.001,
      executedTools: [
        {
          toolName: 'get_portfolio_summary',
          envelope: { status: 'success', data: {} }
        }
      ],
      iterations: 2,
      response: 'Scoped response',
      status: 'completed' as const,
      toolCalls: 1
    };

    const verifiedResult: VerifiedResponse = {
      ...rawResult,
      actions: [],
      chartData: [],
      confidence: 'high',
      invokedToolNames: ['get_portfolio_summary'],
      sources: ['get_portfolio_summary'],
      warnings: []
    };

    const run = jest.fn().mockResolvedValue(rawResult);
    const verify = jest.fn().mockReturnValue(verifiedResult);
    const service = buildService({ agentRun: run, verifierVerify: verify });

    const response = await service.chat({
      message: 'What changed in my portfolio this week?',
      systemPrompt: 'be concise',
      toolNames: ['get_portfolio_summary'],
      userId: 'user-1'
    });

    expect(run).toHaveBeenCalledWith({
      priorMessages: [],
      prompt: 'What changed in my portfolio this week?',
      requestId: expect.any(String),
      systemPrompt: 'be concise',
      toolNames: ['get_portfolio_summary'],
      userId: 'user-1'
    });

    expect(verify).toHaveBeenCalledWith(rawResult, ['get_portfolio_summary']);
    expect(response).toEqual({
      ...verifiedResult,
      conversationId: expect.any(String)
    });
  });

  it('passes empty toolNames array to verifier when none provided', async () => {
    const verify = jest.fn().mockReturnValue({
      chartData: [],
      confidence: 'medium',
      sources: [],
      warnings: [
        'No portfolio data tools were used; response may not reflect current data.'
      ]
    });

    const service = buildService({ verifierVerify: verify });

    await service.chat({ message: 'Hello', userId: 'user-1' });

    expect(verify).toHaveBeenCalledWith(expect.anything(), []);
  });

  it('returns verified response with confidence and warnings from verifier', async () => {
    const verify = jest.fn().mockReturnValue({
      chartData: [],
      confidence: 'low',
      elapsedMs: 200,
      estimatedCostUsd: 0,
      iterations: 1,
      response: 'No response was generated. Please try again.',
      sources: [],
      status: 'failed',
      toolCalls: 0,
      warnings: ['Response could not be completed. Please try again.']
    });

    const service = buildService({
      agentRun: jest.fn().mockResolvedValue({
        elapsedMs: 200,
        estimatedCostUsd: 0,
        executedTools: [],
        iterations: 1,
        response: '',
        status: 'failed',
        toolCalls: 0
      }),
      verifierVerify: verify
    });

    const result = await service.chat({
      message: 'show my portfolio risk',
      userId: 'u1'
    });

    expect(result.confidence).toBe('low');
    expect(result.warnings).toContain(
      'Response could not be completed. Please try again.'
    );
  });

  // ─── getPrompt ──────────────────────────────────────────────────────────────

  // ─── scope enforcement (LLM-based via system prompt) ─────────────────────

  it('forwards all messages to the agent (scope is enforced by LLM system prompt)', async () => {
    const run = jest.fn().mockResolvedValue({
      elapsedMs: 100,
      estimatedCostUsd: 0,
      executedTools: [],
      iterations: 1,
      response: 'How can I help with your portfolio?',
      status: 'completed',
      toolCalls: 0
    });

    const service = buildService({ agentRun: run });

    // All of these should reach the agent — the LLM handles scope refusal
    for (const msg of [
      'ok',
      'yes please',
      'Show me my portfolio',
      'tell me more',
      'Fi fai fo fum',
      'whats 20 + 10'
    ]) {
      run.mockClear();
      await service.chat({ message: msg, userId: 'user-1' });
      expect(run).toHaveBeenCalledTimes(1);
    }
  });

  // ─── getPrompt ──────────────────────────────────────────────────────────────

  it('returns a holdings markdown table in portfolio mode sorted by allocation', async () => {
    const getDetails = jest.fn().mockResolvedValue({
      holdings: {
        MSFT: {
          allocationInPercentage: 0.2,
          assetClass: 'EQUITY',
          assetSubClass: 'LARGE_CAP',
          currency: 'USD',
          name: 'Microsoft',
          symbol: 'MSFT'
        },
        VOO: {
          allocationInPercentage: 0.5,
          assetClass: 'ETF',
          assetSubClass: 'BROAD_MARKET',
          currency: 'USD',
          name: 'Vanguard S&P 500',
          symbol: 'VOO'
        }
      }
    });

    const service = buildService({ portfolioGetDetails: getDetails });

    const prompt = await service.getPrompt({
      filters: [{ key: 'symbol', values: ['VOO'] }] as any,
      impersonationId: undefined,
      languageCode: 'en',
      mode: 'portfolio',
      userCurrency: 'USD',
      userId: 'user-1'
    });

    expect(getDetails).toHaveBeenCalledWith({
      filters: [{ key: 'symbol', values: ['VOO'] }],
      impersonationId: undefined,
      userId: 'user-1'
    });

    expect(prompt).toContain('Name');
    expect(prompt).toContain('Vanguard S&P 500');
    expect(prompt).toContain('Microsoft');
    expect(prompt.indexOf('Vanguard S&P 500')).toBeLessThan(
      prompt.indexOf('Microsoft')
    );
  });

  it('returns a structured analysis instruction in analysis mode', async () => {
    const service = buildService({
      portfolioGetDetails: jest.fn().mockResolvedValue({
        holdings: {
          AAPL: {
            allocationInPercentage: 0.7,
            assetClass: 'EQUITY',
            assetSubClass: undefined,
            currency: 'USD',
            name: 'Apple',
            symbol: 'AAPL'
          }
        }
      })
    });

    const prompt = await service.getPrompt({
      impersonationId: undefined,
      languageCode: 'de',
      mode: 'analysis',
      userCurrency: 'EUR',
      userId: 'user-42'
    });

    expect(prompt).toContain('base currency being EUR');
    expect(prompt).toContain('Risk Assessment:');
    expect(prompt).toContain(
      'Provide your answer in the following language: de.'
    );
    expect(prompt).toContain('Apple');
  });
});
