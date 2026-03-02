import { validateConversationHistory } from './conversation-history-validator';

const user = (content: string) => ({ content, role: 'user' as const });
const assistant = (content: string) => ({
  content,
  role: 'assistant' as const
});

describe('validateConversationHistory', () => {
  describe('normal history — no repair needed', () => {
    it('passes through a well-formed alternating history unchanged', () => {
      const input = [user('Hello'), assistant('Hi'), user('How are you?')];
      expect(validateConversationHistory(input)).toEqual(input);
    });

    it('passes through a single user message', () => {
      const input = [user('What is my portfolio worth?')];
      expect(validateConversationHistory(input)).toEqual(input);
    });

    it('returns empty array for empty input', () => {
      expect(validateConversationHistory([])).toEqual([]);
    });

    it('returns empty array for non-array input', () => {
      expect(validateConversationHistory(null as any)).toEqual([]);
      expect(validateConversationHistory(undefined as any)).toEqual([]);
    });
  });

  describe('rule 1: drop leading assistant messages', () => {
    it('drops a single leading assistant message', () => {
      const input = [assistant('Hi there'), user('Hello'), assistant('World')];
      const result = validateConversationHistory(input);
      expect(result[0].role).toBe('user');
      expect(result).toEqual([user('Hello'), assistant('World')]);
    });

    it('drops multiple leading assistant messages', () => {
      const input = [
        assistant('First'),
        assistant('Second'),
        user('My message')
      ];
      const result = validateConversationHistory(input);
      expect(result).toEqual([user('My message')]);
    });

    it('returns empty array if ALL messages are assistant role', () => {
      const input = [assistant('A'), assistant('B')];
      expect(validateConversationHistory(input)).toEqual([]);
    });
  });

  describe('rule 2: remove consecutive same-role duplicates', () => {
    it('deduplicates two consecutive user messages, keeping the newer one', () => {
      const input = [
        user('First user'),
        user('Second user'),
        assistant('Reply')
      ];
      const result = validateConversationHistory(input);
      expect(result).toEqual([user('Second user'), assistant('Reply')]);
    });

    it('deduplicates two consecutive assistant messages, keeping the newer one', () => {
      const input = [
        user('Q'),
        assistant('First reply'),
        assistant('Better reply')
      ];
      const result = validateConversationHistory(input);
      expect(result).toEqual([user('Q'), assistant('Better reply')]);
    });

    it('handles a run of three consecutive same-role messages', () => {
      const input = [
        user('First'),
        user('Second'),
        user('Third'),
        assistant('Reply')
      ];
      const result = validateConversationHistory(input);
      expect(result).toEqual([user('Third'), assistant('Reply')]);
    });

    it('handles interleaved duplicates', () => {
      const input = [
        user('U1'),
        assistant('A1'),
        assistant('A2'),
        user('U2'),
        user('U3')
      ];
      const result = validateConversationHistory(input);
      expect(result).toEqual([user('U1'), assistant('A2'), user('U3')]);
    });
  });

  describe('combined repairs', () => {
    it('drops leading assistant AND deduplicates consecutive messages', () => {
      const input = [
        assistant('Leader'),
        user('U1'),
        user('U2'),
        assistant('A1')
      ];
      const result = validateConversationHistory(input);
      expect(result).toEqual([user('U2'), assistant('A1')]);
    });
  });
});
