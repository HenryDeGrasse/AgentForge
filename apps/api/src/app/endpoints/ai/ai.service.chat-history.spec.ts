/**
 * Chat history integration tests for AiService.chat()
 *
 * Tests conversation creation, continuation, priorMessages injection,
 * history cap, updatedAt touch, systemPrompt freeze, and seq ordering.
 */
import {
  AGENT_DEFAULT_SYSTEM_PROMPT,
  AGENT_MAX_HISTORY_PAIRS
} from '@ghostfolio/api/app/endpoints/ai/agent/agent.constants';
import { ReactAgentService } from '@ghostfolio/api/app/endpoints/ai/agent/react-agent.service';
import { VerifiedResponse } from '@ghostfolio/api/app/endpoints/ai/contracts/final-response.schema';
import { LLMClient } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';
import { ResponseVerifierService } from '@ghostfolio/api/app/endpoints/ai/verification/response-verifier.service';
import { PortfolioService } from '@ghostfolio/api/app/portfolio/portfolio.service';
import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';

import { BadRequestException } from '@nestjs/common';

import { AiService } from './ai.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STUB_AGENT_RESULT = {
  elapsedMs: 100,
  estimatedCostUsd: 0.001,
  executedTools: [],
  iterations: 1,
  response: 'Agent reply',
  sources: ['get_portfolio_summary'],
  status: 'completed' as const,
  toolCalls: 1
};

const STUB_VERIFIED: VerifiedResponse = {
  ...STUB_AGENT_RESULT,
  actions: [],
  chartData: [],
  confidence: 'high',
  invokedToolNames: ['get_portfolio_summary'],
  warnings: []
};

function buildAgentRun(result = STUB_AGENT_RESULT) {
  return jest.fn().mockResolvedValue(result);
}

function buildVerifier(result: VerifiedResponse = STUB_VERIFIED) {
  return jest.fn().mockReturnValue(result);
}

/**
 * Builds a prismaService mock with full tx introspection.
 * txConvCreate / txMsgCreates are separate mocks so we can inspect
 * call order and args independently.
 */
function buildPrisma({
  conversationId = 'new-conv-id',
  existingConvSystemPrompt,
  priorDbMessages = []
}: {
  conversationId?: string;
  existingConvSystemPrompt?: string;
  priorDbMessages?: { content: string; role: string; seq: number }[];
} = {}) {
  const txConvCreate = jest.fn().mockResolvedValue({ id: conversationId });
  const txConvUpdate = jest.fn().mockResolvedValue({});
  const txMsgCreate = jest.fn().mockResolvedValue({});

  const txStub = {
    chatConversation: { create: txConvCreate, update: txConvUpdate },
    chatMessage: { create: txMsgCreate }
  };

  return {
    _txConvCreate: txConvCreate,
    _txConvUpdate: txConvUpdate,
    _txMsgCreate: txMsgCreate,
    prismaService: {
      $transaction: jest
        .fn()
        .mockImplementation(async (cb: (tx: unknown) => unknown) => cb(txStub)),
      chatConversation: {
        findFirst: jest
          .fn()
          .mockResolvedValue(
            existingConvSystemPrompt !== undefined
              ? { systemPrompt: existingConvSystemPrompt }
              : null
          )
      },
      chatMessage: {
        findMany: jest.fn().mockResolvedValue(priorDbMessages)
      }
    } as unknown as PrismaService
  };
}

