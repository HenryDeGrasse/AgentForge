import { containsUnbackedPortfolioClaim } from './portfolio-claim-detector';

describe('containsUnbackedPortfolioClaim', () => {
  describe('true positives — should detect as a portfolio claim', () => {
    it('detects "your portfolio is worth $50,000"', () => {
      expect(
        containsUnbackedPortfolioClaim('Your portfolio is worth $50,000.')
      ).toBe(true);
    });

    it('detects "your portfolio has 10 holdings"', () => {
      expect(
        containsUnbackedPortfolioClaim('Your portfolio has 10 holdings.')
      ).toBe(true);
    });

    it('detects "your portfolio shows a gain of 12%"', () => {
      expect(
        containsUnbackedPortfolioClaim('Your portfolio shows a gain of 12%.')
      ).toBe(true);
    });

    it('detects "your holdings are concentrated in tech"', () => {
      expect(
        containsUnbackedPortfolioClaim(
          'Your holdings are concentrated in tech.'
        )
      ).toBe(true);
    });

    it('detects "total value is $120,000"', () => {
      expect(
        containsUnbackedPortfolioClaim('The total value is $120,000.')
      ).toBe(true);
    });

    it('detects "net worth is $250,000"', () => {
      expect(
        containsUnbackedPortfolioClaim('Your net worth is $250,000.')
      ).toBe(true);
    });

    it('detects "worth approximately $45,000"', () => {
      expect(
        containsUnbackedPortfolioClaim(
          'Your portfolio is worth approximately $45,000.'
        )
      ).toBe(true);
    });

    it('detects "you hold 5 positions"', () => {
      expect(
        containsUnbackedPortfolioClaim('You hold 5 positions in your account.')
      ).toBe(true);
    });

    it('detects "you own 100 shares"', () => {
      expect(
        containsUnbackedPortfolioClaim('You own 100 shares of AAPL.')
      ).toBe(true);
    });

    it('detects "gain of 8.5%"', () => {
      expect(
        containsUnbackedPortfolioClaim('You have a gain of 8.5% this year.')
      ).toBe(true);
    });

    it('detects "loss of 3.2%"', () => {
      expect(containsUnbackedPortfolioClaim('You have a loss of 3.2%.')).toBe(
        true
      );
    });

    it('detects "return of 15%"', () => {
      expect(
        containsUnbackedPortfolioClaim('Your return of 15% beats the market.')
      ).toBe(true);
    });

    it('detects "compliant with" assertion', () => {
      expect(
        containsUnbackedPortfolioClaim(
          'Your portfolio is compliant with all rules.'
        )
      ).toBe(true);
    });

    it('detects "non-compliant with" assertion', () => {
      expect(
        containsUnbackedPortfolioClaim(
          'Your portfolio is non-compliant with rule 3.'
        )
      ).toBe(true);
    });

    it('detects tax liability assertion', () => {
      expect(
        containsUnbackedPortfolioClaim('Your tax liability is $3,200.')
      ).toBe(true);
    });

    it('detects "your allocation is X" assertion', () => {
      expect(
        containsUnbackedPortfolioClaim('Your allocation is 60% equities.')
      ).toBe(true);
    });

    it('detects "account holds AAPL at 45%" — previously missed', () => {
      expect(
        containsUnbackedPortfolioClaim(
          'Based on my analysis, the account holds AAPL at 45%.'
        )
      ).toBe(true);
    });

    it('detects "total return is 12.5%" — previously missed', () => {
      expect(
        containsUnbackedPortfolioClaim('Your total return is 12.5%.')
      ).toBe(true);
    });

    it('detects "portfolio is worth" in mid-sentence', () => {
      expect(
        containsUnbackedPortfolioClaim(
          'Based on current market conditions, your portfolio is worth $200k.'
        )
      ).toBe(true);
    });
  });

  describe('true negatives — should NOT detect as a portfolio claim', () => {
    it('does not flag a generic portfolio greeting', () => {
      expect(
        containsUnbackedPortfolioClaim(
          'I can help analyze your portfolio. What would you like to know?'
        )
      ).toBe(false);
    });

    it('does not flag capability description mentioning portfolio', () => {
      expect(
        containsUnbackedPortfolioClaim(
          'How can I help with your portfolio today?'
        )
      ).toBe(false);
    });

    it('does not flag a refusal mentioning portfolio', () => {
      expect(
        containsUnbackedPortfolioClaim(
          "I don't have access to your portfolio data without using the tools."
        )
      ).toBe(false);
    });

    it('does not flag general financial advice without specific claims', () => {
      expect(
        containsUnbackedPortfolioClaim(
          'Diversification is key to managing portfolio risk.'
        )
      ).toBe(false);
    });

    it('does not flag a question about portfolio', () => {
      expect(
        containsUnbackedPortfolioClaim(
          'Would you like me to analyze your portfolio risk?'
        )
      ).toBe(false);
    });

    it('does not flag out-of-scope refusals', () => {
      expect(
        containsUnbackedPortfolioClaim(
          "I'm sorry, writing poems is outside my capabilities."
        )
      ).toBe(false);
    });

    it('does not flag empty string', () => {
      expect(containsUnbackedPortfolioClaim('')).toBe(false);
    });

    it('does not flag general market commentary', () => {
      expect(
        containsUnbackedPortfolioClaim(
          'The S&P 500 returned 26% in 2023, a strong year for equities.'
        )
      ).toBe(false);
    });

    it('does not flag portfolio mentioned in a list of capabilities', () => {
      expect(
        containsUnbackedPortfolioClaim(
          'I can help with: portfolio summaries, risk analysis, compliance checks, and more.'
        )
      ).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('is case-insensitive', () => {
      expect(
        containsUnbackedPortfolioClaim('YOUR PORTFOLIO IS WORTH $100,000.')
      ).toBe(true);
    });

    it('handles multi-line text', () => {
      expect(
        containsUnbackedPortfolioClaim(
          'Here is a summary.\nYour portfolio has 5 holdings.\nLet me know if you have questions.'
        )
      ).toBe(true);
    });

    it('returns false for whitespace-only text', () => {
      expect(containsUnbackedPortfolioClaim('   ')).toBe(false);
    });
  });
});
