# Epic 5: Hypothetical Tax Impact & Rebalance Strategy Prompt

**Priority**: P0 — Directly addresses observed production bugs
**Branch**: `feat/eval-improvements`
**Estimated effort**: 3-4 hours

---

## Problem Statement

### 5A: Tax Estimate Returns $0 for Proposed Trades

When the user asks "what's the tax hit if I follow the NVDA rebalance?", the
`tax_estimate` tool returns $0 in realized gains because **no SELL has actually
happened yet**. The tool only computes gains from historical transactions.

The user is asking about a **hypothetical future sale**, which requires:

1. Looking up the FIFO cost basis from BUY history
2. Computing proceeds at current market value
3. Reporting the estimated gain/loss and whether it's short-term or long-term

The tool already builds a FIFO lot book internally and computes
`taxLossHarvestingCandidates` with unrealized positions — the data is there,
it just isn't exposed for hypothetical sale scenarios.

### 5B: Rebalance Defaults to Equal-Weight Without Asking

The `rebalance_suggest` tool supports three strategies (`equal_weight`,
`market_cap_weight`, `custom`) but the LLM always calls it with defaults,
producing `equal_weight` output that may contradict what the user actually
wants. Combined with the 20% turnover cap, this can silently exclude the
most important trade (e.g., reducing VOO from 45% to a reasonable level).

The fix is a system prompt change — tell the LLM to ask the user which
strategy they prefer before calling the tool.

---

## 5A Design: Hypothetical Tax Impact

### New Input Field

Add to `TaxEstimateInput` and `TAX_ESTIMATE_INPUT_SCHEMA`:

```typescript
hypotheticalTrades?: {
  symbol: string;
  action: 'sell';               // only sells generate tax events
  quantity?: number;            // exact share count
  notionalValueInBaseCurrency?: number;  // dollar amount to sell
  fractionOfPosition?: number;  // e.g. 0.5 = sell half
}[]
```

Only one of `quantity`, `notionalValueInBaseCurrency`, or `fractionOfPosition`
is required per trade. Priority: quantity > notionalValue > fraction.

### New Output Section

Add to `TaxEstimateOutput` and `TAX_ESTIMATE_OUTPUT_SCHEMA`:

```typescript
hypotheticalImpact?: {
  trades: {
    symbol: string;
    quantitySold: number;
    estimatedProceedsInBaseCurrency: number;
    estimatedCostBasisInBaseCurrency: number;
    estimatedGainInBaseCurrency: number;
    isLongTerm: boolean;
    holdingPeriodDays: number;
    warning?: string;           // e.g. "Insufficient lots for full quantity"
  }[];
  totalEstimatedGainInBaseCurrency: number;
  totalShortTermGainInBaseCurrency: number;
  totalLongTermGainInBaseCurrency: number;
}
```

### Implementation Logic

After the existing FIFO lot-matching pass over real transactions:

1. For each hypothetical trade, look up remaining lots in the `lotBook`
2. Resolve quantity:
   - If `quantity` provided, use directly
   - If `notionalValueInBaseCurrency`, divide by current market price
   - If `fractionOfPosition`, multiply remaining lot quantity by fraction
3. Run FIFO matching against remaining lots (same as real sells)
4. Compute gain = estimated proceeds - cost basis
5. Classify as short-term or long-term based on holding period
6. If insufficient lots, add a warning and compute partial

### Key Detail: Market Price Source

Hypothetical proceeds need current market price. The tool already fetches
`portfolioDetails` which contains `holdings[symbol].marketPrice`. Use that.
If unavailable, add a warning.

### Files to Touch

| File                                   | Change                                                       |
| -------------------------------------- | ------------------------------------------------------------ |
| `tools/tax-estimate.tool.ts`           | Add hypothetical trade processing after real FIFO pass       |
| `tools/schemas/tax-estimate.schema.ts` | Add `hypotheticalTrades` input + `hypotheticalImpact` output |
| `tools/tax-estimate.tool.spec.ts`      | Tests for hypothetical gains (5-7 new tests)                 |
| `tools/utils/tool-summarizers.ts`      | Update summarizer for `hypotheticalImpact` field             |

### Test Cases

1. **Basic hypothetical sell**: BUY 10 shares at $100, hypothetical SELL 5 → gain based on current price
2. **Long-term vs short-term classification**: BUY >12mo ago vs <12mo ago
3. **Fraction-based sell**: `fractionOfPosition: 0.5` sells half
4. **Notional-based sell**: `notionalValueInBaseCurrency: 5000` converts to shares
5. **Insufficient lots**: SELL more than available → partial + warning
6. **Multiple hypothetical trades**: SELL NVDA + SELL VOO in same request
7. **Hypothetical after real sells**: Real sells consume lots first, hypothetical uses remaining

### Acceptance Criteria

- [ ] `hypotheticalTrades` input accepted and validated
- [ ] Hypothetical gains computed using FIFO lot matching
- [ ] Short-term / long-term classification correct
- [ ] Warning when insufficient lots or missing market price
- [ ] Real realized gains unaffected by hypothetical trades
- [ ] Summarizer includes hypothetical impact in output
- [ ] All existing tax tests pass (no regressions)

---

## 5B Design: Rebalance Strategy Prompt

### System Prompt Addition

Add to `AGENT_DEFAULT_SYSTEM_PROMPT` in `agent.constants.ts`:

```
## Rebalancing
When the user asks to rebalance without specifying a strategy, ask which
approach they prefer before calling rebalance_suggest:
- **Equal weight**: Target the same percentage in every holding
- **Market-cap weight**: Maintain proportional sizes based on current values
- **Custom targets**: Specify exact target percentages per holding

Once the user chooses, call rebalance_suggest with the appropriate strategy
parameter. If using custom, ask for their target percentages.

If the rebalance result shows tradesLimitedByConstraints=true, explain to
the user that some trades were excluded due to the default 20% turnover cap
and offer to re-run with a higher limit.
```

### Files to Touch

| File                       | Change                                   |
| -------------------------- | ---------------------------------------- |
| `agent/agent.constants.ts` | Add rebalancing section to system prompt |

### Test Cases

No code tests needed — this is a prompt behavior change. Verify manually
and via golden set cases that:

1. "Should I rebalance?" → agent asks which strategy
2. "Rebalance with equal weight" → agent calls tool with `strategy: 'equal_weight'`
3. Agent explains when trades are limited by constraints

### Acceptance Criteria

- [ ] System prompt includes rebalancing strategy guidance
- [ ] Existing tests pass (no regressions from prompt change)

---

## Implementation Order

```
1. Write failing tests for hypothetical tax impact (TDD)
2. Add hypotheticalTrades to input schema
3. Add hypotheticalImpact to output schema
4. Implement hypothetical FIFO matching in tax-estimate.tool.ts
5. Update tool summarizer
6. Run tests, verify all pass
7. Commit: "feat(ai): add hypothetical trade tax impact to tax_estimate"

8. Update system prompt with rebalancing guidance
9. Run full test suite
10. Commit: "feat(ai): add rebalance strategy prompt to system prompt"
```

## Dependencies

- None — both changes are independent of prior epics
- Cross-session preference memory deferred to WS-2 (requires Prisma migration)

## Deferred Items

- **Turnover exclusion warning in tool** — the system prompt guidance to explain
  `tradesLimitedByConstraints` covers this without tool code changes
- **Cross-session preference persistence** — WS-2 user memory workstream
- **Rebalance-aware tax chaining** — agent could auto-pipe rebalance output
  into tax_estimate hypotheticalTrades, but this is an agent intelligence
  improvement, not a tool fix
