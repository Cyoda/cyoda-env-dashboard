/**
 * Token refresh registry.
 *
 * Apps register a refresher per session type (the `type` field of the stored
 * `cyoda_auth` entry). The axios 401 handling looks it up, so this package can
 * refresh e.g. OIDC sessions without importing app code.
 */

/** Resolves to the new access token. `failedToken` is the token that got the 401. */
export type TokenRefresher = (failedToken?: string) => Promise<string>;

export interface TokenRefresherEntry {
  refresh: TokenRefresher;
  /** Clears any app-side session state (e.g. the stored OIDC user). */
  clearSession?: () => Promise<void> | void;
}

const registry = new Map<string, TokenRefresherEntry>();

export function registerTokenRefresher(
  type: string,
  fn: TokenRefresher,
  opts: { clearSession?: () => Promise<void> | void } = {},
): void {
  registry.set(type, { refresh: fn, clearSession: opts.clearSession });
}

export function getTokenRefresher(type?: string): TokenRefresherEntry | undefined {
  return type ? registry.get(type) : undefined;
}

/** Test helper. */
export function clearTokenRefreshers(): void {
  registry.clear();
}
