import { NotFoundException } from '@nestjs/common';

import {
  ChatConversationService,
  toToolNameArray
} from './chat-conversation.service';

/** Build a minimal PrismaService stub for ChatConversationService tests */
function buildPrisma() {
  return {
    chatConversation: {
      delete: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn(),
      findMany: jest.fn()
    }
  };
}

// ─── toToolNameArray helper ───────────────────────────────────────────────────

describe('toToolNameArray', () => {
  it('returns [] for non-array input', () => {
    expect(toToolNameArray(null)).toEqual([]);
    expect(toToolNameArray(undefined)).toEqual([]);
    expect(toToolNameArray('string')).toEqual([]);
    expect(toToolNameArray(42)).toEqual([]);
    expect(toToolNameArray({ a: 1 })).toEqual([]);
  });

  it('filters out non-string array elements', () => {
    expect(toToolNameArray(['a', 1, null, 'b', undefined, true])).toEqual([
      'a',
      'b'
    ]);
  });

  it('returns string array unchanged', () => {
    expect(toToolNameArray(['get_portfolio_summary', 'analyze_risk'])).toEqual([
      'get_portfolio_summary',
      'analyze_risk'
    ]);
  });

  it('returns [] for empty array', () => {
    expect(toToolNameArray([])).toEqual([]);
  });
});

// ─── listConversations ────────────────────────────────────────────────────────

describe('ChatConversationService.listConversations', () => {
  it('returns conversations ordered by updatedAt DESC with messageCount', async () => {
    const now = new Date();
    const earlier = new Date(now.getTime() - 60_000);

    const prisma = buildPrisma();
    prisma.chatConversation.findMany.mockResolvedValue([
      {
        _count: { messages: 3 },
        createdAt: now,
        id: 'conv-1',
        title: 'Recent conversation',
        updatedAt: now
      },
      {
        _count: { messages: 1 },
        createdAt: earlier,
        id: 'conv-2',
        title: 'Older conversation',
        updatedAt: earlier
      }
    ]);

    const service = new ChatConversationService(prisma as any);
    const result = await service.listConversations('user-1');

    expect(prisma.chatConversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { updatedAt: 'desc' },
        where: { userId: 'user-1' }
      })
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: 'conv-1', messageCount: 3 });
    expect(result[1]).toMatchObject({ id: 'conv-2', messageCount: 1 });
  });

  it('returns empty array when user has no conversations', async () => {
    const prisma = buildPrisma();
    prisma.chatConversation.findMany.mockResolvedValue([]);

    const service = new ChatConversationService(prisma as any);
    const result = await service.listConversations('user-with-no-history');

    expect(result).toEqual([]);
  });
});

// ─── getConversation ──────────────────────────────────────────────────────────

describe('ChatConversationService.getConversation', () => {
  it('returns conversation detail with messages in seq order', async () => {
    const prisma = buildPrisma();
    const createdAt = new Date();

    prisma.chatConversation.findFirst.mockResolvedValue({
      createdAt,
      id: 'conv-1',
      messages: [
        {
          content: 'Hello',
          createdAt,
          id: 'msg-1',
          requestedToolNames: [],
          role: 'user'
        },
        {
          content: 'Here is your portfolio summary.',
          createdAt,
          id: 'msg-2',
          requestedToolNames: ['get_portfolio_summary'],
          role: 'assistant'
        }
      ],
      title: 'Portfolio question',
      updatedAt: createdAt
    });

    const service = new ChatConversationService(prisma as any);
    const result = await service.getConversation('conv-1', 'user-1');

    // Ownership filter applied
    expect(prisma.chatConversation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'conv-1', userId: 'user-1' } })
    );

    // Messages ordered by seq ASC requested
    expect(prisma.chatConversation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          messages: expect.objectContaining({ orderBy: { seq: 'asc' } })
        })
      })
    );

    expect(result.id).toBe('conv-1');
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].role).toBe('user');
    expect(result.messages[1].role).toBe('assistant');
    expect(result.messages[1].requestedToolNames).toEqual([
      'get_portfolio_summary'
    ]);
  });

  it('throws NotFoundException when userId does not match (ownership check)', async () => {
    const prisma = buildPrisma();
    // Prisma WHERE includes userId, so wrong-user gets null
    prisma.chatConversation.findFirst.mockResolvedValue(null);

    const service = new ChatConversationService(prisma as any);

    await expect(
      service.getConversation('conv-1', 'wrong-user')
    ).rejects.toThrow(NotFoundException);
  });

  it('maps non-string requestedToolNames entries to empty array', async () => {
    const prisma = buildPrisma();
    prisma.chatConversation.findFirst.mockResolvedValue({
      createdAt: new Date(),
      id: 'conv-1',
      messages: [
        {
          content: 'Reply',
          createdAt: new Date(),
          id: 'msg-1',
          // Malformed JSON stored in DB — should be safely defaulted
          requestedToolNames: [42, null, 'valid_tool'],
          role: 'assistant'
        }
      ],
      title: 'Test',
      updatedAt: new Date()
    });

    const service = new ChatConversationService(prisma as any);
    const result = await service.getConversation('conv-1', 'user-1');

    expect(result.messages[0].requestedToolNames).toEqual(['valid_tool']);
  });
});

// ─── deleteConversation ───────────────────────────────────────────────────────

describe('ChatConversationService.deleteConversation', () => {
  it('deletes the conversation when ownership check passes', async () => {
    const prisma = buildPrisma();
    prisma.chatConversation.findFirst.mockResolvedValue({ id: 'conv-1' });

    const service = new ChatConversationService(prisma as any);
    await service.deleteConversation('conv-1', 'user-1');

    expect(prisma.chatConversation.delete).toHaveBeenCalledWith({
      where: { id: 'conv-1' }
    });
  });

  it('throws NotFoundException when userId does not match', async () => {
    const prisma = buildPrisma();
    // WHERE includes userId — wrong-user returns null
    prisma.chatConversation.findFirst.mockResolvedValue(null);

    const service = new ChatConversationService(prisma as any);

    await expect(
      service.deleteConversation('conv-1', 'wrong-user')
    ).rejects.toThrow(NotFoundException);

    // Never reaches the delete call
    expect(prisma.chatConversation.delete).not.toHaveBeenCalled();
  });
});
