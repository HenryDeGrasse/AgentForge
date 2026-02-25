import {
  TRANSACTION_HISTORY_INPUT_SCHEMA,
  TRANSACTION_HISTORY_OUTPUT_SCHEMA
} from '@ghostfolio/api/app/endpoints/ai/tools/schemas';
import {
  ToolDefinition,
  ToolExecutionContext,
  ToolJsonSchema
} from '@ghostfolio/api/app/endpoints/ai/tools/tool.types';
import { OrderService } from '@ghostfolio/api/app/order/order.service';
import { UserService } from '@ghostfolio/api/app/user/user.service';
import { DEFAULT_CURRENCY } from '@ghostfolio/common/config';
import { Filter } from '@ghostfolio/common/interfaces';

import { Injectable } from '@nestjs/common';
import { Type as ActivityType } from '@prisma/client';

interface GetTransactionHistoryInput {
  accountIds?: string[];
  cursor?: number;
  endDate?: string;
  pageSize?: number;
  sortDirection?: 'asc' | 'desc';
  startDate?: string;
  types?: ActivityType[];
}

interface TransactionHistoryItem {
  accountId: string;
  accountName: string;
  currency: string;
  dataSource: string;
  date: string;
  fee: number;
  feeInBaseCurrency: number;
  id: string;
  quantity: number;
  symbol: string;
  type: string;
  unitPrice: number;
  value: number;
  valueInBaseCurrency: number;
}

interface GetTransactionHistoryOutput {
  page: {
    cursor: number;
    hasMore: boolean;
    nextCursor: number | null;
    pageSize: number;
    returnedCount: number;
    totalCount: number;
  };
  summary: {
    buyValueInBaseCurrency: number;
    byType: Record<string, number>;
    pageFeesInBaseCurrency: number;
    pageValueInBaseCurrency: number;
    sellValueInBaseCurrency: number;
  };
  transactions: TransactionHistoryItem[];
  warnings: {
    code: string;
    message: string;
  }[];
}

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const MIN_PAGE_SIZE = 1;
const SUPPORTED_TRANSACTION_TYPES = [
  ActivityType.BUY,
  ActivityType.DIVIDEND,
  ActivityType.FEE,
  ActivityType.INTEREST,
  ActivityType.LIABILITY,
  ActivityType.SELL
] as const;

@Injectable()
export class GetTransactionHistoryTool implements ToolDefinition<
  GetTransactionHistoryInput,
  GetTransactionHistoryOutput
> {
  public readonly description =
    'Return filtered, paginated transaction history with deterministic summary statistics.';

  public readonly inputSchema: ToolJsonSchema =
    TRANSACTION_HISTORY_INPUT_SCHEMA;

  public readonly name = 'get_transaction_history';

  public readonly outputSchema: ToolJsonSchema =
    TRANSACTION_HISTORY_OUTPUT_SCHEMA;

  public constructor(
    private readonly orderService: OrderService,
    private readonly userService: UserService
  ) {}

  public async execute(
    input: GetTransactionHistoryInput,
    context: ToolExecutionContext
  ): Promise<GetTransactionHistoryOutput> {
    const cursor = this.getCursor(input?.cursor);
    const pageSize = this.getPageSize(input?.pageSize);
    const filters = this.getFilters(input?.accountIds);
    const startDate = this.parseOptionalDate(input?.startDate, 'startDate');
    const endDate = this.parseOptionalDate(input?.endDate, 'endDate');
    const types = this.getTypes(input?.types);
    const sortDirection = input?.sortDirection === 'asc' ? 'asc' : 'desc';

    const user = await this.userService.user({ id: context.userId });
    const userCurrency =
      user?.settings?.settings?.baseCurrency?.toString() ?? DEFAULT_CURRENCY;

    const { activities, count } = await this.orderService.getOrders({
      endDate,
      filters,
      skip: cursor,
      sortColumn: 'date',
      sortDirection,
      startDate,
      take: pageSize,
      types,
      userCurrency,
      userId: context.userId,
      withExcludedAccountsAndActivities: false
    });

    const transactions: TransactionHistoryItem[] = activities.map(
      (activity) => {
        return {
          accountId: activity.accountId ?? '',
          accountName: activity.account?.name ?? '',
          currency: activity.currency ?? activity.SymbolProfile.currency,
          dataSource: activity.SymbolProfile.dataSource,
          date: new Date(activity.date).toISOString(),
          fee: activity.fee,
          feeInBaseCurrency: activity.feeInBaseCurrency,
          id: activity.id,
          quantity: activity.quantity,
          symbol: activity.SymbolProfile.symbol,
          type: activity.type,
          unitPrice: activity.unitPrice,
          value: activity.value,
          valueInBaseCurrency: activity.valueInBaseCurrency
        };
      }
    );

    const summary = transactions.reduce(
      (response, transaction) => {
        response.pageFeesInBaseCurrency += transaction.feeInBaseCurrency;
        response.pageValueInBaseCurrency += transaction.valueInBaseCurrency;
        response.byType[transaction.type] =
          (response.byType[transaction.type] ?? 0) + 1;

        if (transaction.type === ActivityType.BUY) {
          response.buyValueInBaseCurrency += transaction.valueInBaseCurrency;
        }

        if (transaction.type === ActivityType.SELL) {
          response.sellValueInBaseCurrency += transaction.valueInBaseCurrency;
        }

        return response;
      },
      {
        buyValueInBaseCurrency: 0,
        byType: {},
        pageFeesInBaseCurrency: 0,
        pageValueInBaseCurrency: 0,
        sellValueInBaseCurrency: 0
      } as GetTransactionHistoryOutput['summary']
    );

    const returnedCount = transactions.length;
    const hasMore = cursor + returnedCount < count;

    const warnings: GetTransactionHistoryOutput['warnings'] = [];

    if (count === 0) {
      warnings.push({
        code: 'no_transactions_found',
        message: 'No transactions matched the requested filters.'
      });
    }

    return {
      page: {
        cursor,
        hasMore,
        nextCursor: hasMore ? cursor + returnedCount : null,
        pageSize,
        returnedCount,
        totalCount: count
      },
      summary,
      transactions,
      warnings
    };
  }

  private getCursor(cursor?: number) {
    if (Number.isFinite(cursor) && cursor >= 0) {
      return Math.floor(cursor);
    }

    return 0;
  }

  private getFilters(accountIds?: string[]) {
    if (!accountIds?.length) {
      return undefined;
    }

    return accountIds.reduce((response, accountId) => {
      if (!accountId) {
        return response;
      }

      response.push({
        id: accountId,
        type: 'ACCOUNT'
      });

      return response;
    }, [] as Filter[]);
  }

  private getPageSize(pageSize?: number) {
    if (!Number.isFinite(pageSize)) {
      return DEFAULT_PAGE_SIZE;
    }

    return Math.max(
      MIN_PAGE_SIZE,
      Math.min(MAX_PAGE_SIZE, Math.floor(pageSize))
    );
  }

  private getTypes(types?: ActivityType[]) {
    if (!types?.length) {
      return undefined;
    }

    return types.filter((type) => {
      return SUPPORTED_TRANSACTION_TYPES.includes(type);
    });
  }

  private parseOptionalDate(value: string | undefined, key: string) {
    if (!value) {
      return undefined;
    }

    const parsedValue = new Date(value);

    if (Number.isNaN(parsedValue.getTime())) {
      throw new Error(`Invalid ${key} format. Expected ISO-8601 date string.`);
    }

    return parsedValue;
  }
}
