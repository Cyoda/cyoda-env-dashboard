# Generic OIDC Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Auth0-specific login with one generic "Login with {name}" OIDC flow (Authorization Code + PKCE via `oidc-client-ts`). It must work against ctcc's Zitadel with cyoda-go, and against Auth0 on Cloud.

**Architecture:**

- A module-level `oidc-client-ts` `UserManager` singleton in `apps/saas-app/src/auth/` handles login, callback, refresh and logout. It writes the IdP access token into the existing `cyoda_auth` storage entry with `type: 'oidc'`.
- `@cyoda/http-api-react` gains a token-refresher registry and a shared `handle401()`. Every token-bearing axios instance then refreshes OIDC sessions without importing app code.
- All Auth0 code, the dead Refine providers, and the Auth0 tooling and docs are removed.

**Tech Stack:** React 18, React Router 6, antd 5, Vite, axios, `oidc-client-ts@^3.5.0`, vitest + Testing Library (jsdom), Playwright, pnpm workspaces, bash + curl + jq for the Zitadel script.

**Spec:** `docs/superpowers/specs/2026-09-25-oidc-login-design.md` (revision 4). Read it before starting any task. Where this plan and the spec disagree, the spec wins; flag the conflict.

## Global Constraints

- One provider per build, configured only by these build-time vars:
  - `VITE_APP_OIDC_ISSUER`
  - `VITE_APP_OIDC_CLIENT_ID`
  - `VITE_APP_OIDC_DISPLAY_NAME` (default `SSO`)
  - `VITE_APP_OIDC_SCOPES` (default `openid profile email offline_access`)
  - `VITE_APP_OIDC_EXTRA_PARAMS`
  - `VITE_APP_OIDC_LOGOUT_URL`
- OIDC is enabled only when both `ISSUER` and `CLIENT_ID` are set.
- `redirect_uri` is always `${window.location.origin}/oidc/callback`. `post_logout_redirect_uri` is always `${window.location.origin}/login`.
- `cyoda_auth` shape for OIDC: `{ token, refreshToken: '', user, userId, type: 'oidc' }`. The refresh token lives only in the `UserManager` user store (localStorage key `oidc.user:{issuer}:{clientId}`).
- `extraQueryParams` go only on `signinRedirect(...)`, never in `UserManager` settings.
- The `oidc-client-ts` log level is `Log.WARN` in every environment. Never log tokens or `User` objects.
- Login-page copy, exactly:
  - button: `Login with {displayName}`
  - start-login failure: `Login with {displayName} failed: {err.message}`
  - `?reason=expired`: `Your session expired. Please log in again.`
  - `?reason=rejected`: `The server rejected your credentials. If this persists, check that the backend trusts this identity provider.`
- The password form is hidden when `HelperFeatureFlags.isCyodaGo()` is true.
- Never touch `packages/cobi-react` or `packages/cyoda-sass-react`. Never run the full `pnpm test:run`: run only the listed test files, with `pnpm exec vitest run <files>` from the repo root.
- Screenshots and Playwright MCP output go to `.playwright-mcp/`, never the repo root.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A second 401 while a refresh is in flight.** It must wait for the same refresh, not start another. Pinned in Task 1 ("concurrent 401s share one refresh").
2. **A deep link opened with no session.** The user must see the plain login page, never "session expired". Pinned in Task 1 ("401 without a session redirects to plain /login") and Task 5 (`AppLayout` never renders the outlet).
3. **Refresh that fails because another tab already rotated the token.** This tab must adopt the new token and not log anyone out. Pinned in Task 3 ("adopts tokens rotated by another tab").
4. **"Logout and Clear Data" for an OIDC session.** It must still clear all storage and still end the IdP session: the `id_token` is read before clearing. Pinned in Task 3 (`clearAll` test) and Task 5 (`LeftSideMenu` test).
5. **Reloading `/oidc/callback` after a successful login.** It must go to the app, not show "No matching state". Pinned in Task 4 ("reload after login").

## File Structure

| File | Responsibility |
|---|---|
| `packages/http-api-react/src/config/tokenRefresh.ts` (new) | Registry: session type → refresher + optional `clearSession`. |
| `packages/http-api-react/src/config/redirect.ts` (new) | `redirectToLogin(reason?)`, so tests can mock navigation. |
| `packages/http-api-react/src/config/axios.ts` (modify) | `refreshAccessToken(failedToken)`, shared `handle401`, Grafana exclusion. |
| `apps/saas-app/src/auth/oidcConfig.ts` (new) | Reads and validates `VITE_APP_OIDC_*`. |
| `apps/saas-app/src/auth/session.ts` (new) | `isValidSession()`, `purgeLegacyAuth0Cache()`, `AuthData` type. |
| `apps/saas-app/src/utils/defaultRoute.ts` (new) | Go-aware `getDefaultRoute()`. |
| `apps/saas-app/src/auth/oidcClient.ts` (new) | `UserManager` singleton: `startLogin`, `completeLogin`, `refreshToken`, `logout`, `clearSession`. |
| `apps/saas-app/src/auth/OidcCallback.tsx` (new) | `/oidc/callback` page. |
| `apps/saas-app/src/pages/Login.tsx` (modify) | Password form / OIDC button / notices. |
| `apps/saas-app/src/components/AppLayout.tsx` (modify) | Synchronous route guard. |
| `apps/saas-app/src/components/LeftSideMenu.tsx` (modify) | OIDC-aware logout. |
| `apps/saas-app/src/App.tsx`, `main.tsx`, `routes/index.tsx` (modify) | Remove `Auth0Provider`; register the refresher; add the callback route. |
| `scripts/zitadel/create-dashboard-oidc-app.sh` (new) | Registers the dashboard's public client in ctcc Zitadel. |
| `e2e/oidc-login.spec.ts` (new) | Checks which login methods the login page renders. |

---

### Task 1: Token-refresh registry and shared 401 handling in `@cyoda/http-api-react`

**Files:**
- Create: `packages/http-api-react/src/config/tokenRefresh.ts`
- Create: `packages/http-api-react/src/config/redirect.ts`
- Modify: `packages/http-api-react/src/config/axios.ts` (whole 401 section: lines 9, 46-120, 155-190, 214-249, 266-301, 325-360)
- Modify: `packages/http-api-react/src/index.ts` (add export)
- Test: `packages/http-api-react/src/config/tokenRefresh.test.ts`
- Test: `packages/http-api-react/src/config/axios.handle401.test.ts`

**Interfaces:**
- Produces:
  - `type TokenRefresher = (failedToken?: string) => Promise<string>`
  - `interface TokenRefresherEntry { refresh: TokenRefresher; clearSession?: () => Promise<void> | void }`
  - `registerTokenRefresher(type: string, fn: TokenRefresher, opts?: { clearSession?: () => Promise<void> | void }): void`
  - `getTokenRefresher(type?: string): TokenRefresherEntry | undefined`
  - `clearTokenRefreshers(): void`, for tests only
  - `redirectToLogin(reason?: 'expired' | 'rejected'): void`
  - `handle401(error: AxiosError): Promise<AxiosResponse>`, exported from `config/axios.ts` for tests
  - Everything in `tokenRefresh.ts` is re-exported from the package index.

- [ ] **Step 1: Write the failing registry test**

`packages/http-api-react/src/config/tokenRefresh.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerTokenRefresher, getTokenRefresher, clearTokenRefreshers } from './tokenRefresh';

describe('tokenRefresh registry', () => {
  beforeEach(() => clearTokenRefreshers());

  it('returns undefined for unknown or missing types', () => {
    expect(getTokenRefresher('oidc')).toBeUndefined();
    expect(getTokenRefresher(undefined)).toBeUndefined();
  });

  it('returns the registered refresher and clearSession hook', async () => {
    const refresh = vi.fn().mockResolvedValue('new-token');
    const clearSession = vi.fn();
    registerTokenRefresher('oidc', refresh, { clearSession });

    const entry = getTokenRefresher('oidc');
    expect(entry?.clearSession).toBe(clearSession);
    await expect(entry?.refresh('old')).resolves.toBe('new-token');
    expect(refresh).toHaveBeenCalledWith('old');
  });

  it('re-registering a type replaces the previous entry', () => {
    const first = vi.fn();
    const second = vi.fn();
    registerTokenRefresher('oidc', first);
    registerTokenRefresher('oidc', second);
    expect(getTokenRefresher('oidc')?.refresh).toBe(second);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run packages/http-api-react/src/config/tokenRefresh.test.ts`
Expected: FAIL, `Failed to resolve import "./tokenRefresh"`.

- [ ] **Step 3: Implement the registry and the redirect helper**

`packages/http-api-react/src/config/tokenRefresh.ts`:

```ts
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
```

`packages/http-api-react/src/config/redirect.ts`:

```ts
export type LoginReason = 'expired' | 'rejected';

/** Full-page navigation to the login page, optionally with a reason notice. */
export function redirectToLogin(reason?: LoginReason): void {
  window.location.href = reason ? `/login?reason=${reason}` : '/login';
}
```

Add to `packages/http-api-react/src/index.ts`, directly after the `// Export axios instances` export line:

```ts
// Export token refresh registry
export * from './config/tokenRefresh';
```

- [ ] **Step 4: Run the registry test to verify it passes**

Run: `pnpm exec vitest run packages/http-api-react/src/config/tokenRefresh.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing `handle401` tests**

`packages/http-api-react/src/config/axios.handle401.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import axios, { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';

vi.mock('./redirect', () => ({ redirectToLogin: vi.fn() }));

import instance, { axiosPublic, axiosPlatform, axiosProcessing, axiosAI, axiosGrafana, handle401 } from './axios';
import { redirectToLogin } from './redirect';
import { registerTokenRefresher, clearTokenRefreshers } from './tokenRefresh';

const AUTH_KEY = 'cyoda_auth';

function setAuth(auth: object | null) {
  if (auth) localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
  else localStorage.removeItem(AUTH_KEY);
}
function getAuth() {
  const raw = localStorage.getItem(AUTH_KEY);
  return raw ? JSON.parse(raw) : null;
}
function makeConfig(token = 'old'): InternalAxiosRequestConfig {
  return { url: '/x', method: 'get', headers: new AxiosHeaders({ Authorization: `Bearer ${token}` }) };
}
function make401(config: InternalAxiosRequestConfig): AxiosError {
  return new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, null, {
    status: 401, statusText: 'Unauthorized', data: {}, headers: {}, config,
  });
}

