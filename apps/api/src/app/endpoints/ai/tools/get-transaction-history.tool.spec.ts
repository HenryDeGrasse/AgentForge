import { GetTransactionHistoryTool } from './get-transaction-history.tool';

describe('GetTransactionHistoryTool', () => {
  it('returns filtered, paginated transactions with summary stats', async () => {
    const orderService = {
      getOrders: jest.fn().mockResolvedValue({
        activities: [
          {
            account: {
              name: 'Brokerage'
            },
            accountId: 'acc-1',
            currency: 'USD',
            date: new Date('2025-01-15T00:00:00.000Z'),
            fee: 1,
            feeInBaseCurrency: 1,
            id: 'tx-1',
            quantity: 2,
            SymbolProfile: {
              dataSource: 'YAHOO',
              symbol: 'AAPL'
            },
            type: 'BUY',
            unitPrice: 200,
            value: 400,
            valueInBaseCurrency: 1000
          },
          {
            account: {
              name: 'Brokerage'
            },
            accountId: 'acc-1',
            currency: 'USD',
            date: new Date('2025-01-20T00:00:00.000Z'),
            fee: 0.5,
            feeInBaseCurrency: 0.5,
            id: 'tx-2',
            quantity: 1,
            SymbolProfile: {
              dataSource: 'YAHOO',
              symbol: 'MSFT'
            },
            type: 'SELL',
            unitPrice: 300,
            value: 300,
            valueInBaseCurrency: 500
          }
        ],
        count: 3
      })
    };

    const userService = {
      user: jest.fn().mockResolvedValue({
        settings: {
          settings: {
            baseCurrency: 'USD'
          }
        }
      })
    };

    const getTransactionHistoryTool = new GetTransactionHistoryTool(
      orderService as any,
      userService as any
    );

    const result = await getTransactionHistoryTool.execute(
      {
        accountIds: ['acc-1'],
        cursor: 0,
        endDate: '2025-01-31T00:00:00.000Z',
        pageSize: 2,
        startDate: '2025-01-01T00:00:00.000Z',
        types: ['BUY', 'SELL']
      },
      {
        userId: 'user-1'
      }
    );

    expect(orderService.getOrders).toHaveBeenCalledWith({
      endDate: new Date('2025-01-31T00:00:00.000Z'),
      filters: [
        {
          id: 'acc-1',
          type: 'ACCOUNT'
        }
      ],
      skip: 0,
      sortColumn: 'date',
      sortDirection: 'desc',
      startDate: new Date('2025-01-01T00:00:00.000Z'),
      take: 2,
      types: ['BUY', 'SELL'],
      userCurrency: 'USD',
      userId: 'user-1',
      withExcludedAccountsAndActivities: false
    });

    expect(result.page).toEqual({
      cursor: 0,
      hasMore: true,
      nextCursor: 2,
      pageSize: 2,
      returnedCount: 2,
      totalCount: 3
    });

    expect(result.summary).toEqual({
      buyValueInBaseCurrency: 1000,
      byType: {
        BUY: 1,
        SELL: 1
      },
      pageFeesInBaseCurrency: 1.5,
      pageValueInBaseCurrency: 1500,
      sellValueInBaseCurrency: 500
    });

    expect(result.transactions).toEqual([
      {
        accountId: 'acc-1',
        accountName: 'Brokerage',
        currency: 'USD',
        dataSource: 'YAHOO',
        date: '2025-01-15T00:00:00.000Z',
        fee: 1,
        feeInBaseCurrency: 1,
        id: 'tx-1',
        quantity: 2,
        symbol: 'AAPL',
        type: 'BUY',
        unitPrice: 200,
        value: 400,
        valueInBaseCurrency: 1000
      },
      {
        accountId: 'acc-1',
        accountName: 'Brokerage',
        currency: 'USD',
        dataSource: 'YAHOO',
        date: '2025-01-20T00:00:00.000Z',
        fee: 0.5,
        feeInBaseCurrency: 0.5,
        id: 'tx-2',
        quantity: 1,
        symbol: 'MSFT',
        type: 'SELL',
        unitPrice: 300,
        value: 300,
        valueInBaseCurrency: 500
      }
    ]);

    expect(result.warnings).toEqual([]);
  });

  it('enforces max page size safeguards', async () => {
    const orderService = {
      getOrders: jest.fn().mockResolvedValue({
        activities: [],
        count: 0
      })
    };

    const getTransactionHistoryTool = new GetTransactionHistoryTool(
      orderService as any,
      {
        user: jest.fn().mockResolvedValue({
          settings: {
            settings: {
              baseCurrency: 'USD'
            }
          }
        })
      } as any
    );

    const result = await getTransactionHistoryTool.execute(
      {
        cursor: 0,
        pageSize: 999
      },
      {
        userId: 'user-1'
      }
    );

    expect(orderService.getOrders).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 100
      })
    );

    expect(result.page.pageSize).toBe(100);
  });

  // ─── Regression: activity.date returned as string from Prisma ───────────
  // orderService.getOrders() can return activity.date as an ISO string in
  // cached/serialised code paths. Calling .toISOString() on a string throws
  // "toISOString is not a function", silently converting to a tool error
  // envelope that causes the LLM to report a "technical issue".

  it('does not throw when activity.date is an ISO string (regression)', async () => {
    const tool = new GetTransactionHistoryTool(
      {
        getOrders: jest.fn().mockResolvedValue({
          activities: [
            {
              account: { name: 'Brokerage' },
              accountId: 'acc-1',
              currency: 'USD',
              date: '2025-03-10T00:00:00.000Z', // ← string, not Date
              fee: 0,
              feeInBaseCurrency: 0,
              id: 'tx-string',
              quantity: 1,
              SymbolProfile: { dataSource: 'YAHOO', symbol: 'AAPL' },
              type: 'BUY',
              unitPrice: 200,
              value: 200,
              valueInBaseCurrency: 200
            }
          ],
          count: 1
        })
      } as any,
      {
        user: jest.fn().mockResolvedValue({
          settings: { settings: { baseCurrency: 'USD' } }
        })
      } as any
    );

    const result = await tool.execute({}, { userId: 'u1' });

    expect(result.transactions[0].date).toBe('2025-03-10T00:00:00.000Z');
    expect(result.page.returnedCount).toBe(1);
  });

  it('does not throw when activity.date is a Date object (original contract)', async () => {
    const tool = new GetTransactionHistoryTool(
      {
        getOrders: jest.fn().mockResolvedValue({
          activities: [
            {
              account: { name: 'ISA' },
              accountId: 'acc-2',
              currency: 'USD',
              date: new Date('2025-04-01T00:00:00.000Z'), // ← Date object
              fee: 0,
              feeInBaseCurrency: 0,
              id: 'tx-date',
              quantity: 3,
              SymbolProfile: { dataSource: 'YAHOO', symbol: 'VOO' },
              type: 'BUY',
              unitPrice: 500,
              value: 1500,
              valueInBaseCurrency: 1500
            }
          ],
          count: 1
        })
      } as any,
      {
        user: jest.fn().mockResolvedValue({
          settings: { settings: { baseCurrency: 'USD' } }
        })
      } as any
    );

    const result = await tool.execute({}, { userId: 'u1' });

    expect(result.transactions[0].date).toBe('2025-04-01T00:00:00.000Z');
  });

  it('returns warnings when no transactions are found', async () => {
    const getTransactionHistoryTool = new GetTransactionHistoryTool(
      {
        getOrders: jest.fn().mockResolvedValue({
          activities: [],
          count: 0
        })
      } as any,
      {
        user: jest.fn().mockResolvedValue({
          settings: {
            settings: {
              baseCurrency: 'USD'
            }
          }
        })
      } as any
    );

    const result = await getTransactionHistoryTool.execute(
      {},
      {
        userId: 'user-1'
      }
    );

    expect(result.transactions).toEqual([]);
    expect(result.page).toEqual({
      cursor: 0,
      hasMore: false,
      nextCursor: null,
      pageSize: 25,
      returnedCount: 0,
      totalCount: 0
    });

    expect(result.warnings).toEqual([
      {
        code: 'no_transactions_found',
        message: 'No transactions matched the requested filters.'
      }
    ]);
  });
});