function buildService(
  prismaService: PrismaService,
  agentRun = buildAgentRun(),
  verifierVerify = buildVerifier()
) {
  return new AiService(
    { extract: jest.fn().mockReturnValue([]) } as any,
    { extract: jest.fn().mockReturnValue([]) } as any,
    { complete: jest.fn() } as LLMClient,
    { getDetails: jest.fn() } as any as PortfolioService,
    prismaService,
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

// ─── Test 5: New conversation created, two messages persisted ─────────────────

describe('AiService.chat() — new conversation', () => {
  it('creates conversation and persists user + assistant messages, returns conversationId', async () => {
    const { _txConvCreate, _txMsgCreate, prismaService } = buildPrisma({
      conversationId: 'new-conv-id'
    });

    const service = buildService(prismaService);

    const result = await service.chat({
      message: 'What are my top holdings?',
      userId: 'user-1'
    });

    // conversationId returned in response
    expect(result.conversationId).toBe('new-conv-id');

    // Conversation row created with title (message truncated), userId, system prompt
    expect(_txConvCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        systemPrompt: AGENT_DEFAULT_SYSTEM_PROMPT,
        title: 'What are my top holdings?',
        userId: 'user-1'
      }),
      select: { id: true }
    });

    // Two messages created — user first, then assistant
    expect(_txMsgCreate).toHaveBeenCalledTimes(2);

    const [userCall, assistantCall] = _txMsgCreate.mock.calls;

    expect(userCall[0]).toMatchObject({
      data: expect.objectContaining({
        content: 'What are my top holdings?',
        role: 'user'
      })
    });

    expect(assistantCall[0]).toMatchObject({
      data: expect.objectContaining({ role: 'assistant' })
    });
  });

  it('truncates long messages to 60 chars for the conversation title', async () => {
    const { _txConvCreate, prismaService } = buildPrisma();
    const service = buildService(prismaService);

    const longMessage = 'Show my portfolio holdings ' + 'A'.repeat(94);
    await service.chat({ message: longMessage, userId: 'user-1' });

    expect(_txConvCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: ('Show my portfolio holdings ' + 'A'.repeat(94)).slice(0, 60)
        })
      })
    );
  });

  it('collapses whitespace/newlines in title before truncating', async () => {
    const { _txConvCreate, prismaService } = buildPrisma();
    const service = buildService(prismaService);

    await service.chat({
      message: 'Show\n  portfolio\t\tholdings',
      userId: 'user-1'
    });

    expect(_txConvCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ title: 'Show portfolio holdings' })
      })
    );
  });
});

// ─── Test 6: Second chat receives priorMessages ───────────────────────────────

describe('AiService.chat() — continuing a conversation', () => {
  it('passes prior messages to the agent on continuation', async () => {
    const priorDbMessages = [
      // Mock returns DESC order (as Prisma orderBy: { seq: 'desc' } would).
      // Service reverses them to restore chronological order.
      { content: 'You have 5 holdings.', role: 'assistant', seq: 2 }, // newest first
      { content: 'What are my holdings?', role: 'user', seq: 1 }
    ];

    const { prismaService } = buildPrisma({
      conversationId: 'existing-conv-id',
      existingConvSystemPrompt: AGENT_DEFAULT_SYSTEM_PROMPT,
      priorDbMessages
    });

    const agentRun = buildAgentRun();
    const service = buildService(prismaService, agentRun);

    await service.chat({
      conversationId: 'existing-conv-id',
      message: 'Now compare my portfolio to last month',
      userId: 'user-1'
    });

    // Agent receives messages in chronological order (oldest first)
    const runCall = agentRun.mock.calls[0][0];

    expect(runCall.priorMessages).toHaveLength(2);
    expect(runCall.priorMessages[0]).toMatchObject({
      content: 'What are my holdings?',
      role: 'user'
    });
    expect(runCall.priorMessages[1]).toMatchObject({
      content: 'You have 5 holdings.',
      role: 'assistant'
    });
  });

  it('uses the stored systemPrompt, not the default', async () => {
    const customPrompt = 'Be very terse.';
    const { prismaService } = buildPrisma({
      conversationId: 'existing-conv-id',
      existingConvSystemPrompt: customPrompt
    });

    const agentRun = buildAgentRun();
    const service = buildService(prismaService, agentRun);

    await service.chat({
      conversationId: 'existing-conv-id',
      message: 'Hello',
      userId: 'user-1'
    });

    expect(agentRun.mock.calls[0][0].systemPrompt).toBe(customPrompt);
  });
});

// ─── Test 7: updatedAt touched on continuation ───────────────────────────────

describe('AiService.chat() — updatedAt touch', () => {
  it('updates updatedAt on the ChatConversation row when appending to existing conversation', async () => {
    const { _txConvUpdate, prismaService } = buildPrisma({
      conversationId: 'existing-conv-id',
      existingConvSystemPrompt: AGENT_DEFAULT_SYSTEM_PROMPT
    });

    const service = buildService(prismaService);

    await service.chat({
      conversationId: 'existing-conv-id',
      message: 'What about my stock allocation?',
      userId: 'user-1'
    });

    expect(_txConvUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ updatedAt: expect.any(Date) }),
        where: { id: 'existing-conv-id' }
      })
    );
  });
});

