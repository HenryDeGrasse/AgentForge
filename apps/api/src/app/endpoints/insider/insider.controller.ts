import { HasPermission } from '@ghostfolio/api/decorators/has-permission.decorator';
import { HasPermissionGuard } from '@ghostfolio/api/guards/has-permission.guard';
import { permissions } from '@ghostfolio/common/permissions';
import type { RequestWithUser } from '@ghostfolio/common/types';

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { InsiderService } from './insider.service';

@Controller('insider')
@UseGuards(AuthGuard('jwt'), HasPermissionGuard)
export class InsiderController {
  public constructor(private readonly insiderService: InsiderService) {}

  @Get('activity')
  @HasPermission(permissions.accessAssistant)
  public async getActivity(
    @Query('symbols') symbolsStr?: string,
    @Query('days') daysStr?: string
  ) {
    const symbols = symbolsStr
      ? symbolsStr.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
    const days = daysStr ? parseInt(daysStr, 10) : 30;

    return this.insiderService.getInsiderActivity({ days, symbols });
  }

  @Get('activity/portfolio')
  @HasPermission(permissions.accessAssistant)
  public async getPortfolioActivity(
    @Req() req: RequestWithUser,
    @Query('days') daysStr?: string,
    @Query('topN') topNStr?: string
  ) {
    const days = daysStr ? parseInt(daysStr, 10) : 30;
    const topN = topNStr ? parseInt(topNStr, 10) : 10;

    return this.insiderService.getPortfolioInsiderActivity({
      days,
      topN,
      userId: req.user.id
    });
  }

  @Post('rules')
  @HasPermission(permissions.accessAssistant)
  @HttpCode(HttpStatus.CREATED)
  public async createRule(
    @Req() req: RequestWithUser,
    @Body()
    body: {
      lookbackDays?: number;
      minValueUsd?: number;
      scope: string;
      side: string;
      symbols?: string[];
      topN?: number;
    }
  ) {
    return this.insiderService.createRule({
      ...body,
      userId: req.user.id
    });
  }

  @Get('rules')
  @HasPermission(permissions.accessAssistant)
  public async listRules(@Req() req: RequestWithUser) {
    return this.insiderService.listRules({ userId: req.user.id });
  }

  @Patch('rules/:id')
  @HasPermission(permissions.accessAssistant)
  public async updateRule(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body()
    body: {
      isActive?: boolean;
      lookbackDays?: number;
      minValueUsd?: number;
      scope?: string;
      side?: string;
      symbols?: string[];
      topN?: number;
    }
  ) {
    return this.insiderService.updateRule({
      id,
      updates: body,
      userId: req.user.id
    });
  }

  @Delete('rules/:id')
  @HasPermission(permissions.accessAssistant)
  @HttpCode(HttpStatus.NO_CONTENT)
  public async deleteRule(
    @Req() req: RequestWithUser,
    @Param('id') id: string
  ) {
    return this.insiderService.deleteRule({ id, userId: req.user.id });
  }

  @Post('sync')
  @HasPermission(permissions.accessAssistant)
  @HttpCode(HttpStatus.OK)
  public async sync(
    @Query('symbols') symbolsStr?: string,
    @Query('days') daysStr?: string
  ) {
    const symbols = symbolsStr
      ? symbolsStr.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
    const days = daysStr ? parseInt(daysStr, 10) : 30;

    return this.insiderService.getInsiderActivity({ days, symbols });
  }
}