describe('handle401', () => {
  beforeEach(() => {
    localStorage.clear();
    clearTokenRefreshers();
    vi.restoreAllMocks();
    vi.mocked(redirectToLogin).mockClear();
  });

  it('refreshes an oidc session via the registered refresher, passing the failed token, then retries', async () => {
    setAuth({ token: 'old', type: 'oidc', user: 'u' });
    const refresh = vi.fn(async () => {
      setAuth({ token: 'new', type: 'oidc', user: 'u' });
      return 'new';
    });
    registerTokenRefresher('oidc', refresh);
    const request = vi.spyOn(axios, 'request').mockResolvedValue({ data: 'ok', status: 200 } as any);

    const config = makeConfig('old');
    const res = await handle401(make401(config));

    expect(res.data).toBe('ok');
    expect(refresh).toHaveBeenCalledWith('old');
    const retried = request.mock.calls[0][0] as InternalAxiosRequestConfig & { __isRetryRequest?: boolean };
    expect(retried.headers.Authorization).toBe('Bearer new');
    expect(retried.__isRetryRequest).toBe(true);
  });

  it('concurrent 401s share one refresh', async () => {
    setAuth({ token: 'old', type: 'oidc', user: 'u' });
    let resolve!: (t: string) => void;
    const refresh = vi.fn(() => new Promise<string>((r) => { resolve = r; }));
    registerTokenRefresher('oidc', refresh);
    vi.spyOn(axios, 'request').mockResolvedValue({ data: 'ok', status: 200 } as any);

    const a = handle401(make401(makeConfig()));
    const b = handle401(make401(makeConfig()));
    await Promise.resolve();
    setAuth({ token: 'new', type: 'oidc', user: 'u' });
    resolve('new');
    await Promise.all([a, b]);

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('standard sessions still use /auth/token', async () => {
    setAuth({ token: 'old', refreshToken: 'rt', type: 'standard', user: 'u' });
    const get = vi.spyOn(axiosPublic, 'get').mockResolvedValue({ data: { token: 'fresh' } } as any);
    vi.spyOn(axios, 'request').mockResolvedValue({ data: 'ok', status: 200 } as any);

    await handle401(make401(makeConfig()));

    expect(get).toHaveBeenCalledWith('/auth/token', { headers: { Authorization: 'Bearer rt' } });
    expect(getAuth().token).toBe('fresh');
  });

  it('a failed refresh with a session clears auth and redirects to ?reason=expired', async () => {
    setAuth({ token: 'old', type: 'oidc', user: 'u' });
    registerTokenRefresher('oidc', vi.fn().mockRejectedValue(new Error('invalid_grant')));

    await expect(handle401(make401(makeConfig()))).rejects.toThrow('invalid_grant');
    expect(getAuth()).toBeNull();
    expect(redirectToLogin).toHaveBeenCalledWith('expired');
  });

  it('401 without a session redirects to plain /login', async () => {
    setAuth(null);

    await expect(handle401(make401(makeConfig()))).rejects.toThrow();
    expect(redirectToLogin).toHaveBeenCalledWith(undefined);
  });

  it('a 401 on the retried request does not refresh again, calls clearSession and redirects to ?reason=rejected', async () => {
    setAuth({ token: 'old', type: 'oidc', user: 'u' });
    const clearSession = vi.fn();
    const refresh = vi.fn(async () => {
      setAuth({ token: 'new', type: 'oidc', user: 'u' });
      return 'new';
    });
    registerTokenRefresher('oidc', refresh, { clearSession });
    vi.spyOn(axios, 'request').mockImplementation(async (cfg: any) => {
      throw make401(cfg);
    });

    await expect(handle401(make401(makeConfig()))).rejects.toMatchObject({ response: { status: 401 } });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(clearSession).toHaveBeenCalledTimes(1);
    expect(getAuth()).toBeNull();
    expect(redirectToLogin).toHaveBeenCalledWith('rejected');
  });

  it('a non-401 error on the retry is rethrown unchanged', async () => {
    setAuth({ token: 'old', type: 'oidc', user: 'u' });
    registerTokenRefresher('oidc', vi.fn().mockResolvedValue('new'));
    const boom = new Error('network down');
    vi.spyOn(axios, 'request').mockRejectedValue(boom);

    await expect(handle401(make401(makeConfig()))).rejects.toBe(boom);
    expect(redirectToLogin).not.toHaveBeenCalled();
  });
});

describe('interceptor wiring', () => {
  beforeEach(() => {
    localStorage.clear();
    clearTokenRefreshers();
    vi.restoreAllMocks();
    vi.mocked(redirectToLogin).mockClear();
  });

  it.each([
    ['instance', instance],
    ['axiosPlatform', axiosPlatform],
    ['axiosProcessing', axiosProcessing],
    ['axiosAI', axiosAI],
  ])('%s routes a 401 through the refresher', async (_name, client) => {
    setAuth({ token: 'old', type: 'oidc', user: 'u' });
    const refresh = vi.fn(async () => {
      setAuth({ token: 'new', type: 'oidc', user: 'u' });
      return 'new';
    });
    registerTokenRefresher('oidc', refresh);
    vi.spyOn(axios, 'request').mockResolvedValue({ data: 'ok', status: 200 } as any);

    const adapter = async (config: InternalAxiosRequestConfig) => {
      throw make401(config);
    };
    const res = await client.get('/x', { adapter });

    expect(res.data).toBe('ok');
    expect(refresh).toHaveBeenCalledWith('old');
  });

  it('axiosGrafana does not refresh on 401', async () => {
    setAuth({ token: 'old', type: 'oidc', user: 'u' });
    const refresh = vi.fn();
    registerTokenRefresher('oidc', refresh);

    const adapter = async (config: InternalAxiosRequestConfig) => {
      throw make401(config);
    };
    await expect(axiosGrafana.get('/x', { adapter })).rejects.toMatchObject({ response: { status: 401 } });
    expect(refresh).not.toHaveBeenCalled();
    expect(getAuth()?.token).toBe('old');
  });
});
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `pnpm exec vitest run packages/http-api-react/src/config/axios.handle401.test.ts`
Expected: FAIL. `handle401` isn't exported, so the named import is `undefined` and every call throws `TypeError: handle401 is not a function`.

- [ ] **Step 7: Refactor `axios.ts`**

Edit `packages/http-api-react/src/config/axios.ts`:

1. Replace the import block and `let refreshAccessTokenPromise…` (lines 1-11) with:

```ts
import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig, AxiosResponse } from 'axios';
import { HelperStorage } from '../utils/storage';
import { HelperErrors } from '../utils/errors';
import { serializeParams } from '../utils/serializeParams';
import { getTokenRefresher } from './tokenRefresh';
import { redirectToLogin } from './redirect';

// Configure default params serializer
axios.defaults.paramsSerializer = { serialize: serializeParams };

type RetryableConfig = InternalAxiosRequestConfig & { __isRetryRequest?: boolean; muteErrors?: boolean };

let refreshAccessTokenPromise: Promise<void> | null = null;

const helperStorage = new HelperStorage();
```

2. Replace the `instance.interceptors.response.use(...)` block and the whole `refreshAccessToken` function (from `/** Response interceptor - handles errors and token refresh */` through the closing `}` of `refreshAccessToken`) with:

```ts
/**
 * Bearer token that the failing request carried, if any.
 */
function bearerOf(config: InternalAxiosRequestConfig): string | undefined {
  const header = config.headers?.Authorization ?? config.headers?.authorization;
  return typeof header === 'string' && header.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
}

/**
 * Refresh the access token for the current session.
 * Registered refreshers (e.g. OIDC) take precedence; otherwise the legacy
 * /auth/token flow is used (migrated from Vue: cyoda-ui-lib/src/stores/auth.ts).
 * On failure: clear auth and go to /login, with ?reason=expired only when a
 * session existed.
 */
async function refreshAccessToken(failedToken?: string): Promise<void> {
  const auth = helperStorage.get('auth');
  try {
    const entry = getTokenRefresher(auth?.type);
    if (entry) {
      await entry.refresh(failedToken);
      return;
    }

    const refreshToken = auth?.refreshToken;
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await axiosPublic.get('/auth/token', {
      headers: {
        Authorization: `Bearer ${refreshToken}`,
      },
    });

    helperStorage.set('auth', { ...auth, token: response.data.token });
  } catch (error) {
    helperStorage.remove('auth');
    redirectToLogin(auth?.token ? 'expired' : undefined);
    throw error;
  }
}

/**
 * Shared 401 handling for every token-bearing instance: single-flight refresh,
 * one retry, and a loop guard when the backend rejects the refreshed token.
 */
export async function handle401(error: AxiosError): Promise<AxiosResponse> {
  const config = error.config as RetryableConfig;
  // Snapshot before anything is removed, so the loop guard can still find the hook.
  const entry = getTokenRefresher(helperStorage.get('auth')?.type);

  if (!refreshAccessTokenPromise) {
    refreshAccessTokenPromise = refreshAccessToken(bearerOf(config)).finally(() => {
      refreshAccessTokenPromise = null;
    });
  }
  await refreshAccessTokenPromise;

  config.__isRetryRequest = true;
  const token = helperStorage.get('auth')?.token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  try {
    // Global axios has none of these interceptors, so this cannot recurse.
    return await axios.request(config);
  } catch (retryError) {
    if ((retryError as AxiosError)?.response?.status === 401) {
      helperStorage.remove('auth');
      await entry?.clearSession?.();
      redirectToLogin('rejected');
    }
    throw retryError;
  }
}

/**
 * Response error handler shared by the token-bearing instances.
 */
async function onResponseError(error: AxiosError): Promise<AxiosResponse> {
  const config = error.config as RetryableConfig | undefined;
  if (!config?.muteErrors) {
    HelperErrors.handler(error);
  }
  if (error.response?.status === 401 && config && !config.__isRetryRequest) {
    return handle401(error);
  }
  return Promise.reject(error);
}

/**
 * Response interceptor - handles errors and token refresh
 */
instance.interceptors.response.use((response: AxiosResponse) => response, onResponseError);
```

3. Replace each of the `axiosPlatform`, `axiosProcessing` and `axiosAI` `interceptors.response.use(...)` blocks (the whole `(response) => response, async (error) => { ... }` body) with the matching one-liner:

```ts
axiosPlatform.interceptors.response.use((response: AxiosResponse) => response, onResponseError);
```

```ts
axiosProcessing.interceptors.response.use((response: AxiosResponse) => response, onResponseError);
```

```ts
axiosAI.interceptors.response.use((response: AxiosResponse) => response, onResponseError);
```

4. Replace the `axiosGrafana.interceptors.response.use(...)` block with:

```ts
// Grafana uses basic auth: a 401 says nothing about the cyoda token, so never refresh.
axiosGrafana.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    if (!(error.config as RetryableConfig | undefined)?.muteErrors) {
      HelperErrors.handler(error);
    }
    return Promise.reject(error);
  }
);
```

`onResponseError` and `refreshAccessToken` are function declarations, so they're hoisted. Using them in `.use(...)` calls and referencing `axiosPublic` before its textual definition are both fine at runtime.

- [ ] **Step 8: Run both test files to verify they pass**

Run: `pnpm exec vitest run packages/http-api-react/src/config/tokenRefresh.test.ts packages/http-api-react/src/config/axios.handle401.test.ts`
Expected: PASS, 3 + 12 tests: 7 in the `handle401` block and 5 in the wiring block, where `it.each` over four clients counts as 4 plus the Grafana test.

- [ ] **Step 9: Run the package's existing axios-adjacent tests, then type-check and lint**

Run: `pnpm exec vitest run packages/http-api-react/src/utils/errors.test.ts packages/http-api-react/src/hooks`
Expected: PASS, same count as before the change.

Run: `pnpm --filter @cyoda/http-api-react type-check && pnpm exec eslint packages/http-api-react/src/config`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add packages/http-api-react/src/config packages/http-api-react/src/index.ts
git commit -m "feat(http-api-react): token refresher registry and shared 401 handling

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: OIDC config, session helpers and default route (saas-app)

**Files:**
- Create: `apps/saas-app/src/auth/oidcConfig.ts`
- Create: `apps/saas-app/src/auth/session.ts`
- Create: `apps/saas-app/src/utils/defaultRoute.ts`
- Modify: `apps/saas-app/src/vite-env.d.ts`
- Test: `apps/saas-app/src/auth/__tests__/oidcConfig.test.ts`
- Test: `apps/saas-app/src/auth/__tests__/session.test.ts`
- Test: `apps/saas-app/src/utils/__tests__/defaultRoute.test.ts`

**Interfaces:**
- Produces:
  - `interface OidcConfig { issuer: string; clientId: string; displayName: string; scopes: string; extraParams: Record<string, string>; logoutUrl?: string }`
  - `DEFAULT_SCOPES = 'openid profile email offline_access'`
  - `getOidcConfig(env?: Record<string, unknown>): OidcConfig | null`
  - `resetOidcConfigWarning(): void`, for tests only
  - `type AuthType = 'standard' | 'oidc'`
  - `interface AuthData { token: string; refreshToken?: string; user: string; userId?: string; legalEntityId?: string; type?: AuthType | 'auth0' }`
  - `isValidSession(): boolean`
  - `purgeLegacyAuth0Cache(storage?: Storage): void`
  - `getDefaultRoute(): string`

- [ ] **Step 1: Write the failing tests**

`apps/saas-app/src/auth/__tests__/oidcConfig.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getOidcConfig, resetOidcConfigWarning, DEFAULT_SCOPES } from '../oidcConfig';

describe('getOidcConfig', () => {
  beforeEach(() => {
    resetOidcConfigWarning();
    vi.restoreAllMocks();
  });

  it('is disabled when neither issuer nor client id is set, without warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(getOidcConfig({})).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('is disabled with one warning naming the missing var when only one is set', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(getOidcConfig({ VITE_APP_OIDC_ISSUER: 'http://idp' })).toBeNull();
    expect(getOidcConfig({ VITE_APP_OIDC_ISSUER: 'http://idp' })).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('VITE_APP_OIDC_CLIENT_ID');
  });

  it('applies defaults', () => {
    expect(getOidcConfig({ VITE_APP_OIDC_ISSUER: ' http://idp ', VITE_APP_OIDC_CLIENT_ID: 'abc' })).toEqual({
      issuer: 'http://idp',
      clientId: 'abc',
      displayName: 'SSO',
      scopes: DEFAULT_SCOPES,
      extraParams: {},
      logoutUrl: undefined,
    });
  });

  it('reads display name, scopes, extra params and logout url', () => {
    const cfg = getOidcConfig({
      VITE_APP_OIDC_ISSUER: 'https://auth.cyoda.net/',
      VITE_APP_OIDC_CLIENT_ID: 'abc',
      VITE_APP_OIDC_DISPLAY_NAME: 'Auth0',
      VITE_APP_OIDC_SCOPES: 'openid offline_access',
      VITE_APP_OIDC_EXTRA_PARAMS: 'audience=https%3A%2F%2Fcloud.cyoda.com%2Fapi&organization=org_1',
      VITE_APP_OIDC_LOGOUT_URL: 'https://auth.cyoda.net/v2/logout?client_id=abc',
    });
    expect(cfg).toMatchObject({
      displayName: 'Auth0',
      scopes: 'openid offline_access',
      extraParams: { audience: 'https://cloud.cyoda.com/api', organization: 'org_1' },
      logoutUrl: 'https://auth.cyoda.net/v2/logout?client_id=abc',
    });
  });

  it('ignores non-string env values', () => {
    expect(getOidcConfig({ VITE_APP_OIDC_ISSUER: true, VITE_APP_OIDC_CLIENT_ID: 'abc' })).toBeNull();
  });
});
```

`apps/saas-app/src/auth/__tests__/session.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { isValidSession, purgeLegacyAuth0Cache } from '../session';

const setAuth = (auth: object) => localStorage.setItem('cyoda_auth', JSON.stringify(auth));

describe('isValidSession', () => {
  beforeEach(() => localStorage.clear());

  it('is false without a stored session or token', () => {
    expect(isValidSession()).toBe(false);
    setAuth({ user: 'u', type: 'oidc' });
    expect(isValidSession()).toBe(false);
  });

  it.each(['standard', 'oidc', undefined])('accepts type %s', (type) => {
    setAuth({ token: 't', user: 'u', type });
    expect(isValidSession()).toBe(true);
  });

  it('removes a legacy auth0 session and treats it as invalid', () => {
    setAuth({ token: 't', user: 'u', type: 'auth0' });
    expect(isValidSession()).toBe(false);
    expect(localStorage.getItem('cyoda_auth')).toBeNull();
  });
});

describe('purgeLegacyAuth0Cache', () => {
  beforeEach(() => localStorage.clear());

  it('removes only @@auth0spajs@@ keys', () => {
    localStorage.setItem('@@auth0spajs@@::client::aud::openid', '{"refresh_token":"x"}');
    localStorage.setItem('@@auth0spajs@@::client::@@user@@', '{}');
    localStorage.setItem('cyoda_auth', '{"token":"t"}');
    localStorage.setItem('oidc.user:http://idp:abc', '{}');

    purgeLegacyAuth0Cache();

    expect(Object.keys(localStorage).sort()).toEqual(['cyoda_auth', 'oidc.user:http://idp:abc']);
  });
});
```

`apps/saas-app/src/utils/__tests__/defaultRoute.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HelperFeatureFlags } from '@cyoda/http-api-react';
import { getDefaultRoute } from '../defaultRoute';

describe('getDefaultRoute', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('prefers Trino when enabled', () => {
    vi.spyOn(HelperFeatureFlags, 'isTrinoSqlSchemaEnabled').mockReturnValue(true);
    vi.spyOn(HelperFeatureFlags, 'isReportingAvailable').mockReturnValue(true);
    expect(getDefaultRoute()).toBe('/trino');
  });

  it('falls back to reporting when available', () => {
    vi.spyOn(HelperFeatureFlags, 'isTrinoSqlSchemaEnabled').mockReturnValue(false);
    vi.spyOn(HelperFeatureFlags, 'isReportingAvailable').mockReturnValue(true);
    expect(getDefaultRoute()).toBe('/reporting/reports');
  });

  it('uses /workflows when neither exists (e.g. Go mode)', () => {
    vi.spyOn(HelperFeatureFlags, 'isTrinoSqlSchemaEnabled').mockReturnValue(false);
    vi.spyOn(HelperFeatureFlags, 'isReportingAvailable').mockReturnValue(false);
    expect(getDefaultRoute()).toBe('/workflows');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm exec vitest run apps/saas-app/src/auth/__tests__/oidcConfig.test.ts apps/saas-app/src/auth/__tests__/session.test.ts apps/saas-app/src/utils/__tests__/defaultRoute.test.ts`
Expected: FAIL. Imports of `../oidcConfig`, `../session` and `../defaultRoute` can't be resolved.

- [ ] **Step 3: Implement**

`apps/saas-app/src/auth/oidcConfig.ts`:

```ts
/**
 * Build-time OIDC provider configuration (one provider per build).
 * The only reader of VITE_APP_OIDC_*.
 */

export interface OidcConfig {
  issuer: string;
  clientId: string;
  displayName: string;
  scopes: string;
  extraParams: Record<string, string>;
  logoutUrl?: string;
}

export const DEFAULT_SCOPES = 'openid profile email offline_access';

let warned = false;

export function getOidcConfig(env: Record<string, unknown> = import.meta.env): OidcConfig | null {
  const read = (key: string): string => {
    const value = env[key];
    return typeof value === 'string' ? value.trim() : '';
  };

  const issuer = read('VITE_APP_OIDC_ISSUER');
  const clientId = read('VITE_APP_OIDC_CLIENT_ID');

  if (!issuer || !clientId) {
    if ((issuer || clientId) && !warned) {
      warned = true;
      const missing = issuer ? 'VITE_APP_OIDC_CLIENT_ID' : 'VITE_APP_OIDC_ISSUER';
      console.warn(`[oidc] OIDC login disabled: ${missing} is not set`);
    }
    return null;
  }

  return {
    issuer,
    clientId,
    displayName: read('VITE_APP_OIDC_DISPLAY_NAME') || 'SSO',
    scopes: read('VITE_APP_OIDC_SCOPES') || DEFAULT_SCOPES,
    extraParams: Object.fromEntries(new URLSearchParams(read('VITE_APP_OIDC_EXTRA_PARAMS'))),
    logoutUrl: read('VITE_APP_OIDC_LOGOUT_URL') || undefined,
  };
}

/** Test helper. */
export function resetOidcConfigWarning(): void {
  warned = false;
}
```

`apps/saas-app/src/auth/session.ts`:

```ts
import { HelperStorage } from '@cyoda/http-api-react';

export type AuthType = 'standard' | 'oidc';

/** Shape of the `cyoda_auth` storage entry. 'auth0' only appears in stale sessions. */
export interface AuthData {
  token: string;
  refreshToken?: string;
  user: string;
  userId?: string;
  legalEntityId?: string;
  type?: AuthType | 'auth0';
}

const helperStorage = new HelperStorage();

/**
 * True when a usable session is stored. A stale Auth0 session (from before the
 * OIDC migration) is removed and counts as logged out.
 */
export function isValidSession(): boolean {
  const auth = helperStorage.get<AuthData>('auth');
  if (!auth?.token) {
    return false;
  }
  if (auth.type === 'auth0') {
    helperStorage.remove('auth');
    return false;
  }
  return auth.type === undefined || auth.type === 'standard' || auth.type === 'oidc';
}

const LEGACY_AUTH0_PREFIX = '@@auth0spajs@@';

/** Removes the old @auth0/auth0-react cache, which holds refresh tokens. */
export function purgeLegacyAuth0Cache(storage: Storage = window.localStorage): void {
  Object.keys(storage)
    .filter((key) => key.startsWith(LEGACY_AUTH0_PREFIX))
    .forEach((key) => storage.removeItem(key));
}
```

`apps/saas-app/src/utils/defaultRoute.ts`:

```ts
import { HelperFeatureFlags } from '@cyoda/http-api-react';

/** Landing route after login; only returns routes that are registered in this mode. */
export function getDefaultRoute(): string {
  if (HelperFeatureFlags.isTrinoSqlSchemaEnabled()) {
    return '/trino';
  }
  if (HelperFeatureFlags.isReportingAvailable()) {
    return '/reporting/reports';
  }
  return '/workflows';
}
```

In `apps/saas-app/src/vite-env.d.ts`, add inside `interface ImportMetaEnv` after `VITE_APP_API_BASE`:

```ts
  readonly VITE_APP_OIDC_ISSUER?: string;
  readonly VITE_APP_OIDC_CLIENT_ID?: string;
  readonly VITE_APP_OIDC_DISPLAY_NAME?: string;
  readonly VITE_APP_OIDC_SCOPES?: string;
  readonly VITE_APP_OIDC_EXTRA_PARAMS?: string;
  readonly VITE_APP_OIDC_LOGOUT_URL?: string;
```

If `tsc` complains that `import.meta.env` isn't assignable to `Record<string, unknown>`, change the default parameter to `env: Record<string, unknown> = import.meta.env as unknown as Record<string, unknown>`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run apps/saas-app/src/auth/__tests__/oidcConfig.test.ts apps/saas-app/src/auth/__tests__/session.test.ts apps/saas-app/src/utils/__tests__/defaultRoute.test.ts`
Expected: PASS (5 + 5 + 3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/saas-app/src/auth apps/saas-app/src/utils/defaultRoute.ts apps/saas-app/src/utils/__tests__ apps/saas-app/src/vite-env.d.ts
git commit -m "feat(saas-app): OIDC config, session helpers and Go-aware default route

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `oidcClient` (UserManager singleton)

**Files:**
- Modify: `apps/saas-app/package.json` (add `oidc-client-ts`)
- Create: `apps/saas-app/src/auth/oidcClient.ts`
- Test: `apps/saas-app/src/auth/__tests__/oidcClient.test.ts`

**Interfaces:**
- Consumes: `getOidcConfig(): OidcConfig | null` (Task 2).
- Produces:
  - `isOidcEnabled(): boolean`
  - `getOidcDisplayName(): string`, which returns `'SSO'` when disabled
  - `startLogin(): Promise<void>`
  - `completeLogin(): Promise<void>`
  - `refreshToken(failedToken?: string): Promise<string>`, matching `TokenRefresher`
  - `type LogoutResult = 'redirecting' | 'local'`
  - `logout(opts?: { clearAll?: boolean }): Promise<LogoutResult>`
  - `clearSession(): Promise<void>`
  - `resetOidcClient(): void`, for tests only

- [ ] **Step 1: Add the dependency**

Run: `pnpm --filter @cyoda/saas-app add oidc-client-ts@^3.5.0`
Expected: `apps/saas-app/package.json` lists `"oidc-client-ts": "^3.5.0"` and the lockfile updates.

- [ ] **Step 2: Write the failing tests**

`apps/saas-app/src/auth/__tests__/oidcClient.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  instances: [] as any[],
  setLevel: vi.fn(),
  setLogger: vi.fn(),
}));

vi.mock('oidc-client-ts', () => {
  class UserManager {
    settings: any;
    getUser = vi.fn();
    removeUser = vi.fn().mockResolvedValue(undefined);
    signinRedirect = vi.fn();
    signinRedirectCallback = vi.fn();
    signinSilent = vi.fn();
    signoutRedirect = vi.fn().mockResolvedValue(undefined);
    metadataService = { getEndSessionEndpoint: vi.fn() };
    constructor(settings: any) {
      this.settings = settings;
      mocks.instances.push(this);
    }
  }
  class WebStorageStateStore {
    constructor(public opts: any) {}
  }
  const Log = { WARN: 2, DEBUG: 4, setLevel: mocks.setLevel, setLogger: mocks.setLogger };
  return { UserManager, WebStorageStateStore, Log };
});

vi.mock('../oidcConfig', () => ({ getOidcConfig: vi.fn() }));

const DEFAULT_CONFIG = {
  issuer: 'http://idp',
  clientId: 'abc',
  displayName: 'Zitadel',
  scopes: 'openid offline_access',
  extraParams: { audience: 'api' },
  logoutUrl: undefined,
};

import { getOidcConfig } from '../oidcConfig';
import {
  isOidcEnabled, getOidcDisplayName, startLogin, completeLogin, refreshToken, logout, clearSession, resetOidcClient,
} from '../oidcClient';

const um = () => mocks.instances[mocks.instances.length - 1];
const user = (overrides: object = {}) => ({
  access_token: 'at-1',
  refresh_token: 'rt-1',
  id_token: 'id-1',
  expired: false,
  profile: { sub: 'sub-1', preferred_username: 'analyst' },
  ...overrides,
});
const auth = () => JSON.parse(localStorage.getItem('cyoda_auth') ?? 'null');

describe('oidcClient', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    mocks.instances.length = 0;
    resetOidcClient();
    // Reset per test: the LOGOUT_URL test overrides the config.
    vi.mocked(getOidcConfig).mockReset().mockReturnValue(DEFAULT_CONFIG);
  });

  it('sets the library log level to WARN', () => {
    expect(mocks.setLevel).toHaveBeenCalledWith(2);
  });

  it('reports enabled state and display name', () => {
    expect(isOidcEnabled()).toBe(true);
    expect(getOidcDisplayName()).toBe('Zitadel');
  });

  it('configures UserManager without extraQueryParams and passes them to signinRedirect', async () => {
    await startLogin();
    const s = um().settings;
    expect(s).toMatchObject({
      authority: 'http://idp',
      client_id: 'abc',
      scope: 'openid offline_access',
      redirect_uri: `${window.location.origin}/oidc/callback`,
      post_logout_redirect_uri: `${window.location.origin}/login`,
      response_type: 'code',
      automaticSilentRenew: false,
    });
    expect(s.extraQueryParams).toBeUndefined();
    expect(s.userStore.opts.store).toBe(window.localStorage);
    expect(s.stateStore.opts.store).toBe(window.sessionStorage);
    expect(um().signinRedirect).toHaveBeenCalledWith({ extraQueryParams: { audience: 'api' } });
  });

  it('completeLogin writes cyoda_auth and shares one callback for repeated calls', async () => {
    await startLogin();
    um().signinRedirectCallback.mockResolvedValue(user());

    await Promise.all([completeLogin(), completeLogin()]);

    expect(um().signinRedirectCallback).toHaveBeenCalledTimes(1);
    expect(auth()).toEqual({ token: 'at-1', refreshToken: '', user: 'analyst', userId: 'sub-1', type: 'oidc' });
  });

  describe('refreshToken', () => {
    beforeEach(async () => {
      await startLogin();
      localStorage.setItem('cyoda_auth', JSON.stringify({ token: 'at-1', user: 'analyst', type: 'oidc' }));
    });

    it('runs the refresh grant and updates the token; concurrent calls share it', async () => {
      um().getUser.mockResolvedValue(user());
      um().signinSilent.mockResolvedValue(user({ access_token: 'at-2', refresh_token: 'rt-2' }));

      const [a, b] = await Promise.all([refreshToken('at-1'), refreshToken('at-1')]);

      expect(a).toBe('at-2');
      expect(b).toBe('at-2');
      expect(um().signinSilent).toHaveBeenCalledTimes(1);
      expect(auth().token).toBe('at-2');
    });

    it('reuses a token another tab already stored, without calling the IdP', async () => {
      um().getUser.mockResolvedValue(user({ access_token: 'at-other-tab', expired: undefined }));

      await expect(refreshToken('at-1')).resolves.toBe('at-other-tab');
      expect(um().signinSilent).not.toHaveBeenCalled();
      expect(auth().token).toBe('at-other-tab');
    });

    it('rejects without signinSilent when there is no refresh token, and clears the session', async () => {
      um().getUser.mockResolvedValue(user({ refresh_token: undefined }));

      await expect(refreshToken('at-1')).rejects.toThrow('No refresh token');
      expect(um().signinSilent).not.toHaveBeenCalled();
      expect(um().removeUser).toHaveBeenCalled();
      expect(auth()).toBeNull();
    });

    it('treats a null signinSilent result as a failure', async () => {
      um().getUser.mockResolvedValue(user());
      um().signinSilent.mockResolvedValue(null);

      await expect(refreshToken('at-1')).rejects.toThrow();
      expect(auth()).toBeNull();
    });

    it('adopts tokens rotated by another tab when its own refresh fails', async () => {
      um().getUser
        .mockResolvedValueOnce(user())
        .mockResolvedValueOnce(user({ access_token: 'at-winner', refresh_token: 'rt-winner' }));
      um().signinSilent.mockRejectedValue(new Error('invalid_grant'));

      await expect(refreshToken('at-1')).resolves.toBe('at-winner');
      expect(um().removeUser).not.toHaveBeenCalled();
      expect(auth().token).toBe('at-winner');
    });

    it('clears and rejects when the refresh fails and nothing changed', async () => {
      um().getUser.mockResolvedValue(user());
      um().signinSilent.mockRejectedValue(new Error('invalid_grant'));

      await expect(refreshToken('at-1')).rejects.toThrow('invalid_grant');
      expect(um().removeUser).toHaveBeenCalled();
      expect(auth()).toBeNull();
    });
  });

  describe('logout', () => {
    beforeEach(async () => {
      await startLogin();
      localStorage.setItem('cyoda_auth', JSON.stringify({ token: 'at-1', user: 'analyst', type: 'oidc' }));
      vi.spyOn(window.location, 'assign').mockImplementation(() => {});
    });

    it('reads id_token before clearing, then redirects to end-session without awaiting', async () => {
      const order: string[] = [];
      um().getUser.mockImplementation(async () => { order.push('getUser'); return user(); });
      um().removeUser.mockImplementation(async () => { order.push('removeUser'); });
      um().metadataService.getEndSessionEndpoint.mockResolvedValue('http://idp/end');
      um().signoutRedirect.mockReturnValue(new Promise(() => {})); // never settles, like a real redirect

      await expect(logout()).resolves.toBe('redirecting');
      expect(order).toEqual(['getUser', 'removeUser']);
      expect(um().signoutRedirect).toHaveBeenCalledWith({ id_token_hint: 'id-1' });
      expect(auth()).toBeNull();
    });

    it('falls back to /login when signoutRedirect rejects later', async () => {
      um().getUser.mockResolvedValue(user());
      um().metadataService.getEndSessionEndpoint.mockResolvedValue('http://idp/end');
      um().signoutRedirect.mockRejectedValue(new Error('boom'));

      await expect(logout()).resolves.toBe('redirecting');
      await vi.waitFor(() => expect(window.location.assign).toHaveBeenCalledWith('/login'));
    });

    it('uses LOGOUT_URL when there is no end-session endpoint', async () => {
      vi.mocked(getOidcConfig).mockReturnValue({
        issuer: 'http://idp', clientId: 'abc', displayName: 'Auth0', scopes: 's', extraParams: {},
        logoutUrl: 'http://idp/v2/logout',
      });
      resetOidcClient();
      await startLogin();
      um().getUser.mockResolvedValue(user());
      um().metadataService.getEndSessionEndpoint.mockResolvedValue(undefined);

      await expect(logout()).resolves.toBe('redirecting');
      expect(window.location.assign).toHaveBeenCalledWith('http://idp/v2/logout');
      expect(um().signoutRedirect).not.toHaveBeenCalled();
    });

    it('is local when discovery fails and no LOGOUT_URL is set', async () => {
      um().getUser.mockResolvedValue(user());
      um().metadataService.getEndSessionEndpoint.mockRejectedValue(new Error('offline'));

      await expect(logout()).resolves.toBe('local');
      expect(window.location.assign).not.toHaveBeenCalled();
    });

    it('clearAll wipes all storage after reading the id_token', async () => {
      um().getUser.mockResolvedValue(user());
      um().metadataService.getEndSessionEndpoint.mockResolvedValue(undefined);
      localStorage.setItem('cyoda_other', '1');
      localStorage.setItem('unrelated', '1');

      await expect(logout({ clearAll: true })).resolves.toBe('local');
      expect(localStorage.length).toBe(0);
    });
  });

  it('clearSession removes the stored user and cyoda_auth', async () => {
    await startLogin();
    localStorage.setItem('cyoda_auth', '{"token":"t"}');
    await clearSession();
    expect(um().removeUser).toHaveBeenCalled();
    expect(auth()).toBeNull();
  });
});
```

Note: if `vi.spyOn(window.location, 'assign')` throws in this jsdom version ("Cannot redefine property"), replace it in `beforeEach` with `Object.defineProperty(window, 'location', { value: { ...window.location, origin: window.location.origin, assign: vi.fn() }, writable: true })` and restore the original in `afterEach`.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm exec vitest run apps/saas-app/src/auth/__tests__/oidcClient.test.ts`
Expected: FAIL, `Failed to resolve import "../oidcClient"`.

- [ ] **Step 4: Implement `oidcClient.ts`**

`apps/saas-app/src/auth/oidcClient.ts`:

```ts
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm exec vitest run apps/saas-app/src/auth/__tests__/oidcClient.test.ts`
Expected: PASS (16 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/saas-app/package.json pnpm-lock.yaml apps/saas-app/src/auth/oidcClient.ts apps/saas-app/src/auth/__tests__/oidcClient.test.ts
git commit -m "feat(saas-app): oidc-client-ts based OIDC client

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Callback page, route and login page

**Files:**
- Create: `apps/saas-app/src/auth/OidcCallback.tsx`
- Modify: `apps/saas-app/src/routes/index.tsx:42-55` (import + route)
- Modify: `apps/saas-app/src/pages/Login.tsx` (full rewrite below)
- Modify: `apps/saas-app/src/pages/Login.scss:360,423` (comment wording only)
- Test: `apps/saas-app/src/auth/__tests__/OidcCallback.test.tsx`
- Test: `apps/saas-app/src/pages/__tests__/Login.test.tsx`

**Interfaces:**
- Consumes:
  - `completeLogin()`, `startLogin()`, `isOidcEnabled()` and `getOidcDisplayName()` (Task 3)
  - `isValidSession()` (Task 2)
  - `getDefaultRoute()` (Task 2)
- Produces:
  - `OidcCallback: React.FC`, a named export
  - `/oidc/callback` route

- [ ] **Step 1: Write the failing tests**

`apps/saas-app/src/auth/__tests__/OidcCallback.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../oidcClient', () => ({ completeLogin: vi.fn() }));
vi.mock('../session', () => ({ isValidSession: vi.fn(() => false) }));
vi.mock('../../utils/defaultRoute', () => ({ getDefaultRoute: () => '/workflows' }));

import { completeLogin } from '../oidcClient';
import { isValidSession } from '../session';
import { OidcCallback } from '../OidcCallback';

function renderAt(search: string) {
  window.history.pushState({}, '', `/oidc/callback${search}`);
  return render(
    <MemoryRouter initialEntries={[`/oidc/callback${search}`]}>
      <Routes>
        <Route path="/oidc/callback" element={<OidcCallback />} />
        <Route path="/workflows" element={<div>workflows page</div>} />
        <Route path="/login" element={<div>login page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('OidcCallback', () => {
  beforeEach(() => {
    vi.mocked(completeLogin).mockReset();
    vi.mocked(isValidSession).mockReturnValue(false);
  });

  it('completes the login and navigates to the default route', async () => {
    vi.mocked(completeLogin).mockResolvedValue();
    renderAt('?code=c&state=s');
    expect(await screen.findByText('workflows page')).toBeInTheDocument();
    expect(completeLogin).toHaveBeenCalled();
  });

  it('shows the error with a way back to login', async () => {
    vi.mocked(completeLogin).mockRejectedValue(new Error('No matching state found in storage'));
    renderAt('?code=c&state=s');
    expect(await screen.findByText('No matching state found in storage')).toBeInTheDocument();
    screen.getByRole('button', { name: 'Back to login' }).click();
    expect(await screen.findByText('login page')).toBeInTheDocument();
  });

  it('reload after login: no code in URL and a valid session navigates without completeLogin', async () => {
    vi.mocked(isValidSession).mockReturnValue(true);
    renderAt('');
    expect(await screen.findByText('workflows page')).toBeInTheDocument();
    await waitFor(() => expect(completeLogin).not.toHaveBeenCalled());
  });
});
```

`apps/saas-app/src/pages/__tests__/Login.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { App } from 'antd';
import { HelperFeatureFlags } from '@cyoda/http-api-react';

vi.mock('../../auth/oidcClient', () => ({
  isOidcEnabled: vi.fn(() => true),
  getOidcDisplayName: vi.fn(() => 'Zitadel'),
  startLogin: vi.fn(),
}));

import { isOidcEnabled, startLogin } from '../../auth/oidcClient';
import Login from '../Login';

function renderLogin(search = '') {
  return render(
    <App>
      <MemoryRouter initialEntries={[`/login${search}`]}>
        <Login />
      </MemoryRouter>
    </App>,
  );
}

describe('Login page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(isOidcEnabled).mockReturnValue(true);
    vi.mocked(startLogin).mockReset();
  });

  it('Cloud mode with OIDC: password form, divider and OIDC button', () => {
    vi.spyOn(HelperFeatureFlags, 'isCyodaGo').mockReturnValue(false);
    renderLogin();
    expect(screen.getByPlaceholderText('Username')).toBeInTheDocument();
    expect(screen.getByText('OR')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Login with Zitadel' })).toBeInTheDocument();
  });

  it('Go mode with OIDC: only the OIDC button', () => {
    vi.spyOn(HelperFeatureFlags, 'isCyodaGo').mockReturnValue(true);
    renderLogin();
    expect(screen.queryByPlaceholderText('Username')).not.toBeInTheDocument();
    expect(screen.queryByText('OR')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Login with Zitadel' })).toBeInTheDocument();
  });

  it('Cloud mode without OIDC: only the password form', () => {
    vi.spyOn(HelperFeatureFlags, 'isCyodaGo').mockReturnValue(false);
    vi.mocked(isOidcEnabled).mockReturnValue(false);
    renderLogin();
    expect(screen.getByPlaceholderText('Username')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Login with/ })).not.toBeInTheDocument();
  });

  it('Go mode without OIDC: explains that OIDC must be configured', () => {
    vi.spyOn(HelperFeatureFlags, 'isCyodaGo').mockReturnValue(true);
    vi.mocked(isOidcEnabled).mockReturnValue(false);
    renderLogin();
    expect(screen.getByText(/VITE_APP_OIDC_\*/)).toBeInTheDocument();
  });

  it('shows the expired notice', () => {
    renderLogin('?reason=expired');
    expect(screen.getByText('Your session expired. Please log in again.')).toBeInTheDocument();
  });

  it('shows the rejected notice', () => {
    renderLogin('?reason=rejected');
    expect(
      screen.getByText('The server rejected your credentials. If this persists, check that the backend trusts this identity provider.'),
    ).toBeInTheDocument();
  });

  it('starts the OIDC login and shows the real error when it fails', async () => {
    vi.spyOn(HelperFeatureFlags, 'isCyodaGo').mockReturnValue(true);
    vi.mocked(startLogin).mockRejectedValue(new Error('Crypto.subtle is available only in secure contexts'));
    renderLogin();
    await userEvent.click(screen.getByRole('button', { name: 'Login with Zitadel' }));
    expect(startLogin).toHaveBeenCalled();
    expect(
      await screen.findByText('Login with Zitadel failed: Crypto.subtle is available only in secure contexts'),
    ).toBeInTheDocument();
  });

  it('clears the OIDC button loading state on pageshow (bfcache restore)', async () => {
    vi.spyOn(HelperFeatureFlags, 'isCyodaGo').mockReturnValue(true);
    vi.mocked(startLogin).mockReturnValue(new Promise(() => {}));
    renderLogin();
    const button = screen.getByRole('button', { name: 'Login with Zitadel' });
    await userEvent.click(button);
    await waitFor(() => expect(button.className).toContain('ant-btn-loading'));
    window.dispatchEvent(new Event('pageshow'));
    await waitFor(() => expect(button.className).not.toContain('ant-btn-loading'));
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm exec vitest run apps/saas-app/src/auth/__tests__/OidcCallback.test.tsx apps/saas-app/src/pages/__tests__/Login.test.tsx`
Expected: FAIL. `../OidcCallback` can't be resolved, and the Login tests fail on the missing OIDC button or on `useAuth0` outside a provider.

- [ ] **Step 3: Implement the callback page**

`apps/saas-app/src/auth/OidcCallback.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Result, Spin } from 'antd';
import { completeLogin } from './oidcClient';
import { isValidSession } from './session';
import { getDefaultRoute } from '../utils/defaultRoute';

/**
 * /oidc/callback: finishes the Authorization Code + PKCE exchange.
 */
export const OidcCallback: React.FC = () => {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    const isCallback = params.has('code') || params.has('error');

    // Reload after a successful login: the state was already consumed.
    if (!isCallback && isValidSession()) {
      navigate(getDefaultRoute(), { replace: true });
      return;
    }

    completeLogin()
      .then(() => {
        if (!cancelled) navigate(getDefaultRoute(), { replace: true });
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (error) {
    return (
      <Result
        status="error"
        title="Sign-in failed"
        subTitle={error}
        extra={
          <Button type="primary" onClick={() => navigate('/login', { replace: true })}>
            Back to login
          </Button>
        }
      />
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <Spin size="large" />
    </div>
  );
};
```

In `apps/saas-app/src/routes/index.tsx`, after `import Login from '../pages/Login';` add:

```tsx
import { OidcCallback } from '../auth/OidcCallback';
```

and after `<Route path="/login" element={<Login />} />` add:

```tsx
      <Route path="/oidc/callback" element={<OidcCallback />} />
```

- [ ] **Step 4: Rewrite the login page**

Replace `apps/saas-app/src/pages/Login.tsx` entirely with:

```tsx
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Form, Input, Button, Card, App, Divider, Alert } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { login, HelperStorage, HelperFeatureFlags } from '@cyoda/http-api-react';
import { isOidcEnabled, getOidcDisplayName, startLogin } from '../auth/oidcClient';
import { getDefaultRoute } from '../utils/defaultRoute';
import './Login.scss';

const helperStorage = new HelperStorage();

const REASON_NOTICES: Record<string, { type: 'info' | 'warning'; text: string }> = {
  expired: { type: 'info', text: 'Your session expired. Please log in again.' },
  rejected: {
    type: 'warning',
    text: 'The server rejected your credentials. If this persists, check that the backend trusts this identity provider.',
  },
};

interface LoginFormValues {
  username: string;
  password: string;
}

const Login: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [oidcLoading, setOidcLoading] = useState(false);
  const { message } = App.useApp();

  const showPasswordForm = !HelperFeatureFlags.isCyodaGo();
  const showOidc = isOidcEnabled();
  const displayName = getOidcDisplayName();
  const notice = REASON_NOTICES[searchParams.get('reason') ?? ''];

  // A back-forward-cache restore after starting the redirect must not leave the button spinning.
  useEffect(() => {
    const reset = () => setOidcLoading(false);
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);

  // Standard username/password login
  const onFinish = async (values: LoginFormValues) => {
    setLoading(true);
    try {
      const response = await login(values.username, values.password);
      const authData = response.data;

      helperStorage.set('auth', {
        token: authData.token,
        refreshToken: authData.refreshToken,
        user: authData.username,
        userId: authData.userId,
        legalEntityId: authData.legalEntityId,
        type: 'standard'
      });

      navigate(getDefaultRoute());
    } catch (error: any) {
      console.error('Login error:', error);
      const errorMessage = error?.response?.data?.message || 'Login failed. Please check your credentials.';
      message.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleOidcLogin = () => {
    setOidcLoading(true);
    startLogin()
      .catch((err: unknown) => {
        const reason = err instanceof Error ? err.message : String(err);
        message.error(`Login with ${displayName} failed: ${reason}`);
      })
      .finally(() => setOidcLoading(false));
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <div className="logo-container">
            <img
              src="/assets/images/cyoda-logo-green.svg"
              alt="CYODA"
              className="logo"
            />
          </div>
        </div>

        <Card className="login-card" variant="borderless">
          {notice && (
            <Alert type={notice.type} message={notice.text} showIcon style={{ marginBottom: 24 }} />
          )}

          {!showPasswordForm && !showOidc && (
            <Alert
              type="error"
              showIcon
              message="No login method is configured"
              description="This build runs against cyoda-go, which needs OIDC login. Set VITE_APP_OIDC_* (see ENV_FILES_GUIDE.md)."
            />
          )}

          {showPasswordForm && (
            <Form
              name="login"
              onFinish={onFinish}
              autoComplete="off"
              layout="vertical"
            >
              <Form.Item
                name="username"
                rules={[{ required: true, message: 'Please input your username!' }]}
              >
                <Input
                  prefix={<UserOutlined />}
                  placeholder="Username"
                  size="large"
                />
              </Form.Item>

              <Form.Item
                name="password"
                rules={[{ required: true, message: 'Please input your password!' }]}
              >
                <Input.Password
                  prefix={<LockOutlined />}
                  placeholder="Password"
                  size="large"
                />
              </Form.Item>

              <Form.Item>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={loading}
                  size="large"
                  block
                >
                  Log in
                </Button>
              </Form.Item>
            </Form>
          )}

          {showPasswordForm && showOidc && (
            <Divider style={{ margin: '24px 0' }}>
              <span style={{ fontSize: '13px' }}>OR</span>
            </Divider>
          )}

          {showOidc && (
            <Button
              type="default"
              size="large"
              block
              loading={oidcLoading}
              onClick={handleOidcLogin}
            >
              Login with {displayName}
            </Button>
          )}
        </Card>

        <div className="login-footer">
          <p>&copy; {new Date().getFullYear()} Cyoda. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
```

In `apps/saas-app/src/pages/Login.scss`, change both `// Auth0 button` comments (lines 360 and 423) to `// SSO (OIDC) button`. The `.ant-btn-default` selector is already generic, so the styles stay as they are.

Before running the tests, check the scss nesting: the OIDC button used to sit inside `<Form>` and is now a sibling of it under `.login-card`. Run `sed -n 300,440p apps/saas-app/src/pages/Login.scss`. If the `.ant-btn-default` and `.ant-divider` rules are nested under a `form`/`.ant-form` selector, move those two rule blocks up one level so they sit directly under `.login-card`, in both the dark and the light block.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm exec vitest run apps/saas-app/src/auth/__tests__/OidcCallback.test.tsx apps/saas-app/src/pages/__tests__/Login.test.tsx`
Expected: PASS (3 + 8 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/saas-app/src/auth/OidcCallback.tsx apps/saas-app/src/auth/__tests__/OidcCallback.test.tsx apps/saas-app/src/pages apps/saas-app/src/routes/index.tsx
git commit -m "feat(saas-app): OIDC callback route and generic login page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: App wiring, route guard, logout, and removal of Auth0/Refine code

**Files:**
- Modify: `apps/saas-app/src/App.tsx` (imports lines 6-10; `App` function lines 300-321)
- Modify: `apps/saas-app/src/main.tsx`
- Modify: `apps/saas-app/src/components/AppLayout.tsx`
- Modify: `apps/saas-app/src/components/LeftSideMenu.tsx:23-63`
- Modify: `apps/saas-app/src/components/__tests__/LeftSideMenu.test.tsx` (storage mock + new tests)
- Modify: `apps/saas-app/src/cobi-react.d.ts:13-24` (drop the `@refinedev` stubs)
- Delete:
  - `apps/saas-app/src/config/auth0.ts`
  - `apps/saas-app/src/components/Auth0TokenInitializer.tsx`
  - `apps/saas-app/src/utils/auth0TokenManager.ts`
  - `apps/saas-app/src/providers/authProvider.ts`
  - `apps/saas-app/src/providers/dataProvider.ts`
  - `apps/saas-app/src/components/RefineLayout.tsx`
  - `apps/saas-app/src/components/RefineLayout.scss`
- Modify: `apps/saas-app/package.json` and root `package.json` (remove `@auth0/auth0-react`)
- Test: `apps/saas-app/src/components/__tests__/AppLayout.test.tsx`

**Interfaces:**
- Consumes:
  - `registerTokenRefresher` (Task 1)
  - `isValidSession()` and `purgeLegacyAuth0Cache()` (Task 2)
  - `isOidcEnabled()`, `refreshToken`, `clearSession` and `logout(opts): Promise<LogoutResult>` (Task 3)

- [ ] **Step 1: Write the failing tests**

`apps/saas-app/src/components/__tests__/AppLayout.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('@cyoda/cyoda-sass-react', () => ({
  useAppStore: (selector: (s: any) => unknown) => selector({ isToggledMenu: false, toggleMenu: () => {} }),
}));
vi.mock('../AppHeader', () => ({ AppHeader: () => <div>header</div> }));
vi.mock('../LeftSideMenu', () => ({ LeftSideMenu: () => <div>menu</div> }));

import { AppLayout } from '../AppLayout';

const child = vi.fn(() => <div>protected child</div>);
const Child = () => child();

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/workflows']}>
      <Routes>
        <Route path="/login" element={<div>login page</div>} />
        <Route path="/" element={<AppLayout />}>
          <Route path="workflows" element={<Child />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('AppLayout guard', () => {
  beforeEach(() => {
    localStorage.clear();
    child.mockClear();
  });

  it('redirects to /login without a session and never renders the outlet', () => {
    renderApp();
    expect(screen.getByText('login page')).toBeInTheDocument();
    expect(child).not.toHaveBeenCalled();
  });

  it('redirects a legacy auth0 session to /login', () => {
    localStorage.setItem('cyoda_auth', JSON.stringify({ token: 't', user: 'u', type: 'auth0' }));
    renderApp();
    expect(screen.getByText('login page')).toBeInTheDocument();
    expect(child).not.toHaveBeenCalled();
  });

  it('renders the layout and outlet for a valid session', () => {
    localStorage.setItem('cyoda_auth', JSON.stringify({ token: 't', user: 'u', type: 'oidc' }));
    renderApp();
    expect(screen.getByText('protected child')).toBeInTheDocument();
  });
});
```

In `apps/saas-app/src/components/__tests__/LeftSideMenu.test.tsx`:

1. Replace the storage mock (lines 11-16) with:

```tsx
const storageMock = vi.hoisted(() => ({
  get: vi.fn(() => null as any),
  remove: vi.fn(),
  clear: vi.fn(),
}));

// Mock the storage helper
vi.mock('@cyoda/http-api-react/utils/storage', () => ({
  HelperStorage: vi.fn().mockImplementation(() => storageMock),
}));

const oidcMock = vi.hoisted(() => ({
  isOidcEnabled: vi.fn(() => false),
  logout: vi.fn(async () => 'local' as const),
}));
vi.mock('../../auth/oidcClient', () => oidcMock);
```

2. Append this `describe` block inside the top-level `describe('LeftSideMenu', ...)`. The confirm-dialog buttons are labelled `Logout` and `Logout and Clear Data` (`LeftSideMenu.tsx:486-491`). The existing `Logout Modal` tests (line 307) open the dialog the same way.

```tsx
  describe('OIDC logout', () => {
    beforeEach(() => {
      oidcMock.isOidcEnabled.mockReturnValue(true);
      oidcMock.logout.mockReset();
      storageMock.get.mockReturnValue({ token: 't', user: 'u', type: 'oidc' });
    });

    async function openLogoutModal() {
      const user = userEvent.setup();
      renderWithRouter(<LeftSideMenu collapsed={false} onCollapse={mockOnCollapse} />);
      await user.click(screen.getByText('Logout'));
      await screen.findByText('Do you really want to logout?');
      return user;
    }

    it('Logout calls oidc logout without clearAll', async () => {
      oidcMock.logout.mockResolvedValue('redirecting');
      const user = await openLogoutModal();
      await user.click(screen.getByRole('button', { name: /^Logout$/ }));
      await waitFor(() => expect(oidcMock.logout).toHaveBeenCalledWith());
      expect(storageMock.remove).not.toHaveBeenCalled();
    });

    it('Logout and clear calls oidc logout with clearAll', async () => {
      oidcMock.logout.mockResolvedValue('local');
      const user = await openLogoutModal();
      await user.click(screen.getByRole('button', { name: /Logout and Clear Data/ }));
      await waitFor(() => expect(oidcMock.logout).toHaveBeenCalledWith({ clearAll: true }));
    });
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm exec vitest run apps/saas-app/src/components/__tests__/AppLayout.test.tsx apps/saas-app/src/components/__tests__/LeftSideMenu.test.tsx`
Expected: FAIL. The AppLayout guard tests render `protected child`, because today's `useEffect` guard runs after the children. The OIDC logout tests fail because `logout` isn't called.

- [ ] **Step 3: Implement the guard**

Replace `apps/saas-app/src/components/AppLayout.tsx` lines 1-28 (imports through the end of the `useEffect`) with:

```tsx
import React from 'react';
import { Layout } from 'antd';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { AppHeader } from './AppHeader';
import { LeftSideMenu } from './LeftSideMenu';
import { useAppStore } from '@cyoda/cyoda-sass-react';
import { isValidSession } from '../auth/session';
import './AppLayout.scss';

const { Content } = Layout;

export const AppLayout: React.FC = () => {
  // Use persisted store for menu collapse state
  const isToggledMenu = useAppStore((state) => state.isToggledMenu);
  const toggleMenu = useAppStore((state) => state.toggleMenu);
  // Subscribe to navigation so the guard re-runs on every route change.
  useLocation();

  // Synchronous guard: never render children (and their API calls) without a session.
  if (!isValidSession()) {
    return <Navigate to="/login" replace />;
  }
```

Leave the rest of the component (the `return (<Layout ...>` block) unchanged.

- [ ] **Step 4: Implement the OIDC-aware logout**

In `apps/saas-app/src/components/LeftSideMenu.tsx`, add after the `useThemeStore` import:

```tsx
import { isOidcEnabled, logout as oidcLogout } from '../auth/oidcClient';
```

Replace `handleLogout` and `handleLogoutAndClear` with:

```tsx
  const isOidcSession = () => isOidcEnabled() && helperStorage.get('auth')?.type === 'oidc';

  const handleLogout = async () => {
    setLogoutModalVisible(false);
    if (isOidcSession()) {
      if ((await oidcLogout()) === 'local') navigate('/login');
      return;
    }
    // Logout without clearing data
    helperStorage.remove('auth');
    navigate('/login');
  };

  const handleLogoutAndClear = async () => {
    setLogoutModalVisible(false);
    if (isOidcSession()) {
      // oidcLogout reads the id_token first, then clears all storage.
      if ((await oidcLogout({ clearAll: true })) === 'local') navigate('/login');
      return;
    }
    // Logout and clear all data
    helperStorage.clear();
    localStorage.clear(); // Also clear non-prefixed items
    navigate('/login');
  };
```

- [ ] **Step 5: Wire App and main, delete Auth0 and Refine code**

In `apps/saas-app/src/App.tsx`, delete these imports: `Auth0Provider`, `auth0Config` and `Auth0TokenInitializer`. Replace the doc comment and the `App` function with:

```tsx
/**
 * Main App Component
 *
 * OIDC login is handled by src/auth (oidc-client-ts singleton + /oidc/callback
 * route); no provider component is needed at the top level.
 */
function App() {
  return (
    <ErrorBoundary>
      <ThemedApp />
    </ErrorBoundary>
  );
}
```

Replace `apps/saas-app/src/main.tsx` with:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerTokenRefresher } from '@cyoda/http-api-react';
import App from './App';
import { isOidcEnabled, refreshToken, clearSession } from './auth/oidcClient';
import { purgeLegacyAuth0Cache } from './auth/session';
import 'antd/dist/reset.css';
import './main.scss';


// CRITICAL: Import fixed columns override LAST to ensure maximum specificity
import './fixed-columns-override.css';

// The old @auth0/auth0-react cache holds refresh tokens; drop it.
purgeLegacyAuth0Cache();

if (isOidcEnabled()) {
  registerTokenRefresher('oidc', refreshToken, { clearSession });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

Delete the dead files and the dependency:

```bash
git rm apps/saas-app/src/config/auth0.ts \
  apps/saas-app/src/components/Auth0TokenInitializer.tsx \
  apps/saas-app/src/utils/auth0TokenManager.ts \
  apps/saas-app/src/providers/authProvider.ts \
  apps/saas-app/src/providers/dataProvider.ts \
  apps/saas-app/src/components/RefineLayout.tsx \
  apps/saas-app/src/components/RefineLayout.scss
pnpm --filter @cyoda/saas-app remove @auth0/auth0-react
pnpm remove -w @auth0/auth0-react
```

In `apps/saas-app/src/cobi-react.d.ts`, delete the `@refinedev/core` and `@refinedev/antd` `declare module` blocks and the comment above them. Update that comment so it only mentions `@cyoda/ui`: `// @cyoda/ui is referenced by a few saas-app views but not installed at the workspace level — stub so tsc doesn't fail on the import.`

Confirm nothing still refers to the removed code:

Run: `grep -rnE "auth0|Auth0|refinedev|RefineLayout|authProvider|dataProvider" apps/saas-app/src`
Expected: matches only in `auth/session.ts` (the legacy `'auth0'` type and `@@auth0spajs@@` purge) and in the tests that exercise them.

- [ ] **Step 6: Run the tests, type-check and lint**

Run: `pnpm exec vitest run apps/saas-app/src/components/__tests__/AppLayout.test.tsx apps/saas-app/src/components/__tests__/LeftSideMenu.test.tsx apps/saas-app/src/auth apps/saas-app/src/pages apps/saas-app/src/utils/__tests__`
Expected: PASS (all).

Run: `pnpm --filter @cyoda/saas-app type-check && pnpm exec eslint apps/saas-app/src`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add -A apps/saas-app package.json pnpm-lock.yaml
git commit -m "feat(saas-app): wire OIDC, synchronous route guard, remove Auth0 and dead Refine code

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Remove the Auth0 button from `@cyoda/ui-lib-react`

**Files:**
- Delete: `packages/ui-lib-react/src/components/LoginAuth0Btn/` (whole directory)
- Modify: `packages/ui-lib-react/src/components/index.ts:9`
- Modify: `packages/ui-lib-react/src/components/Login/Login.tsx`
- Modify: `packages/ui-lib-react/src/components/Login/Login.scss:28-34`
- Modify: `packages/ui-lib-react/src/components/Login/Login.test.tsx:119-132`

- [ ] **Step 1: Update the test first**

In `packages/ui-lib-react/src/components/Login/Login.test.tsx`, delete the two tests `renders Auth0 button when showAuth0Button is true` and `does not render Auth0 button by default` (lines 119-132).

- [ ] **Step 2: Remove the props, markup, styles and component**

In `packages/ui-lib-react/src/components/Login/Login.tsx`:
- From `LoginProps`, delete `showAuth0Button?: boolean` and `auth0ButtonComponent?: React.ReactNode`.
- Change the destructuring to `({ onLogin, loading: externalLoading })`.
- Delete the `{showAuth0Button && auth0ButtonComponent && (...)}` block.

In `Login.scss`, delete the `.auth0-button-wrapper { ... }` block inside `.actions`.

Run:

```bash
git rm -r packages/ui-lib-react/src/components/LoginAuth0Btn
```

In `packages/ui-lib-react/src/components/index.ts`, delete line 9: `export * from './LoginAuth0Btn'`.

- [ ] **Step 3: Verify**

Run: `pnpm exec vitest run packages/ui-lib-react/src/components/Login`
Expected: PASS (the remaining Login tests).

Run: `grep -rn "Auth0\|auth0" packages/ui-lib-react/src; pnpm --filter @cyoda/ui-lib-react type-check`
Expected: grep prints nothing; type-check shows no errors.

- [ ] **Step 4: Commit**

```bash
git add -A packages/ui-lib-react
git commit -m "refactor(ui-lib-react): remove unused Auth0 login button

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Env templates, CLI setup, docs and tooling migration

**Files:**
- Modify: `.env.template:61-79`
- Modify: `apps/saas-app/.env.template:15-18,54-70`
- Modify: `packages/cli/commands/setup.mjs:129-200`
- Modify: `packages/cli/README.md:15,66-70,101-105`
- Modify: `README.md:166-171,202`
- Modify: `apps/saas-app/README.md:97-98,124-140,197,277,283,364-366`
- Modify: `.devcontainer/README.md:46-49,70-81,127-129`
- Modify: `.devcontainer/devcontainer.json:7-9,21`
- Modify: `ENV_FILES_GUIDE.md:72-74,142` (and add an OIDC section)
- Modify: `PORTS.md:50` (and add a 5180 note)
- Modify: `tools/backend-mock-server/server.mjs:58-71`
- Modify: `apps/saas-app/test-backend-connection.sh:70-74`

This task is documentation and tooling only; nothing here has unit tests. Open each file at the listed lines before editing, and keep the surrounding tone and format.

- [ ] **Step 1: Env templates**

In the root `.env.template`, replace the whole `# Auth0 Configuration` section (the header through `# VITE_APP_AUTH0_ORGANIZATION=`) with:

```bash
# ============================================================================
# OIDC Login (optional; one provider per build)
# ============================================================================
# Shows a "Login with {DISPLAY_NAME}" button when ISSUER and CLIENT_ID are set.
# Redirect URI to register at the IdP: {origin}/oidc/callback
# Post-logout URI to register at the IdP: {origin}/login

# VITE_APP_OIDC_DISPLAY_NAME=SSO
# VITE_APP_OIDC_ISSUER=
# VITE_APP_OIDC_CLIENT_ID=
# VITE_APP_OIDC_SCOPES=openid profile email offline_access
# VITE_APP_OIDC_EXTRA_PARAMS=
# VITE_APP_OIDC_LOGOUT_URL=
```

In `apps/saas-app/.env.template`:

- In the comment at lines 15-18, change "SPA-style identifiers like an Auth0 client ID, audience, or organization ID are NOT secrets — Auth0 designs them to be public and the SPA login flow's security comes from…" to "SPA-style identifiers like an OIDC client ID, audience, or organization ID are NOT secrets — public (PKCE) clients are designed that way and the login flow's security comes from…". Keep the rest of the sentence.
- Replace the `# Auth0 Configuration` section (lines 54-70) with:

```bash
# ============================================================================
# OIDC Login (one provider per build)
# ============================================================================
#
# These values are NOT secrets — public (PKCE) client IDs, audiences and
# organization IDs are designed to be public (security comes from the
# registered redirect URIs and PKCE). Put real values in your gitignored
# apps/saas-app/.env, never here.
#
# Register at the IdP:
#   redirect URI      {origin}/oidc/callback
#   post-logout URI   {origin}/login
#   web origin (CORS) {origin}
#
# Cyoda Cloud (Auth0):
VITE_APP_OIDC_DISPLAY_NAME=Auth0
VITE_APP_OIDC_ISSUER=https://auth.cyoda.net/
VITE_APP_OIDC_CLIENT_ID=<your-auth0-spa-client-id>
VITE_APP_OIDC_EXTRA_PARAMS=audience=https://cloud.cyoda.com/api&organization=<your-auth0-org-id>
VITE_APP_OIDC_LOGOUT_URL=https://auth.cyoda.net/v2/logout?client_id=<your-auth0-spa-client-id>&returnTo=http%3A%2F%2Flocalhost%3A5173%2Flogin
# VITE_APP_OIDC_SCOPES=openid profile email offline_access
#
# ctcc Zitadel + cyoda-go: run scripts/zitadel/create-dashboard-oidc-app.sh and
# paste its output into apps/saas-app/.env.development.local instead.
```

- [ ] **Step 2: CLI setup prompts**

In `packages/cli/commands/setup.mjs`, replace the prompt objects from `name: "confirmAuth0"` through the `VITE_APP_AUTH0_REDIRECT_URI` prompt with:

```js
      {
        type: "confirm",
        message: "Do you want to set OIDC login settings?",
        name: "confirmOidc"
      },
      {
        type: "input",
        message: "OIDC: Button display name (e.g. Auth0, Zitadel)",
        name: "VITE_APP_OIDC_DISPLAY_NAME",
        default: () => envExist.VITE_APP_OIDC_DISPLAY_NAME || 'SSO',
        when: (answers) => answers.confirmOidc,
      },
      {
        type: "input",
        message: "OIDC: Issuer URL (exactly as in the provider's discovery document)",
        name: "VITE_APP_OIDC_ISSUER",
        default: () => envExist.VITE_APP_OIDC_ISSUER || null,
        when: (answers) => answers.confirmOidc,
      },
      {
        type: "input",
        message: "OIDC: Client ID (public client, PKCE)",
        name: "VITE_APP_OIDC_CLIENT_ID",
        default: () => envExist.VITE_APP_OIDC_CLIENT_ID || null,
        when: (answers) => answers.confirmOidc,
      },
      {
        type: "input",
        message: "OIDC: Scopes",
        name: "VITE_APP_OIDC_SCOPES",
        default: () => envExist.VITE_APP_OIDC_SCOPES || 'openid profile email offline_access',
        when: (answers) => answers.confirmOidc,
      },
      {
        type: "input",
        message: "OIDC: Extra authorize params (query string, e.g. audience=...&organization=...)",
        name: "VITE_APP_OIDC_EXTRA_PARAMS",
        default: () => envExist.VITE_APP_OIDC_EXTRA_PARAMS || '',
        when: (answers) => answers.confirmOidc,
      },
      {
        type: "input",
        message: "OIDC: Logout URL (only if the provider has no end_session_endpoint)",
        name: "VITE_APP_OIDC_LOGOUT_URL",
        default: () => envExist.VITE_APP_OIDC_LOGOUT_URL || '',
        when: (answers) => answers.confirmOidc,
      },
```

Replace the `if (inquirerResult.confirmAuth0) { ... }` block with:

```js
    if (inquirerResult.confirmOidc) {
      for (const key of [
        'VITE_APP_OIDC_DISPLAY_NAME',
        'VITE_APP_OIDC_ISSUER',
        'VITE_APP_OIDC_CLIENT_ID',
        'VITE_APP_OIDC_SCOPES',
        'VITE_APP_OIDC_EXTRA_PARAMS',
        'VITE_APP_OIDC_LOGOUT_URL',
      ]) {
        if (inquirerResult[key]) env[key] = inquirerResult[key];
      }
    }
```

Run: `node --check packages/cli/commands/setup.mjs`
Expected: no output (valid syntax).

- [ ] **Step 3: Docs**

- **`packages/cli/README.md`:**
  - Line 15 becomes `- ✅ OIDC login setup (Auth0, Zitadel, any OIDC provider)`.
  - Rename section 5 to `**OIDC Login Configuration** (optional)` and list the six `VITE_APP_OIDC_*` prompts.
  - Replace lines 101-105 with the six `VITE_APP_OIDC_*` vars, one line each with a short description.
- **`README.md` (lines 166-171):** replace the Auth0 paragraph with:
  > The app logs in either with username/password (Cyoda Cloud test/dev) or with any OIDC provider via `VITE_APP_OIDC_*` in `apps/saas-app/.env` — Auth0 for Cyoda Cloud, Zitadel for the ctcc cyoda-go stack. See [`apps/saas-app/README.md`](./apps/saas-app/README.md#oidc-login).

  On line 202, replace `Auth0` with `oidc-client-ts`.
- **`apps/saas-app/README.md`:**
  - Replace the `#### Auth0` section (lines 124-140) with an `#### OIDC login` section: the §3 table of the six vars; the fixed redirect and post-logout URIs; the Auth0 checklist (Allowed Callback URLs `{origin}/oidc/callback`, Allowed Logout URLs `{origin}/login`, Allowed Web Origins `{origin}`, refresh-token rotation on, Allow Offline Access on the API); and the Auth0 migration table from spec §3.
  - Lines 97-98: "Auth0 client IDs, audiences and organization IDs" becomes "OIDC client IDs, audiences and organization IDs".
  - Line 197: "Auth0 to log in" becomes "the configured OIDC provider (or username/password) to log in".
  - Line 277: "Entry point, Auth0 + QueryClient setup" becomes "Entry point; registers the OIDC token refresher".
  - Line 283: replace `Auth0TokenInitializer.tsx` with `auth/ — OIDC client, callback page, session helpers`, placed as a sibling entry under `src/`.
  - Lines 364-366: rewrite as "**OIDC login redirect fails** — the IdP must allow `{origin}/oidc/callback` as redirect URI, `{origin}/login` as post-logout URI, and `{origin}` as a web origin. Open the app on exactly that origin (`localhost`, not `127.0.0.1`)."
- **`.devcontainer/README.md`:**
  - Lines 46-49 list `VITE_APP_OIDC_ISSUER`, `VITE_APP_OIDC_CLIENT_ID`, `VITE_APP_OIDC_DISPLAY_NAME` and `VITE_APP_OIDC_EXTRA_PARAMS` (for Auth0's audience and organization).
  - Rename the `## Auth0 callback URLs` section to `## OIDC redirect URIs`. Make it say that the IdP must allow `http://localhost:5173/oidc/callback`, `http://localhost:5173/login` and origin `http://localhost:5173`, and that the port forward keeps the browser-side origin unchanged.
  - Rewrite the troubleshooting entry at lines 127-129 the same way.
- **`.devcontainer/devcontainer.json`:** in the comments on lines 7-9 and 21, replace Auth0 wording with OIDC wording, e.g. `// OIDC login: the IdP must allow http://localhost:5173/oidc/callback ...` and `fill in VITE_APP_BASE_URL and the VITE_APP_OIDC_* values`.
- **`ENV_FILES_GUIDE.md`:**
  - Replace lines 72-74 with the `VITE_APP_OIDC_*` Auth0 example from Step 1.
  - Line 142: "Auth0 values" becomes "OIDC values".
  - Add a section `## OIDC login against ctcc (Zitadel + cyoda-go)`:
    1. start the ctcc stack;
    2. run `scripts/zitadel/create-dashboard-oidc-app.sh`;
    3. paste its output into `apps/saas-app/.env.development.local`;
    4. run `pnpm dev --port 5180 --strictPort`, because 5173 is often taken by a Docker container;
    5. open exactly `http://localhost:5180` and log in as `analyst` / `Password1!`.
- **`PORTS.md`:**
  - Line 50: "Auth0 callback URLs" becomes "OIDC redirect URIs".
  - Add after the table: "`5180` is used ad hoc for OIDC testing against the ctcc stack (`pnpm dev --port 5180 --strictPort`); it is the default `DASHBOARD_URL` of `scripts/zitadel/create-dashboard-oidc-app.sh`."

- [ ] **Step 4: Mock server and connection script**

In `tools/backend-mock-server/server.mjs`, delete the `// Auth0 login endpoint` comment and the whole `app.post('/api/auth/login/auth0', ...)` handler (lines 58-71).

In `apps/saas-app/test-backend-connection.sh`, delete the `if grep -q "VITE_APP_AUTH0_DOMAIN" .env; then ... fi` block (lines 70-74).

Run: `node --check tools/backend-mock-server/server.mjs && bash -n apps/saas-app/test-backend-connection.sh`
Expected: no output.

- [ ] **Step 5: Confirm no tracked Auth0 references remain**

Run: `git grep -nI -i "auth0" -- ':!docs/superpowers' ':!packages/cobi-react' ':!packages/cyoda-sass-react' ':!pnpm-lock.yaml' ':!apps/saas-app/.env.patrick'`

Expected matches, and nothing else:
- `apps/saas-app/src/auth/session.ts` and its test (legacy type and purge)
- the Auth0 *example* values in the env templates
- the READMEs' Auth0 checklist and migration table

- [ ] **Step 6: Commit**

```bash
git add -A .env.template apps/saas-app/.env.template packages/cli README.md apps/saas-app/README.md .devcontainer ENV_FILES_GUIDE.md PORTS.md tools/backend-mock-server/server.mjs apps/saas-app/test-backend-connection.sh
git commit -m "docs: migrate Auth0 configuration, tooling and docs to generic OIDC

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: E2E login-page spec and Playwright base URL

**Files:**
- Modify: `playwright.config.ts:21,57`
- Delete: `e2e/auth0-login.spec.ts`
- Create: `e2e/oidc-login.spec.ts`

- [ ] **Step 1: Fix the Playwright base URL**

In `playwright.config.ts`, replace `baseURL: 'http://localhost:3000',` (line 21) with `baseURL: process.env.BASE_URL ?? 'http://localhost:5173',`, and replace `url: 'http://localhost:3000',` (line 57) with `url: process.env.BASE_URL ?? 'http://localhost:5173',`.

- [ ] **Step 2: Replace the spec**

```bash
git rm e2e/auth0-login.spec.ts
```

`e2e/oidc-login.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import path from 'path';
import { loadEnv } from 'vite';

/**
 * Login page rendering for the configured login methods. Does not drive a real IdP.
 *
 * Expectations come from apps/saas-app/.env* as Vite loads them in development
 * mode. With reuseExistingServer, an already running dev server may have been
 * started with a different env — point BASE_URL at a fresh server if this
 * test disagrees with what you see.
 */
const env = loadEnv('development', path.resolve(__dirname, '../apps/saas-app'), 'VITE_');
const isGo = env.VITE_FEATURE_FLAG_IS_CYODA_GO === 'true';
const oidcName =
  env.VITE_APP_OIDC_ISSUER && env.VITE_APP_OIDC_CLIENT_ID ? env.VITE_APP_OIDC_DISPLAY_NAME || 'SSO' : null;

test.describe('Login page', () => {
  test('renders the configured login methods', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('.login-page')).toBeVisible();

    const passwordField = page.getByPlaceholder('Username');
    if (isGo) {
      await expect(passwordField).toHaveCount(0);
    } else {
      await expect(passwordField).toBeVisible();
    }

    if (oidcName) {
      await expect(page.getByRole('button', { name: `Login with ${oidcName}` })).toBeVisible();
    } else {
      await expect(page.getByRole('button', { name: /^Login with / })).toHaveCount(0);
    }

    if (isGo && !oidcName) {
      await expect(page.getByText('No login method is configured')).toBeVisible();
    }

    await page.screenshot({ path: '.playwright-mcp/login-page.png', fullPage: true });
  });

  test('shows the expired notice', async ({ page }) => {
    await page.goto('/login?reason=expired');
    await expect(page.getByText('Your session expired. Please log in again.')).toBeVisible();
  });
});
```

- [ ] **Step 3: Run it against the dev server**

This needs a running dev server. Start one in the background with `pnpm dev` (port 5173), or reuse one you already have. Then:

Run: `pnpm exec playwright test e2e/oidc-login.spec.ts --project=chromium`
Expected: 2 passed. If `chromium` isn't a project name in `playwright.config.ts`, use the first project listed there.

- [ ] **Step 4: Commit**

```bash
git add -A e2e/oidc-login.spec.ts e2e/auth0-login.spec.ts playwright.config.ts
git commit -m "test(e2e): login page spec for generic OIDC; fix Playwright base URL

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: ctcc Zitadel registration script

**Files:**
- Create: `scripts/zitadel/create-dashboard-oidc-app.sh` (executable)

- [ ] **Step 1: Write the script**

`scripts/zitadel/create-dashboard-oidc-app.sh`:

```bash
#!/usr/bin/env bash
# Registers the Cyoda dashboard as a public OIDC client (auth code + PKCE, no secret)
# named "cyoda-dashboard" under the ctcc Zitadel project "ctcc-app", and prints the
# VITE_APP_OIDC_* lines to paste into apps/saas-app/.env.development.local.
#
# Idempotent: an existing cyoda-dashboard app is reused and its OIDC config updated,
# so a changed DASHBOARD_URL takes effect. Zitadel answers an unchanged update with a
# "No changes" precondition error (COMMAND-1m88i), which counts as success.
#
# Requires the ctcc stack running and ctcc's infra/zitadel/seed.sh already run.
#
# Env:
#   CTCC_DIR           ctcc-management checkout   (default: ../ctcc-management next to this repo)
#   CTCC_ZITADEL_BASE  Zitadel base URL           (default: http://auth.localtest.me:8081)
#   DASHBOARD_URL      dashboard origin           (default: http://localhost:5180)
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CTCC_DIR="${CTCC_DIR:-$REPO_ROOT/../ctcc-management}"
Z="${CTCC_ZITADEL_BASE:-http://auth.localtest.me:8081}"; Z="${Z%/}"
DASHBOARD_URL="${DASHBOARD_URL:-http://localhost:5180}"
while [[ $DASHBOARD_URL == */ ]]; do DASHBOARD_URL="${DASHBOARD_URL%/}"; done
APP_NAME="cyoda-dashboard"

command -v jq >/dev/null || { echo "ERROR: jq is required" >&2; exit 1; }

PAT_FILE="$CTCC_DIR/infra/zitadel/machinekey/ctcc-seeder.pat"
if [ ! -s "$PAT_FILE" ]; then
  echo "ERROR: $PAT_FILE is empty/missing — run ctcc's infra/zitadel/seed.sh first (or set CTCC_DIR)" >&2
  exit 1
fi
PAT=$(cat "$PAT_FILE")

api() { curl -s -H "Authorization: Bearer $PAT" -H 'Content-Type: application/json' "$@"; }

PID=$(api -X POST "$Z/management/v1/projects/_search" -d '{}' \
  | jq -r '.result[]? | select(.name=="ctcc-app") | .id' | head -n1)
if [ -z "$PID" ] || [ "$PID" = "null" ]; then
  echo "ERROR: project ctcc-app not found at $Z (run ctcc's infra/zitadel/seed.sh first)" >&2
  exit 1
fi

# Public user-agent client: PKCE, no secret. JWT access tokens so cyoda-go can
# validate them; role/userinfo assertions so tokens carry roles and a display name.
# devMode permits http redirect URIs on localhost.
OIDC_CONFIG=$(jq -n \
  --arg cb "$DASHBOARD_URL/oidc/callback" \
  --arg lo "$DASHBOARD_URL/login" \
  '{
    redirectUris: [$cb],
    postLogoutRedirectUris: [$lo],
    responseTypes: ["OIDC_RESPONSE_TYPE_CODE"],
    grantTypes: ["OIDC_GRANT_TYPE_AUTHORIZATION_CODE", "OIDC_GRANT_TYPE_REFRESH_TOKEN"],
    appType: "OIDC_APP_TYPE_USER_AGENT",
    authMethodType: "OIDC_AUTH_METHOD_TYPE_NONE",
    devMode: true,
    accessTokenType: "OIDC_TOKEN_TYPE_JWT",
    accessTokenRoleAssertion: true,
    idTokenRoleAssertion: true,
    idTokenUserinfoAssertion: true
  }')

EXISTING=$(api -X POST "$Z/management/v1/projects/$PID/apps/_search" -d '{}' \
  | jq -c --arg n "$APP_NAME" '[.result[]? | select(.name==$n)][0] // empty')

if [ -n "$EXISTING" ]; then
  APP_ID=$(jq -r '.id' <<<"$EXISTING")
  CLIENT_ID=$(jq -r '.oidcConfig.clientId // empty' <<<"$EXISTING")
  RESP=$(api -X PUT "$Z/management/v1/projects/$PID/apps/$APP_ID/oidc_config" -d "$OIDC_CONFIG")
  if jq -e 'has("code")' >/dev/null 2>&1 <<<"$RESP" && ! grep -qE 'COMMAND-1m88i|No changes' <<<"$RESP"; then
    echo "ERROR: updating $APP_NAME failed:" >&2
    jq '.' <<<"$RESP" >&2
    exit 1
  fi
  echo "reused $APP_NAME app $APP_ID (config updated for $DASHBOARD_URL)" >&2
else
  RESP=$(api -X POST "$Z/management/v1/projects/$PID/apps/oidc" \
    -d "$(jq --arg n "$APP_NAME" '. + {name: $n}' <<<"$OIDC_CONFIG")")
  CLIENT_ID=$(jq -r '.clientId // empty' <<<"$RESP")
  if [ -z "$CLIENT_ID" ]; then
    echo "ERROR: creating $APP_NAME failed:" >&2
    jq '.' <<<"$RESP" >&2
    exit 1
  fi
  echo "created $APP_NAME app $(jq -r '.appId' <<<"$RESP")" >&2
fi

if [ -z "$CLIENT_ID" ]; then
  echo "ERROR: could not determine the client id of $APP_NAME" >&2
  exit 1
fi

cat <<EOF
# Paste into apps/saas-app/.env.development.local, then run: pnpm dev --port ${DASHBOARD_URL##*:} --strictPort
VITE_FEATURE_FLAG_IS_CYODA_GO=true
VITE_APP_OIDC_DISPLAY_NAME=Zitadel
VITE_APP_OIDC_ISSUER=$Z
VITE_APP_OIDC_CLIENT_ID=$CLIENT_ID
VITE_APP_OIDC_SCOPES=openid profile email offline_access urn:zitadel:iam:org:project:roles
EOF
```

Run: `chmod +x scripts/zitadel/create-dashboard-oidc-app.sh && bash -n scripts/zitadel/create-dashboard-oidc-app.sh`
Expected: no output.

- [ ] **Step 2: Run it twice against ctcc**

The ctcc stack must be up (`curl -s http://auth.localtest.me:8081/.well-known/openid-configuration | jq -r .issuer` prints `http://auth.localtest.me:8081`).

Run: `scripts/zitadel/create-dashboard-oidc-app.sh`
Expected: stderr says `created cyoda-dashboard app <id>`, and stdout has the five env lines with a non-empty `VITE_APP_OIDC_CLIENT_ID`.

Run: `scripts/zitadel/create-dashboard-oidc-app.sh`
Expected: stderr says `reused cyoda-dashboard app <id> (config updated for http://localhost:5180)`, with the same client ID and exit code 0.

- [ ] **Step 3: Commit**

```bash
git add scripts/zitadel/create-dashboard-oidc-app.sh
git commit -m "chore(scripts): register the dashboard as a public OIDC client in ctcc Zitadel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Verification and manual smoke test against ctcc

**Files:** none are changed, unless a smoke step fails. In that case, fix the issue in the task that owns the code and re-run.

- [ ] **Step 1: Full targeted checks**

Run:

```bash
pnpm exec vitest run packages/http-api-react/src/config apps/saas-app/src packages/ui-lib-react/src/components/Login
pnpm --filter @cyoda/http-api-react --filter @cyoda/saas-app --filter @cyoda/ui-lib-react type-check
pnpm exec eslint packages/http-api-react/src apps/saas-app/src packages/ui-lib-react/src/components
```

Expected: all tests pass, and neither type-check nor lint reports errors. Do not run the monorepo-wide `pnpm test:run`.

- [ ] **Step 2: Configure and start the dashboard for ctcc**

Paste the Task 9 script output into `apps/saas-app/.env.development.local`. Keep its existing `VITE_APP_API_BASE` / proxy settings for cyoda-go on `:8082`. Also remove any leftover `VITE_APP_AUTH0_*` lines from that file and from `apps/saas-app/.env`.

Start: `pnpm dev --port 5180 --strictPort` (in the background)
Expected: Vite prints `Local: http://localhost:5180/`.

- [ ] **Step 3: Smoke run with Playwright MCP**

Save all screenshots under `.playwright-mcp/`.

1. Navigate to exactly `http://localhost:5180/login`. Expect only a "Login with Zitadel" button: no username field, no "OR".
2. Click it and sign in at Zitadel as `analyst` / `Password1!`. Expect to land on `http://localhost:5180/workflows`, with `cyoda_auth` in localStorage having `type: "oidc"`.
3. Open the models / entity viewer and workflow pages. Expect data to load from cyoda-go with no 401 in network requests. This confirms that a regular user token is accepted.
4. Force a real refresh: with `browser_evaluate`, set `cyoda_auth.token` and the `access_token` inside the `oidc.user:http://auth.localtest.me:8081:<clientId>` entry to the same value `garbage`, then trigger an API call by reloading the workflows list. Expect network requests to show a `POST http://auth.localtest.me:8081/oauth/v2/token` with `grant_type=refresh_token`, followed by the retried API call succeeding. The page shows data, not the login page.
5. Log out from the side menu. Expect a redirect through Zitadel's `end_session` endpoint back to `http://localhost:5180/login`. Clicking "Login with Zitadel" again asks for credentials, or at least shows Zitadel's account picker; it must not silently sign you back in.
6. Open `http://localhost:5180/workflows` in the logged-out state. Expect the plain login page, without the "session expired" notice.

- [ ] **Step 4: Report**

Summarize each smoke step as pass or fail, with the evidence (URL, relevant network request, screenshot path). If step 3 fails with 401s while the token is valid, that's a cyoda-go authorization or JWKS issue, not a dashboard bug. Report it with the cyoda-go response body; don't work around it.
