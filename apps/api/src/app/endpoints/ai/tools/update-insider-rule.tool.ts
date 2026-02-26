import { InsiderService } from '@ghostfolio/api/app/endpoints/insider/insider.service';

import {
  UPDATE_INSIDER_RULE_INPUT_SCHEMA,
  UPDATE_INSIDER_RULE_OUTPUT_SCHEMA
} from '@ghostfolio/api/app/endpoints/ai/tools/schemas';
import {
  ToolDefinition,
  ToolExecutionContext,
  ToolJsonSchema,
  ToolResultEnvelope
} from '@ghostfolio/api/app/endpoints/ai/tools/tool.types';

import { Injectable } from '@nestjs/common';

interface UpdateInsiderRuleInput {
  id: string;
  isActive?: boolean;
  lookbackDays?: number;
  minValueUsd?: number;
  scope?: string;
  side?: string;
  symbols?: string[];
  topN?: number;
}

interface UpdateInsiderRuleOutput {
  message: string;
  updatedCount: number;
}

@Injectable()
export class UpdateInsiderRuleTool
  implements ToolDefinition<UpdateInsiderRuleInput, UpdateInsiderRuleOutput>
{
  public readonly description =
    'Update an existing insider monitoring rule. Can change scope, side, minimum value threshold, symbols, or activate/deactivate the rule.';

  public readonly inputSchema: ToolJsonSchema = UPDATE_INSIDER_RULE_INPUT_SCHEMA;

  public readonly name = 'update_insider_monitoring_rule';

  public readonly outputSchema: ToolJsonSchema = UPDATE_INSIDER_RULE_OUTPUT_SCHEMA;

  public constructor(private readonly insiderService: InsiderService) {}

  public async execute(
    input: UpdateInsiderRuleInput,
    context: ToolExecutionContext
  ): Promise<ToolResultEnvelope<UpdateInsiderRuleOutput>> {
    const { id, ...updates } = input;

    const result = await this.insiderService.updateRule({
      id,
      updates: {
        ...updates,
        symbols: updates.symbols?.map((s) => s.toUpperCase())
      },
      userId: context.userId
    });

    const updatedCount = result.count;

    return {
      data: {
        message:
          updatedCount > 0
            ? `Rule ${id} updated successfully.`
            : `Rule ${id} not found or you do not have permission to update it.`,
        updatedCount
      },
      status: updatedCount > 0 ? 'success' : 'error'
    };
  }
}
