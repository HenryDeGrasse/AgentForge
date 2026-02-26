import { InsiderService } from '@ghostfolio/api/app/endpoints/insider/insider.service';

import {
  CREATE_INSIDER_RULE_INPUT_SCHEMA,
  CREATE_INSIDER_RULE_OUTPUT_SCHEMA
} from '@ghostfolio/api/app/endpoints/ai/tools/schemas';
import {
  ToolDefinition,
  ToolExecutionContext,
  ToolJsonSchema,
  ToolResultEnvelope
} from '@ghostfolio/api/app/endpoints/ai/tools/tool.types';

import { Injectable } from '@nestjs/common';

interface CreateInsiderRuleInput {
  lookbackDays?: number;
  minValueUsd?: number;
  scope: string;
  side: string;
  symbols?: string[];
  topN?: number;
}

interface CreateInsiderRuleOutput {
  message: string;
  rule: {
    id: string;
    isActive: boolean;
    lookbackDays: number;
    minValueUsd?: number;
    scope: string;
    side: string;
    symbols?: string[];
    topN?: number;
  };
}

@Injectable()
export class CreateInsiderRuleTool
  implements ToolDefinition<CreateInsiderRuleInput, CreateInsiderRuleOutput>
{
  public readonly description =
    'Create an insider monitoring rule to track insider buys/sells for portfolio holdings or specific symbols. Rules are evaluated at the start of each chat session.';

  public readonly inputSchema: ToolJsonSchema = CREATE_INSIDER_RULE_INPUT_SCHEMA;

  public readonly name = 'create_insider_monitoring_rule';

  public readonly outputSchema: ToolJsonSchema = CREATE_INSIDER_RULE_OUTPUT_SCHEMA;

  public constructor(private readonly insiderService: InsiderService) {}

  public async execute(
    input: CreateInsiderRuleInput,
    context: ToolExecutionContext
  ): Promise<ToolResultEnvelope<CreateInsiderRuleOutput>> {
    const rule = await this.insiderService.createRule({
      lookbackDays: input.lookbackDays,
      minValueUsd: input.minValueUsd,
      scope: input.scope,
      side: input.side,
      symbols: input.symbols?.map((s) => s.toUpperCase()),
      topN: input.topN,
      userId: context.userId
    });

    const parsedSymbols = rule.symbols
      ? typeof rule.symbols === 'string'
        ? JSON.parse(rule.symbols)
        : rule.symbols
      : undefined;

    return {
      data: {
        message: `Monitoring rule created successfully. You will be briefed about matching insider activity at the start of each chat session.`,
        rule: {
          id: rule.id,
          isActive: rule.isActive,
          lookbackDays: rule.lookbackDays,
          minValueUsd: rule.minValueUsd ?? undefined,
          scope: rule.scope,
          side: rule.side,
          symbols: parsedSymbols,
          topN: rule.topN ?? undefined
        }
      },
      status: 'success'
    };
  }
}
