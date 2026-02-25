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
  UseGuards
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

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
