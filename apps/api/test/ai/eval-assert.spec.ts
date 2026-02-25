import { assertToolEnvelopes } from './eval-assert';

describe('eval-assert helpers', () => {
  describe('assertToolEnvelopes', () => {
    it('fails when warningsInclude is requested but warnings are missing', () => {
      const llmClient: { complete: jest.Mock } = { complete: jest.fn() };

      llmClient.complete({
        messages: [
          {
            content: JSON.stringify({
              data: {
                topHoldings: [],
                totals: {}
              },
              status: 'success'
            }),
            name: 'get_portfolio_summary',
            role: 'tool'
          }
        ]
      });

      expect(() => {
        assertToolEnvelopes(
          [
            {
              expectStatus: 'success',
              toolName: 'get_portfolio_summary',
              warningsInclude: ['no_holdings_data']
            }
          ],
          llmClient
        );
      }).toThrow();
    });

    it('passes when warningsInclude codes are present', () => {
      const llmClient: { complete: jest.Mock } = { complete: jest.fn() };

      llmClient.complete({
        messages: [
          {
            content: JSON.stringify({
              data: {
                warnings: [{ code: 'no_holdings_data', message: 'No holdings' }]
              },
              status: 'success'
            }),
            name: 'get_portfolio_summary',
            role: 'tool'
          }
        ]
      });

      expect(() => {
        assertToolEnvelopes(
          [
            {
              expectStatus: 'success',
              toolName: 'get_portfolio_summary',
              warningsInclude: ['no_holdings_data']
            }
          ],
          llmClient
        );
      }).not.toThrow();
    });
  });
});