// ─── Test 8: systemPrompt on existing conversation → 400 ─────────────────────

describe('AiService.chat() — systemPrompt freeze', () => {
  it('throws BadRequestException when systemPrompt is supplied for an existing conversation', async () => {
    const { prismaService } = buildPrisma({
      conversationId: 'existing-conv-id',
      existingConvSystemPrompt: AGENT_DEFAULT_SYSTEM_PROMPT
    });

    const service = buildService(prismaService);

    await expect(
      service.chat({
        conversationId: 'existing-conv-id',
        message: 'Hello',
        systemPrompt: 'Different prompt',
        userId: 'user-1'
      })
    ).rejects.toThrow(BadRequestException);
  });
});

// ─── Test 9: History cap ──────────────────────────────────────────────────────

describe('AiService.chat() — history cap', () => {
  it(`queries only the last ${AGENT_MAX_HISTORY_PAIRS * 2} messages regardless of conversation length`, async () => {
    // Simulate a long conversation: DB has 30 messages but we should only fetch 20
    const { prismaService } = buildPrisma({
      conversationId: 'long-conv-id',
      existingConvSystemPrompt: AGENT_DEFAULT_SYSTEM_PROMPT,
      priorDbMessages: [] // doesn't matter for this test — we check the query params
    });

    const service = buildService(prismaService);

    await service.chat({
      conversationId: 'long-conv-id',
      message: 'Show latest portfolio value',
      userId: 'user-1'
    });

    expect(prismaService.chatMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { seq: 'desc' },
        take: AGENT_MAX_HISTORY_PAIRS * 2,
        where: { conversationId: 'long-conv-id' }
      })
    );
  });

  it('reverses fetched messages to restore chronological order before passing to agent', async () => {
    // Simulate DB returning messages newest-first (desc order)
    const newestFirst = [
      { content: 'Latest reply', role: 'assistant', seq: 4 },
      { content: 'Latest question', role: 'user', seq: 3 },
      { content: 'First reply', role: 'assistant', seq: 2 },
      { content: 'First question', role: 'user', seq: 1 }
    ];

    const { prismaService } = buildPrisma({
      conversationId: 'conv-id',
      existingConvSystemPrompt: AGENT_DEFAULT_SYSTEM_PROMPT,
      priorDbMessages: newestFirst
    });

    const agentRun = buildAgentRun();
    const service = buildService(prismaService, agentRun);

    await service.chat({
      conversationId: 'conv-id',
      message: 'Show my investment returns',
      userId: 'user-1'
    });

    const priorMessages = agentRun.mock.calls[0][0].priorMessages;

    // Should be chronological: oldest first
    expect(priorMessages[0].content).toBe('First question');
    expect(priorMessages[1].content).toBe('First reply');
    expect(priorMessages[2].content).toBe('Latest question');
    expect(priorMessages[3].content).toBe('Latest reply');
  });
});

// ─── Test 12: Seq ordering (user before assistant) ────────────────────────────

describe('AiService.chat() — seq ordering guarantee', () => {
  it('inserts user message before assistant message within the transaction', async () => {
    const { _txMsgCreate, prismaService } = buildPrisma();

    const service = buildService(prismaService);

    await service.chat({ message: 'Hello', userId: 'user-1' });

    expect(_txMsgCreate).toHaveBeenCalledTimes(2);

    // First create = user message
    const firstInsert = _txMsgCreate.mock.calls[0][0];
    expect(firstInsert.data.role).toBe('user');

    // Second create = assistant message
    const secondInsert = _txMsgCreate.mock.calls[1][0];
    expect(secondInsert.data.role).toBe('assistant');
  });

  it('stores estimatedCostUsd on assistant message, not on user message', async () => {
    const { _txMsgCreate, prismaService } = buildPrisma();

    const service = buildService(prismaService);

    await service.chat({ message: 'Show portfolio value', userId: 'user-1' });

    const userInsert = _txMsgCreate.mock.calls[0][0].data;
    const assistantInsert = _txMsgCreate.mock.calls[1][0].data;

    // User messages never carry cost
    expect(userInsert.estimatedCostUsd).toBeUndefined();

    // Assistant message carries the cost from VerifiedResponse
    expect(assistantInsert.estimatedCostUsd).toBe(
      STUB_VERIFIED.estimatedCostUsd
    );
  });
});

