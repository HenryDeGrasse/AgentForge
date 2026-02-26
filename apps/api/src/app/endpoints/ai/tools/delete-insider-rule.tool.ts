import { InsiderService } from '@ghostfolio/api/app/endpoints/insider/insider.service';

import {
  DELETE_INSIDER_RULE_INPUT_SCHEMA,
  DELETE_INSIDER_RULE_OUTPUT_SCHEMA
} from '@ghostfolio/api/app/endpoints/ai/tools/schemas';
import {
  ToolDefinition,
  ToolExecutionContext,
  ToolJsonSchema,
  ToolResultEnvelope
} from '@ghostfolio/api/app/endpoints/ai/tools/tool.types';

import { Injectable } from '@nestjs/common';

interface DeleteInsiderRuleInput {
  id: string;
}

interface DeleteInsiderRuleOutput {
  deletedCount: number;
  message: string;
}

@Injectable()
export class DeleteInsiderRuleTool
  implements ToolDefinition<DeleteInsiderRuleInput, DeleteInsiderRuleOutput>
{
  public readonly description =
    'Delete an insider monitoring rule by ID. Only rules owned by the current user can be deleted.';

  public readonly inputSchema: ToolJsonSchema = DELETE_INSIDER_RULE_INPUT_SCHEMA;

  public readonly name = 'delete_insider_monitoring_rule';

  public readonly outputSchema: ToolJsonSchema = DELETE_INSIDER_RULE_OUTPUT_SCHEMA;

  public constructor(private readonly insiderService: InsiderService) {}

  public async execute(
    input: DeleteInsiderRuleInput,
    context: ToolExecutionContext
  ): Promise<ToolResultEnvelope<DeleteInsiderRuleOutput>> {
    const result = await this.insiderService.deleteRule({
      id: input.id,
      userId: context.userId
    });

    const deletedCount = result.count;

    return {
      data: {
        deletedCount,
        message:
          deletedCount > 0
            ? `Rule ${input.id} deleted successfully.`
            : `Rule ${input.id} not found or you do not have permission to delete it.`
      },
      status: deletedCount > 0 ? 'success' : 'error'
    };
  }
}
