import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';

import { Injectable, NotFoundException } from '@nestjs/common';
import { ChatConversation, ChatMessage, ChatRole } from '@prisma/client';

/** Maps a raw Json field (unknown) to a safe string[] */
export function toToolNameArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.filter((v): v is string => typeof v === 'string');
}

export interface ConversationSummary {
  createdAt: Date;
  id: string;
  messageCount: number;
  title: string;
  updatedAt: Date;
}

export interface ConversationDetail {
  createdAt: Date;
  id: string;
  messages: {
    content: string;
    createdAt: Date;
    id: string;
    requestedToolNames: string[];
    role: ChatRole;
  }[];
  title: string;
  updatedAt: Date;
}

@Injectable()
export class ChatConversationService {
  public constructor(private readonly prismaService: PrismaService) {}

  /**
   * Returns conversations for a user ordered by most recently updated.
   * Includes message count for sidebar display.
   */
  public async listConversations(
    userId: string
  ): Promise<ConversationSummary[]> {
    const conversations = await this.prismaService.chatConversation.findMany({
      orderBy: { updatedAt: 'desc' },
      select: {
        _count: { select: { messages: true } },
        createdAt: true,
        id: true,
        title: true,
        updatedAt: true
      },
      where: { userId }
    });

    return conversations.map((c) => ({
      createdAt: c.createdAt,
      id: c.id,
      messageCount: c._count.messages,
      title: c.title,
      updatedAt: c.updatedAt
    }));
  }

  /**
   * Returns a single conversation with all messages ordered by seq.
   * Throws NotFoundException if not found or userId does not match (ownership check).
   */
  public async getConversation(
    id: string,
    userId: string
  ): Promise<ConversationDetail> {
    const conversation = await this.prismaService.chatConversation.findFirst({
      select: {
        createdAt: true,
        id: true,
        messages: {
          orderBy: { seq: 'asc' },
          select: {
            content: true,
            createdAt: true,
            id: true,
            requestedToolNames: true,
            role: true
          }
        },
        title: true,
        updatedAt: true
      },
      where: { id, userId }
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation not found: ${id}`);
    }

    return {
      createdAt: conversation.createdAt,
      id: conversation.id,
      messages: conversation.messages.map((m) => ({
        content: m.content,
        createdAt: m.createdAt,
        id: m.id,
        requestedToolNames: toToolNameArray(m.requestedToolNames),
        role: m.role
      })),
      title: conversation.title,
      updatedAt: conversation.updatedAt
    };
  }

  /**
   * Deletes a conversation and all its messages (cascade).
   * Throws NotFoundException if not found or userId does not match.
   */
  public async deleteConversation(id: string, userId: string): Promise<void> {
    const conversation = await this.prismaService.chatConversation.findFirst({
      select: { id: true },
      where: { id, userId }
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation not found: ${id}`);
    }

    await this.prismaService.chatConversation.delete({
      where: { id }
    });
  }
}

// Re-export types so controller/service don't need to import Prisma directly
export type { ChatConversation, ChatMessage };
