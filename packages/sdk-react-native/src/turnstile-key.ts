import type { SendOptions } from '@frontmail/sdk-core';

/** Upper bound of remembered tokens (tokens are single use and expire after ~300 s). */
const MAX_TOKENS = 32;
const orgTokens = new Set<string>();

/**
 * Remembers a token produced by a `<TurnstileWebView>` with the customer's own `siteKey`, so the send
 * path can ask the API to verify it with the organization's secret (`turnstile_key: "org"`).
 */
export function markOrgTurnstileToken(token: string): void {
  orgTokens.delete(token);
  orgTokens.add(token);
  if (orgTokens.size > MAX_TOKENS) orgTokens.delete(orgTokens.values().next().value!);
}

/** Adds `turnstileKey: 'org'` for tokens from a custom-key widget unless the caller set it. */
export function withTurnstileKey(options: SendOptions | undefined): SendOptions | undefined {
  if (!options || options.turnstileKey || !options.turnstileToken || !orgTokens.has(options.turnstileToken)) return options;
  return { ...options, turnstileKey: 'org' };
}

/** Forgets all remembered tokens (tests). */
export function _resetOrgTurnstileTokens(): void {
  orgTokens.clear();
}
