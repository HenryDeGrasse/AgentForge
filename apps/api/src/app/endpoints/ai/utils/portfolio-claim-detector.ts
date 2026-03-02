/**
 * Detects whether a text string contains specific, data-backed assertions
 * about a user's portfolio that should be grounded in tool output.
 *
 * Generic mentions of "portfolio" (e.g. "I can help with your portfolio")
 * do NOT trigger this — only concrete value/holding/return claims do.
 *
 * Used in two places:
 *  1. ReactAgentService — to trigger escalation when the LLM answers
 *     portfolio-specifically without having called any tools.
 *  2. ResponseVerifierService — to attach a warning to the final response
 *     when no tools were used but specific claims are present.
 *
 * Keeping the logic in one place prevents the two callsites from drifting.
 */

/** Patterns that signal a concrete, data-backed portfolio assertion. */
const PORTFOLIO_CLAIM_PATTERNS: RegExp[] = [
  // Direct portfolio value assertions
  /\byour portfolio (?:is|has|shows|contains|looks|total|value|worth)\b/i,
  /\byour holdings? (?:are|include|show|consist)\b/i,
  /\btotal (?:portfolio )?value (?:is|of)\b/i,
  /\bnet worth (?:is|of)\b/i,

  // Dollar amount assertions
  /\bworth (?:about |approximately )?\$[\d,]+/i,
  /\b(?:portfolio|account) (?:is worth|has a|total is|value is|contains)\b/i,

  // Position/holding count assertions
  /\b(?:you have|you own|you hold) \d+ (?:share|position|holding|stock|asset)/i,

  // Return/gain/loss assertions with specific figures
  /\b(?:gain|loss|return) of [\d.]+%/i,
  /\btotal return (?:is|of) [\d.]+%/i,
  /\bannualized return (?:is|of)/i,

  // Compliance/risk assertions
  /\b(?:compliant|non-compliant) with\b/i,
  /\brisk (?:score|level|rating) (?:is|of) /i,

  // Tax assertions
  /\btax (?:liability|estimate) (?:is|of)\b/i,

  // Allocation assertions
  /\byour (?:allocation is|exposure is|positions? (?:are|include))\b/i,

  // Specific holding percentage assertions
  /\b(?:account|portfolio) holds? .+ at [\d.]+%/i,
  /\ballocated? [\d.]+% (?:to|in)\b/i
];

/**
 * Returns true when the text contains at least one concrete portfolio
 * assertion that should be backed by tool data.
 *
 * False positives (greetings, capability descriptions) are excluded by
 * requiring a concrete predicate alongside the portfolio reference.
 */
export function containsUnbackedPortfolioClaim(text: string): boolean {
  return PORTFOLIO_CLAIM_PATTERNS.some((pattern) => pattern.test(text));
}
