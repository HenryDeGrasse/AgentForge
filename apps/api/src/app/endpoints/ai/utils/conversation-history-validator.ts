import { LLMMessage } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

import { Logger } from '@nestjs/common';

/**
 * Validates and repairs a prior-message array before it is injected into an
 * LLM conversation.
 *
 * Rules enforced:
 *  1. The first message must have role 'user' (LLMs expect user→assistant alternation).
 *     Leading assistant messages are dropped.
 *  2. Two consecutive messages with the same role are not allowed.
 *     When detected, the older of the two is dropped (the newer message is more
 *     informative and usually reflects the actual last state of the conversation).
 *
 * This repairs conversations that were corrupted by failed persistence writes
 * (e.g. a user message was saved but the assistant reply was lost, leaving two
 * consecutive user messages on the next turn).
 *
 * Never throws. Returns an empty array when input is empty or non-array.
 */
export function validateConversationHistory(
  messages: LLMMessage[],
  context = 'ConversationHistory'
): LLMMessage[] {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [];
  }

  let repaired = [...messages];
  let wasRepaired = false;

  // Rule 1: drop leading assistant messages
  while (repaired.length > 0 && repaired[0].role !== 'user') {
    repaired = repaired.slice(1);
    wasRepaired = true;
  }

  // Rule 2: drop consecutive same-role messages (keep the newer one)
  const deduped: LLMMessage[] = [];

  for (const message of repaired) {
    if (
      deduped.length > 0 &&
      deduped[deduped.length - 1].role === message.role
    ) {
      // Replace the older duplicate with the newer one
      deduped[deduped.length - 1] = message;
      wasRepaired = true;
    } else {
      deduped.push(message);
    }
  }

  if (wasRepaired) {
    Logger.warn(
      `Conversation history repaired: ${messages.length} → ${deduped.length} messages. ` +
        `This may indicate a persistence inconsistency.`,
      context
    );
  }

  return deduped;
}
