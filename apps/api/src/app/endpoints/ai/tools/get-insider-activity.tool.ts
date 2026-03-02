import {
  INSIDER_ACTIVITY_INPUT_SCHEMA,
  INSIDER_ACTIVITY_OUTPUT_SCHEMA
} from '@ghostfolio/api/app/endpoints/ai/tools/schemas';
import {
  ToolDefinition,
  ToolExecutionContext,
  ToolJsonSchema,
  ToolResultEnvelope
} from '@ghostfolio/api/app/endpoints/ai/tools/tool.types';
import { InsiderService } from '@ghostfolio/api/app/endpoints/insider/insider.service';

import { Injectable } from '@nestjs/common';

interface GetInsiderActivityInput {
  days?: number;
  symbols: string[];
}

interface InsiderActivityTransaction {
  insiderName: string;
  insiderRelation?: string;
  price?: number;
  shares?: number;
  side: string;
  sourceUrl?: string;
  symbol: string;
  txDate: string;
  valueUsd?: number;
}

interface GetInsiderActivityOutput {
  disclaimers: string[];
  providerName: string;
  transactions: InsiderActivityTransaction[];
  warnings: string[];
}

const DISCLAIMERS = [
  'Insider transaction data is informational only — not investment advice.',
  'Data may be delayed. Verify via source URLs for the most current filings.'
];

@Injectable()
export class GetInsiderActivityTool implements ToolDefinition<
  GetInsiderActivityInput,
  GetInsiderActivityOutput
> {
  public readonly description =
    'Fetch recent insider buy/sell activity (Form 4 filings) for given stock symbols. Returns insider names, transaction details, and source links.';

  public readonly inputSchema: ToolJsonSchema = INSIDER_ACTIVITY_INPUT_SCHEMA;

  public readonly name = 'get_insider_activity';

  public readonly outputSchema: ToolJsonSchema = INSIDER_ACTIVITY_OUTPUT_SCHEMA;

  public constructor(private readonly insiderService: InsiderService) {}

  public async execute(
    input: GetInsiderActivityInput,
    context: ToolExecutionContext
  ): Promise<ToolResultEnvelope<GetInsiderActivityOutput>> {
    const days = Math.min(input.days ?? 30, 90);

    // If no symbols provided, use portfolio holdings
    let result;
    if (!input.symbols || input.symbols.length === 0) {
      result = await this.insiderService.getPortfolioInsiderActivity({
        days,
        topN: 10,
        userId: context.userId
      });
    } else {
      result = await this.insiderService.getInsiderActivity({
        days,
        symbols: input.symbols.map((s) => s.toUpperCase())
      });
    }

    const transactions: InsiderActivityTransaction[] = result.transactions.map(
      (tx) => ({
        insiderName: tx.insiderName,
        insiderRelation: tx.insiderRelation,
        price: tx.price,
        shares: tx.shares,
        side: tx.side,
        sourceUrl: tx.sourceUrl,
        symbol: tx.symbol,
        txDate:
          tx.txDate instanceof Date
            ? tx.txDate.toISOString().split('T')[0]
            : String(tx.txDate),
        valueUsd: tx.valueUsd
      })
    );

    return {
      data: {
        disclaimers: DISCLAIMERS,
        providerName: result.providerName,
        transactions,
        warnings: result.warnings
      },
      status:
        result.warnings.length > 0 && transactions.length === 0
          ? 'partial'
          : 'success'
    };
  }
}
