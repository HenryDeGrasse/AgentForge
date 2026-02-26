import type { ActionItem } from '@ghostfolio/common/interfaces';

import { Injectable } from '@nestjs/common';

interface ActionMapping {
  actionType: 'button' | 'chip';
  key: string;
  label: string;
  prompt: string;
}

/**
 * Pure deterministic service — no LLM involvement.
 * Derives context-aware follow-up actions from invoked tool names.
 * Never throws; returns [] on malformed/unknown input.
 */
@Injectable()
export class ActionExtractorService {
  private static readonly MAX_ACTIONS = 6;

  private static readonly TOOL_ACTIONS: Record<string, ActionMapping[]> = {
    analyze_risk: [
      {
        actionType: 'chip',
        key: 'reduce-risk',
        label: 'How can I reduce risk?',
        prompt: 'How can I reduce my portfolio risk?'
      },
      {
        actionType: 'chip',
        key: 'compliance-status',
        label: 'Show compliance status',
        prompt: 'Show my compliance status'
      }
    ],
    compliance_check: [
      {
        actionType: 'chip',
        key: 'compliance-violations',
        label: 'What violations need attention?',
        prompt: 'What compliance violations need my attention?'
      },
      {
        actionType: 'button',
        key: 'compliance-full-report',
        label: 'Show full compliance report',
        prompt: 'Show a full compliance report for my portfolio'
      }
    ],
    get_portfolio_summary: [
      {
        actionType: 'chip',
        key: 'risk-exposure',
        label: "What's my risk exposure?",
        prompt: "What's my current risk exposure?"
      },
      {
        actionType: 'chip',
        key: 'performance-history',
        label: 'Show performance history',
        prompt: 'Show my portfolio performance history'
      }
    ],
    get_transaction_history: [
      {
        actionType: 'chip',
        key: 'portfolio-summary',
        label: 'Summarize my portfolio',
        prompt: 'Give me a summary of my portfolio'
      },
      {
        actionType: 'chip',
        key: 'analyze-risk-from-history',
        label: 'Analyze my risk',
        prompt: 'Analyze the risk in my portfolio'
      }
    ],
    market_data_lookup: [
      {
        actionType: 'chip',
        key: 'compare-holdings',
        label: 'Compare with my holdings',
        prompt: 'Compare this market data with my current holdings'
      },
      {
        actionType: 'chip',
        key: 'show-trend',
        label: 'Show historical trend',
        prompt: 'Show the historical trend for this market data'
      }
    ],
    performance_compare: [
      {
        actionType: 'chip',
        key: 'analyze-risk-from-perf',
        label: 'Analyze my risk',
        prompt: 'Analyze the risk in my portfolio'
      },
      {
        actionType: 'chip',
        key: 'suggest-rebalancing',
        label: 'Suggest rebalancing',
        prompt: 'Suggest how I should rebalance my portfolio'
      }
    ],
    simulate_trades: [
      {
        actionType: 'chip',
        key: 'analyze-risk-simulated',
        label: 'Analyze risk of new portfolio',
        prompt: 'Analyze the risk of my portfolio after these simulated trades'
      },
      {
        actionType: 'chip',
        key: 'try-different-trades',
        label: 'Try different trades',
        prompt: 'Let me simulate different trades on my portfolio'
      }
    ],
    stress_test: [
      {
        actionType: 'chip',
        key: 'try-another-scenario',
        label: 'Try another scenario',
        prompt: 'Run a different stress test scenario on my portfolio'
      },
      {
        actionType: 'chip',
        key: 'analyze-risk-from-stress',
        label: 'Analyze my risk',
        prompt: 'Analyze the risk in my portfolio'
      }
    ],
    rebalance_suggest: [
      {
        actionType: 'chip',
        key: 'tax-impact',
        label: "What's the tax impact?",
        prompt: "What's the tax impact of these rebalancing trades?"
      },
      {
        actionType: 'chip',
        key: 'compliance-after-rebalance',
        label: 'Check compliance after rebalance',
        prompt:
          'Check my compliance status if I follow these rebalancing suggestions'
      }
    ],
    tax_estimate: [
      {
        actionType: 'chip',
        key: 'transaction-history',
        label: 'Show transaction history',
        prompt: 'Show my recent transaction history'
      },
      {
        actionType: 'chip',
        key: 'tax-loss-harvesting',
        label: 'Suggest tax-loss harvesting',
        prompt: 'Suggest tax-loss harvesting opportunities in my portfolio'
      }
    ]
  };

  public extract(invokedToolNames: string[]): ActionItem[] {
    if (!Array.isArray(invokedToolNames) || invokedToolNames.length === 0) {
      return [];
    }

    const seenKeys = new Set<string>();
    const actions: ActionItem[] = [];

    // Process in reverse order (most recently invoked first)
    const reversed = [...invokedToolNames].reverse();

    for (const toolName of reversed) {
      const mappings = ActionExtractorService.TOOL_ACTIONS[toolName];

      if (!mappings) {
        continue;
      }

      for (const mapping of mappings) {
        if (seenKeys.has(mapping.key)) {
          continue;
        }

        seenKeys.add(mapping.key);
        actions.push({
          actionType: mapping.actionType,
          key: mapping.key,
          label: mapping.label,
          prompt: mapping.prompt
        });

        if (actions.length >= ActionExtractorService.MAX_ACTIONS) {
          return actions;
        }
      }
    }

    return actions;
  }
}
