import { HasPermission } from '@ghostfolio/api/decorators/has-permission.decorator';
import { HasPermissionGuard } from '@ghostfolio/api/guards/has-permission.guard';
import { ApiService } from '@ghostfolio/api/services/api/api.service';
import { AiPromptResponse } from '@ghostfolio/common/interfaces';
import { permissions } from '@ghostfolio/common/permissions';
import type { AiPromptMode, RequestWithUser } from '@ghostfolio/common/types';

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';

import { AiService } from './ai.service';
import { ChatConversationService } from './chat-conversation.service';
import { ChatDto } from './chat.dto';

@Controller('ai')
export class AiController {
  public constructor(
    private readonly aiService: AiService,
    private readonly apiService: ApiService,
    private readonly chatConversationService: ChatConversationService,
    @Inject(REQUEST) private readonly request: RequestWithUser
  ) {}

  @Get('health')
  public getHealth() {
    return this.aiService.getHealth();
  }

  @Post('chat')
  @HasPermission(permissions.accessAssistant)
  @UseGuards(AuthGuard('jwt'), HasPermissionGuard)
  public chat(
    @Body() { conversationId, message, systemPrompt, toolNames }: ChatDto
  ) {
    return this.aiService.chat({
      conversationId,
      message,
      systemPrompt,
      toolNames,
      userId: this.request.user.id
    });
  }

  @Post('chat/stream')
  @HasPermission(permissions.accessAssistant)
  @UseGuards(AuthGuard('jwt'), HasPermissionGuard)
  public async chatStream(
    @Body() { conversationId, message, systemPrompt, toolNames }: ChatDto,
    @Req() req: Request,
    @Res() res: Response
  ) {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Abort propagation: client disconnect → abort agent
    const abortController = new AbortController();

    req.on('close', () => {
      abortController.abort();
    });

    try {
      for await (const event of this.aiService.chatStream({
        conversationId,
        message,
        signal: abortController.signal,
        systemPrompt,
        toolNames,
        userId: this.request.user.id
      })) {
        if (abortController.signal.aborted) {
          break;
        }

        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } catch {
      // Stream error — write error event if connection still open
      if (!abortController.signal.aborted) {
        res.write(
          `data: ${JSON.stringify({ type: 'error', message: 'Stream interrupted unexpectedly.' })}\n\n`
        );
      }
    } finally {
      res.end();
    }
  }

  @Get('conversations')
  @HasPermission(permissions.accessAssistant)
  @UseGuards(AuthGuard('jwt'), HasPermissionGuard)
  public listConversations() {
    return this.chatConversationService.listConversations(this.request.user.id);
  }

  @Get('conversations/:id')
  @HasPermission(permissions.accessAssistant)
  @UseGuards(AuthGuard('jwt'), HasPermissionGuard)
  public getConversation(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.chatConversationService.getConversation(
      id,
      this.request.user.id
    );
  }

  @Delete('conversations/:id')
  @HttpCode(204)
  @HasPermission(permissions.accessAssistant)
  @UseGuards(AuthGuard('jwt'), HasPermissionGuard)
  public deleteConversation(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.chatConversationService.deleteConversation(
      id,
      this.request.user.id
    );
  }

  @Get('prompt/:mode')
  @HasPermission(permissions.readAiPrompt)
  @UseGuards(AuthGuard('jwt'), HasPermissionGuard)
  public async getPrompt(
    @Param('mode') mode: AiPromptMode,
    @Query('accounts') filterByAccounts?: string,
    @Query('assetClasses') filterByAssetClasses?: string,
    @Query('dataSource') filterByDataSource?: string,
    @Query('symbol') filterBySymbol?: string,
    @Query('tags') filterByTags?: string
  ): Promise<AiPromptResponse> {
    const filters = this.apiService.buildFiltersFromQueryParams({
      filterByAccounts,
      filterByAssetClasses,
      filterByDataSource,
      filterBySymbol,
      filterByTags
    });

    const prompt = await this.aiService.getPrompt({
      filters,
      mode,
      impersonationId: undefined,
      languageCode: this.request.user.settings.settings.language,
      userCurrency: this.request.user.settings.settings.baseCurrency,
      userId: this.request.user.id
    });

    return { prompt };
  }
}
