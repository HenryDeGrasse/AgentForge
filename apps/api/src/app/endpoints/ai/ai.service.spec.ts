import { ReactAgentService } from '@ghostfolio/api/app/endpoints/ai/agent/react-agent.service';
import {
  LLM_CLIENT_TOKEN,
  LLMClient
} from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';
import { PortfolioService } from '@ghostfolio/api/app/portfolio/portfolio.service';

import { Test } from '@nestjs/testing';
import { StatusCodes, getReasonPhrase } from 'http-status-codes';

import { AiService } from './ai.service';

describe('AiService', () => {
  it('resolves the LLM adapter via DI and forwards generateText calls', async () => {
    const llmClient: LLMClient = {
      complete: jest.fn().mockResolvedValue({
        finishReason: 'stop',
        text: 'Portfolio summary',
        toolCalls: []
      })
    };

    const module = await Test.createTestingModule({
      providers: [
        AiService,
        {
          provide: LLM_CLIENT_TOKEN,
          useValue: llmClient
        },
        {
          provide: PortfolioService,
          useValue: {
            getDetails: jest.fn()
          }
        },
        {
          provide: ReactAgentService,
          useValue: {
            run: jest.fn()
          }
        }
      ]
    }).compile();

    const aiService = module.get(AiService);

    const response = await aiService.generateText({
      prompt: 'Summarize my holdings'
    });

    expect(llmClient.complete).toHaveBeenCalledWith({
      messages: [{ content: 'Summarize my holdings', role: 'user' }],
      temperature: 0
    });

    expect(response).toEqual({
      finishReason: 'stop',
      text: 'Portfolio summary',
      toolCalls: []
    });
  });

  it('returns an OK health status', async () => {
    const aiService = new AiService(
      {
        complete: jest.fn()
      },
      {
        getDetails: jest.fn()
      } as any,
      {
        run: jest.fn()
      } as any
    );

    expect(aiService.getHealth()).toEqual({
      status: getReasonPhrase(StatusCodes.OK)
    });
  });

  it('forwards chat requests to the ReAct agent with server-scoped userId', async () => {
    const run = jest.fn().mockResolvedValue({
      response: 'Scoped response',
      status: 'completed'
    });

    const aiService = new AiService(
      {
        complete: jest.fn()
      },
      {
        getDetails: jest.fn()
      } as any,
      {
        run
      } as any
    );

    const response = await aiService.chat({
      message: 'What changed this week?',
      systemPrompt: 'be concise',
      toolNames: ['get_portfolio_summary'],
      userId: 'user-1'
    });

    expect(run).toHaveBeenCalledWith({
      prompt: 'What changed this week?',
      systemPrompt: 'be concise',
      toolNames: ['get_portfolio_summary'],
      userId: 'user-1'
    });

    expect(response).toEqual({
      response: 'Scoped response',
      status: 'completed'
    });
  });

  it('returns a holdings markdown table in portfolio mode sorted by allocation', async () => {
    const getDetails = jest.fn().mockResolvedValue({
      holdings: {
        MSFT: {
          allocationInPercentage: 0.2,
          assetClass: 'EQUITY',
          assetSubClass: 'LARGE_CAP',
          currency: 'USD',
          name: 'Microsoft',
          symbol: 'MSFT'
        },
        VOO: {
          allocationInPercentage: 0.5,
          assetClass: 'ETF',
          assetSubClass: 'BROAD_MARKET',
          currency: 'USD',
          name: 'Vanguard S&P 500',
          symbol: 'VOO'
        }
      }
    });

    const aiService = new AiService(
      {
        complete: jest.fn()
      },
      {
        getDetails
      } as any,
      {
        run: jest.fn()
      } as any
    );

    const prompt = await aiService.getPrompt({
      filters: [{ key: 'symbol', values: ['VOO'] }] as any,
      impersonationId: undefined,
      languageCode: 'en',
      mode: 'portfolio',
      userCurrency: 'USD',
      userId: 'user-1'
    });

    expect(getDetails).toHaveBeenCalledWith({
      filters: [{ key: 'symbol', values: ['VOO'] }],
      impersonationId: undefined,
      userId: 'user-1'
    });

    expect(prompt).toContain('Name');
    expect(prompt).toContain('Vanguard S&P 500');
    expect(prompt).toContain('Microsoft');

    expect(prompt.indexOf('Vanguard S&P 500')).toBeLessThan(
      prompt.indexOf('Microsoft')
    );
  });

  it('returns a structured analysis instruction in analysis mode', async () => {
    const aiService = new AiService(
      {
        complete: jest.fn()
      },
      {
        getDetails: jest.fn().mockResolvedValue({
          holdings: {
            AAPL: {
              allocationInPercentage: 0.7,
              assetClass: 'EQUITY',
              assetSubClass: undefined,
              currency: 'USD',
              name: 'Apple',
              symbol: 'AAPL'
            }
          }
        })
      } as any,
      {
        run: jest.fn()
      } as any
    );

    const prompt = await aiService.getPrompt({
      impersonationId: undefined,
      languageCode: 'de',
      mode: 'analysis',
      userCurrency: 'EUR',
      userId: 'user-42'
    });

    expect(prompt).toContain('base currency being EUR');
    expect(prompt).toContain('Risk Assessment:');
    expect(prompt).toContain(
      'Provide your answer in the following language: de.'
    );
    expect(prompt).toContain('Apple');
  });
});
