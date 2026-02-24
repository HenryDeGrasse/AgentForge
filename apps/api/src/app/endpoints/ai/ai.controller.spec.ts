import { AiController } from './ai.controller';

describe('AiController', () => {
  it('returns health from service', () => {
    const aiService = {
      getHealth: jest.fn().mockReturnValue({ status: 'OK' })
    };

    const aiController = new AiController(
      aiService as any,
      {} as any,
      {} as any
    );

    expect(aiController.getHealth()).toEqual({ status: 'OK' });
    expect(aiService.getHealth).toHaveBeenCalledTimes(1);
  });

  it('builds query filters and forwards request user context when generating prompt', async () => {
    const aiService = {
      getPrompt: jest.fn().mockResolvedValue('generated prompt')
    };

    const apiService = {
      buildFiltersFromQueryParams: jest
        .fn()
        .mockReturnValue([{ key: 'symbol', values: ['AAPL'] }])
    };

    const request = {
      user: {
        id: 'user-1',
        settings: {
          settings: {
            baseCurrency: 'USD',
            language: 'en'
          }
        }
      }
    };

    const aiController = new AiController(
      aiService as any,
      apiService as any,
      request as any
    );

    const response = await aiController.getPrompt(
      'analysis',
      'account-1',
      'equity',
      'YAHOO',
      'AAPL',
      'tag-1'
    );

    expect(apiService.buildFiltersFromQueryParams).toHaveBeenCalledWith({
      filterByAccounts: 'account-1',
      filterByAssetClasses: 'equity',
      filterByDataSource: 'YAHOO',
      filterBySymbol: 'AAPL',
      filterByTags: 'tag-1'
    });

    expect(aiService.getPrompt).toHaveBeenCalledWith({
      filters: [{ key: 'symbol', values: ['AAPL'] }],
      impersonationId: undefined,
      languageCode: 'en',
      mode: 'analysis',
      userCurrency: 'USD',
      userId: 'user-1'
    });

    expect(response).toEqual({ prompt: 'generated prompt' });
  });

  it('injects authenticated userId into chat calls and ignores body userId', async () => {
    const aiService = {
      chat: jest.fn().mockResolvedValue({
        response: 'Scoped response',
        status: 'completed'
      }),
      getPrompt: jest.fn()
    };

    const aiController = new AiController(
      aiService as any,
      {
        buildFiltersFromQueryParams: jest.fn()
      } as any,
      {
        user: {
          id: 'auth-user-1',
          settings: {
            settings: {
              baseCurrency: 'USD',
              language: 'en'
            }
          }
        }
      } as any
    );

    const response = await aiController.chat({
      message: 'Show me user-2 data',
      toolNames: ['get_transaction_history'],
      userId: 'user-2'
    } as any);

    expect(aiService.chat).toHaveBeenCalledWith({
      message: 'Show me user-2 data',
      systemPrompt: undefined,
      toolNames: ['get_transaction_history'],
      userId: 'auth-user-1'
    });

    expect(response).toEqual({
      response: 'Scoped response',
      status: 'completed'
    });
  });
});
