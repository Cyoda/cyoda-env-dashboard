/**
 * Generic OIDC client (Authorization Code + PKCE) built on oidc-client-ts.
 *
 * A module-level singleton, so non-React code (the axios 401 handling) can call
 * refreshToken(). Writes the IdP access token into `cyoda_auth` with
 * type 'oidc'; the refresh token stays in the UserManager user store.
 */

import { UserManager, WebStorageStateStore, Log, type User } from 'oidc-client-ts';
import { HelperStorage } from '@cyoda/http-api-react';
import { getOidcConfig, type OidcConfig } from './oidcConfig';

// DEBUG would log whole token responses; never go below WARN.
Log.setLogger(console);
Log.setLevel(Log.WARN);

const helperStorage = new HelperStorage();

let config: OidcConfig | null | undefined;
let manager: UserManager | null = null;
let completion: { url: string; promise: Promise<void> } | null = null;
let refreshInFlight: Promise<string> | null = null;

function getConfig(): OidcConfig | null {
  if (config === undefined) {
    config = getOidcConfig();
  }
  return config;
}

function getManager(): UserManager {
  const cfg = getConfig();
  if (!cfg) {
    throw new Error('OIDC login is not configured');
  }
  if (!manager) {
    const origin = window.location.origin;
    manager = new UserManager({
      authority: cfg.issuer,
      client_id: cfg.clientId,
      scope: cfg.scopes,
      redirect_uri: `${origin}/oidc/callback`,
      post_logout_redirect_uri: `${origin}/login`,
      response_type: 'code',
      automaticSilentRenew: false,
      userStore: new WebStorageStateStore({ store: window.localStorage }),
      stateStore: new WebStorageStateStore({ store: window.sessionStorage }),
    });
  }
  return manager;
}

function displayNameOf(user: User): string {
  const p = user.profile;
  return (p.preferred_username as string | undefined) ?? p.name ?? p.email ?? p.sub;
}

function storeToken(token: string): void {
  const auth = helperStorage.get('auth') ?? {};
  helperStorage.set('auth', { ...auth, token });
}

export function isOidcEnabled(): boolean {
  return getConfig() !== null;
}

export function getOidcDisplayName(): string {
  return getConfig()?.displayName ?? 'SSO';
}

export async function startLogin(): Promise<void> {
  const cfg = getConfig();
  await getManager().signinRedirect({ extraQueryParams: cfg?.extraParams });
}

/** Memoized per callback URL: StrictMode/HMR re-mounts share one exchange. */
export function completeLogin(): Promise<void> {
  const url = window.location.href;
  if (completion?.url !== url) {
    completion = {
      url,
      promise: getManager()
        .signinRedirectCallback(url)
        .then((user) => {
          helperStorage.set('auth', {
            token: user.access_token,
            refreshToken: '',
            user: displayNameOf(user),
            userId: user.profile.sub,
            type: 'oidc',
          });
        }),
    };
  }
  return completion.promise;
}

async function doRefresh(failedToken?: string): Promise<string> {
  const um = getManager();
  const before = await um.getUser();

  // Another tab already refreshed: reuse its token instead of redeeming the
  // same rotating refresh token again.
  if (before && failedToken && before.access_token !== failedToken && before.expired !== true) {
    storeToken(before.access_token);
    return before.access_token;
  }

  if (!before?.refresh_token) {
    // Never fall back to signinSilent's iframe flow (no silent_redirect_uri).
    await clearSession();
    throw new Error('No refresh token available');
  }

  try {
    const user = await um.signinSilent();
    if (!user) {
      throw new Error('Token refresh returned no user');
    }
    storeToken(user.access_token);
    return user.access_token;
  } catch (error) {
    // Lost a race with another tab? Adopt the tokens it stored.
    const after = await um.getUser();
    if (after && (after.refresh_token !== before.refresh_token || after.access_token !== before.access_token)) {
      storeToken(after.access_token);
      return after.access_token;
    }
    await clearSession();
    throw error;
  }
}

/** Matches @cyoda/http-api-react's TokenRefresher. Single-flight within a tab. */
export function refreshToken(failedToken?: string): Promise<string> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh(failedToken).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export type LogoutResult = 'redirecting' | 'local';

/**
 * Ends the session. Returns 'local' when the caller should navigate to /login
 * itself; 'redirecting' when the browser is being sent to the IdP.
 */
export async function logout(opts: { clearAll?: boolean } = {}): Promise<LogoutResult> {
  const cfg = getConfig();
  const um = getManager();

  const idToken = (await um.getUser().catch(() => null))?.id_token;

  await clearSession();
  if (opts.clearAll) {
    helperStorage.clear();
    window.localStorage.clear();
  }

  let endSession: string | undefined;
  try {
    endSession = await um.metadataService.getEndSessionEndpoint();
  } catch {
    endSession = undefined;
  }

  if (endSession) {
    // Its promise does not settle on a real redirect, so don't await it.
    void um.signoutRedirect({ id_token_hint: idToken }).catch(() => {
      window.location.assign(cfg?.logoutUrl ?? '/login');
    });
    return 'redirecting';
  }

  if (cfg?.logoutUrl) {
    window.location.assign(cfg.logoutUrl);
    return 'redirecting';
  }

  return 'local';
}

export async function clearSession(): Promise<void> {
  await getManager().removeUser();
  helperStorage.remove('auth');
}

/** Test helper. */
export function resetOidcClient(): void {
  config = undefined;
  manager = null;
  completion = null;
  refreshInFlight = null;
}
