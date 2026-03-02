import {
  LIST_INSIDER_RULES_INPUT_SCHEMA,
  LIST_INSIDER_RULES_OUTPUT_SCHEMA
} from '@ghostfolio/api/app/endpoints/ai/tools/schemas';
import {
  ToolDefinition,
  ToolExecutionContext,
  ToolJsonSchema,
  ToolResultEnvelope
} from '@ghostfolio/api/app/endpoints/ai/tools/tool.types';
import { InsiderService } from '@ghostfolio/api/app/endpoints/insider/insider.service';

import { Injectable } from '@nestjs/common';

interface ListInsiderRulesOutput {
  rules: {
    agentNotes?: string;
    id: string;
    isActive: boolean;
    lastCheckedAt?: string;
    lastNotifiedAt?: string;
    lookbackDays: number;
    minValueUsd?: number;
    scope: string;
    side: string;
    symbols?: string[];
    topN?: number;
  }[];
  total: number;
}

@Injectable()
export class ListInsiderRulesTool implements ToolDefinition<
  Record<string, never>,
  ListInsiderRulesOutput
> {
  public readonly description =
    'List all insider monitoring rules for the current user. Shows rule configuration, status, and last check/notify timestamps.';

  public readonly inputSchema: ToolJsonSchema = LIST_INSIDER_RULES_INPUT_SCHEMA;

  public readonly name = 'list_insider_monitoring_rules';

  public readonly outputSchema: ToolJsonSchema =
    LIST_INSIDER_RULES_OUTPUT_SCHEMA;

  public constructor(private readonly insiderService: InsiderService) {}

  public async execute(
    _input: Record<string, never>,
    context: ToolExecutionContext
  ): Promise<ToolResultEnvelope<ListInsiderRulesOutput>> {
    const rules = await this.insiderService.listRules({
      userId: context.userId
    });

    return {
      data: {
        rules: rules.map((r) => ({
          agentNotes: r.agentNotes ?? undefined,
          id: r.id,
          isActive: r.isActive,
          lastCheckedAt: r.lastCheckedAt?.toISOString(),
          lastNotifiedAt: r.lastNotifiedAt?.toISOString(),
          lookbackDays: r.lookbackDays,
          minValueUsd: r.minValueUsd ?? undefined,
          scope: r.scope,
          side: r.side,
          symbols: r.symbols
            ? typeof r.symbols === 'string'
              ? JSON.parse(r.symbols)
              : (r.symbols as string[])
            : undefined,
          topN: r.topN ?? undefined
        })),
        total: rules.length
      },
      status: 'success'
    };
  }
}
