import {
  LLM_CLIENT_TOKEN,
  LLMClient
} from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';
import { PortfolioService } from '@ghostfolio/api/app/portfolio/portfolio.service';
import { Filter } from '@ghostfolio/common/interfaces';
import type { AiPromptMode } from '@ghostfolio/common/types';

import { Inject, Injectable } from '@nestjs/common';
import { StatusCodes, getReasonPhrase } from 'http-status-codes';
import type { ColumnDescriptor } from 'tablemark';

@Injectable()
export class AiService {
  private static readonly HOLDINGS_TABLE_COLUMN_DEFINITIONS: ({
    key:
      | 'ALLOCATION_PERCENTAGE'
      | 'ASSET_CLASS'
      | 'ASSET_SUB_CLASS'
      | 'CURRENCY'
      | 'NAME'
      | 'SYMBOL';
  } & ColumnDescriptor)[] = [
    { key: 'NAME', name: 'Name' },
    { key: 'SYMBOL', name: 'Symbol' },
    { key: 'CURRENCY', name: 'Currency' },
    { key: 'ASSET_CLASS', name: 'Asset Class' },
    { key: 'ASSET_SUB_CLASS', name: 'Asset Sub Class' },
    {
      align: 'right',
      key: 'ALLOCATION_PERCENTAGE',
      name: 'Allocation in Percentage'
    }
  ];

  public constructor(
    @Inject(LLM_CLIENT_TOKEN)
    private readonly llmClient: LLMClient,
    private readonly portfolioService: PortfolioService
  ) {}

  public getHealth() {
    return {
      status: getReasonPhrase(StatusCodes.OK)
    };
  }

  public async generateText({ prompt }: { prompt: string }) {
    return this.llmClient.complete({
      messages: [{ content: prompt, role: 'user' }],
      temperature: 0
    });
  }

  public async getPrompt({
    filters,
    impersonationId,
    languageCode,
    mode,
    userCurrency,
    userId
  }: {
    filters?: Filter[];
    impersonationId: string;
    languageCode: string;
    mode: AiPromptMode;
    userCurrency: string;
    userId: string;
  }) {
    const { holdings } = await this.portfolioService.getDetails({
      filters,
      impersonationId,
      userId
    });

    const holdingsTableColumns: ColumnDescriptor[] =
      AiService.HOLDINGS_TABLE_COLUMN_DEFINITIONS.map(({ align, name }) => {
        return { name, align: align ?? 'left' };
      });

    const holdingsTableRows = Object.values(holdings)
      .sort((a, b) => {
        return b.allocationInPercentage - a.allocationInPercentage;
      })
      .map(
        ({
          allocationInPercentage,
          assetClass,
          assetSubClass,
          currency,
          name: label,
          symbol
        }) => {
          return AiService.HOLDINGS_TABLE_COLUMN_DEFINITIONS.reduce(
            (row, { key, name }) => {
              switch (key) {
                case 'ALLOCATION_PERCENTAGE':
                  row[name] = `${(allocationInPercentage * 100).toFixed(3)}%`;
                  break;

                case 'ASSET_CLASS':
                  row[name] = assetClass ?? '';
                  break;

                case 'ASSET_SUB_CLASS':
                  row[name] = assetSubClass ?? '';
                  break;

                case 'CURRENCY':
                  row[name] = currency;
                  break;

                case 'NAME':
                  row[name] = label;
                  break;

                case 'SYMBOL':
                  row[name] = symbol;
                  break;

                default:
                  row[name] = '';
                  break;
              }

              return row;
            },
            {} as Record<string, string>
          );
        }
      );

    const holdingsTableString = await this.toMarkdownTable({
      columns: holdingsTableColumns,
      rows: holdingsTableRows
    });

    if (mode === 'portfolio') {
      return holdingsTableString;
    }

    return [
      `You are a neutral financial assistant. Please analyze the following investment portfolio (base currency being ${userCurrency}) in simple words.`,
      holdingsTableString,
      'Structure your answer with these sections:',
      'Overview: Briefly summarize the portfolio’s composition and allocation rationale.',
      'Risk Assessment: Identify potential risks, including market volatility, concentration, and sectoral imbalances.',
      'Advantages: Highlight strengths, focusing on growth potential, diversification, or other benefits.',
      'Disadvantages: Point out weaknesses, such as overexposure or lack of defensive assets.',
      'Target Group: Discuss who this portfolio might suit (e.g., risk tolerance, investment goals, life stages, and experience levels).',
      'Optimization Ideas: Offer ideas to complement the portfolio, ensuring they are constructive and neutral in tone.',
      'Conclusion: Provide a concise summary highlighting key insights.',
      `Provide your answer in the following language: ${languageCode}.`
    ].join('\n');
  }

  private escapeMarkdownCell(value: unknown) {
    if (value === null || value === undefined) {
      return '';
    }

    return String(value).split('|').join('\\|');
  }

  private getMarkdownFallback({
    columns,
    rows
  }: {
    columns: ColumnDescriptor[];
    rows: Record<string, string>[];
  }) {
    const header = `| ${columns
      .map(({ name }) => {
        return this.escapeMarkdownCell(name);
      })
      .join(' | ')} |`;

    const separator = `| ${columns
      .map(() => {
        return '---';
      })
      .join(' | ')} |`;

    const body = rows.map((row) => {
      return `| ${columns
        .map(({ name }) => {
          return this.escapeMarkdownCell(row[name]);
        })
        .join(' | ')} |`;
    });

    return [header, separator, ...body].join('\n');
  }

  private async toMarkdownTable({
    columns,
    rows
  }: {
    columns: ColumnDescriptor[];
    rows: Record<string, string>[];
  }) {
    try {
      // Dynamic import to load ESM module from CommonJS context
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const dynamicImport = new Function('s', 'return import(s)') as (
        s: string
      ) => Promise<typeof import('tablemark')>;
      const { tablemark } = await dynamicImport('tablemark');

      return tablemark(rows, {
        columns
      });
    } catch {
      return this.getMarkdownFallback({ columns, rows });
    }
  }
}