// ─── Ambiguous follow-up routing ─────────────────────────────────────────────

describe('AiService.chat() — ambiguous follow-up routing', () => {
  it('asks for clarification when vague follow-up follows a scope refusal', async () => {
    const priorDbMessages = [
      {
        content:
          "I can't help with that request. I'm a portfolio analysis assistant and can only help with: portfolio summaries, transaction history, risk analysis.",
        role: 'assistant',
        seq: 2
      },
      { content: 'Tell me a joke', role: 'user', seq: 1 }
    ];

    const { prismaService } = buildPrisma({
      conversationId: 'conv-after-refusal',
      existingConvSystemPrompt: AGENT_DEFAULT_SYSTEM_PROMPT,
      priorDbMessages
    });

    const agentRun = buildAgentRun();
    const service = buildService(prismaService, agentRun);

    const result = await service.chat({
      conversationId: 'conv-after-refusal',
      message: 'based on that, tell me more',
      userId: 'user-1'
    });

    // Should NOT call the agent — should ask for clarification
    expect(agentRun).not.toHaveBeenCalled();
    expect(result.toolCalls).toBe(0);
    expect(result.response.toLowerCase()).toMatch(
      /more specific|which|portfolio summar/
    );
  });

  it('allows vague follow-up when last assistant message was portfolio-related', async () => {
    const priorDbMessages = [
      {
        content:
          'Your portfolio has a total value of $71,891.80 with 10 holdings.',
        role: 'assistant',
        seq: 2
      },
      { content: 'Show my portfolio summary', role: 'user', seq: 1 }
    ];

    const { prismaService } = buildPrisma({
      conversationId: 'conv-after-portfolio',
      existingConvSystemPrompt: AGENT_DEFAULT_SYSTEM_PROMPT,
      priorDbMessages
    });

    const agentRun = buildAgentRun();
    const service = buildService(prismaService, agentRun);

    await service.chat({
      conversationId: 'conv-after-portfolio',
      message: 'based on that, analyze the risk',
      userId: 'user-1'
    });

    // Should call the agent — valid follow-up to portfolio context
    expect(agentRun).toHaveBeenCalledTimes(1);
  });

  it('asks for clarification when vague follow-up has no conversation history', async () => {
    // New conversation (no conversationId) → no prior messages
    const agentRun = buildAgentRun();
    const service = buildService(buildPrisma().prismaService, agentRun);

    const result = await service.chat({
      message: 'tell me more',
      userId: 'user-1'
    });

    expect(agentRun).not.toHaveBeenCalled();
    expect(result.toolCalls).toBe(0);
    expect(result.response.toLowerCase()).toMatch(
      /more specific|which|portfolio summar/
    );
  });
});

// ─── Unknown tool name validation ────────────────────────────────────────────

describe('AiService.chat() — toolNames validation', () => {
  it('throws BadRequestException for unknown tool names', async () => {
    const { prismaService } = buildPrisma();
    const service = buildService(prismaService);

    await expect(
      service.chat({
        message: 'Hello',
        toolNames: ['get_portfolio_summary', 'nonexistent_tool'],
        userId: 'user-1'
      })
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts undefined toolNames (defaults to full curated allowlist)', async () => {
    const { prismaService } = buildPrisma();
    const agentRun = buildAgentRun();
    const service = buildService(prismaService, agentRun);

    await service.chat({ message: 'Hello', userId: 'user-1' });

    // toolNames: undefined now defaults to all curated tools
    expect(agentRun.mock.calls[0][0].toolNames).toEqual([
      'analyze_risk',
      'compliance_check',
      'get_portfolio_summary',
      'get_transaction_history',
      'market_data_lookup',
      'performance_compare',
      'rebalance_suggest',
      'simulate_trades',
      'stress_test',
      'tax_estimate'
    ]);
  });

  it('deduplicates and trims tool names', async () => {
    const { prismaService } = buildPrisma();
    const agentRun = buildAgentRun();
    const service = buildService(prismaService, agentRun);

    await service.chat({
      message: 'Hello',
      toolNames: [
        ' get_portfolio_summary ',
        'get_portfolio_summary',
        'analyze_risk'
      ],
      userId: 'user-1'
    });

    expect(agentRun.mock.calls[0][0].toolNames).toEqual([
      'get_portfolio_summary',
      'analyze_risk'
    ]);
  });
});
