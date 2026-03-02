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
  HttpStatus,
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

import { AiRateLimiterGuard } from './ai-rate-limiter.guard';
import { AiService } from './ai.service';
import { ChatConversationService } from './chat-conversation.service';
import { ChatFeedbackDto } from './chat-feedback.dto';
import { ChatDto } from './chat.dto';
import { LangfuseService } from './observability/langfuse.service';

@Controller('ai')
export class AiController {
  public constructor(
    private readonly aiService: AiService,
    private readonly apiService: ApiService,
    private readonly chatConversationService: ChatConversationService,
    private readonly langfuseService: LangfuseService,
    @Inject(REQUEST) private readonly request: RequestWithUser
  ) {}

  @Get('health')
  public getHealth() {
    return this.aiService.getHealth();
  }

  @Post('chat')
  @HasPermission(permissions.accessAssistant)
  @UseGuards(AuthGuard('jwt'), HasPermissionGuard, AiRateLimiterGuard)
  public chat(@Body() { conversationId, message, toolNames }: ChatDto) {
    return this.aiService.chat({
      conversationId,
      message,
      toolNames,
      userId: this.request.user.id
    });
  }

  @Post('chat/stream')
  @HasPermission(permissions.accessAssistant)
  @UseGuards(AuthGuard('jwt'), HasPermissionGuard, AiRateLimiterGuard)
  public async chatStream(
    @Body() { conversationId, message, toolNames }: ChatDto,
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
        toolNames,
        userId: this.request.user.id
      })) {
        if (abortController.signal.aborted) {
          break;
        }

        const canContinue = res.write(`data: ${JSON.stringify(event)}\n\n`);

        // Backpressure: if the kernel write buffer is full (write() returned
        // false), wait for it to drain before writing more data. Without this,
        // a slow client causes unbounded server-side buffering and potential
        // memory exhaustion under load.
        if (!canContinue) {
          await new Promise<void>((resolve) => res.once('drain', resolve));
        }
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

  /**
   * POST /api/v1/ai/feedback
   *
   * Record user feedback (thumbs up/down) for a chat response.
   * The traceId is returned as part of every VerifiedResponse so the
   * frontend can send this immediately after a response is received.
   *
   * This writes a Langfuse score — visible in the Langfuse dashboard
   * under Traces → Scores. Used to track user satisfaction over time
   * and identify low-quality responses for eval case creation.
   */
  @Post('feedback')
  @HttpCode(HttpStatus.NO_CONTENT)
  @HasPermission(permissions.accessAssistant)
  @UseGuards(AuthGuard('jwt'), HasPermissionGuard)
  public async submitFeedback(
    @Body() { comment, traceId, value }: ChatFeedbackDto
  ): Promise<void> {
    await this.langfuseService.addScore({ comment, traceId, value });
  }
}
