# Generic OIDC login — design spec

> **Branch:** `feat/oidc-login`, off `main`.
> **Test target:** ctcc stack (`../ctcc-management`): cyoda-go 0.8.4 on `http://localhost:8082`, Zitadel on `http://auth.localtest.me:8081`.

## 1. Summary

Replace the Auth0-specific login (`@auth0/auth0-react`) with a single, provider-agnostic "Login with {name}" flow built on `oidc-client-ts` (Authorization Code + PKCE, public client). Auth0 becomes just one OIDC configuration; ctcc's Zitadel is another. The IdP access token is used directly as the cyoda bearer token.

Motivation: cyoda-go has no `/auth/login` or `/auth/token`, so the password form cannot work against it. cyoda-go accepts JWTs from a registered federated OIDC provider (ctcc registers Zitadel via `scripts/register-oidc-provider.sh`), so browser OIDC login is the way to use the dashboard with cyoda-go.

Success criteria:

- With the ctcc stack up and the dashboard in Go mode, clicking "Login with Zitadel", signing in as a ctcc user, and landing in the dashboard works; cyoda-go API calls succeed with the resulting token.
- Expired access tokens are refreshed transparently on 401 via the refresh-token grant, from **both** axios instances (saas-app `dataProvider` and `@cyoda/http-api-react`).
- Logout ends the local session and, where the provider supports it, the IdP session.
- Existing Cloud deployments keep working with Auth0 after renaming env vars.

## 2. Scope

### In scope

- `VITE_APP_OIDC_*` build-time configuration (one provider per build).
- New `apps/saas-app/src/auth/` module: `oidcConfig.ts`, `oidcClient.ts`, `OidcCallback.tsx`.
- `/oidc/callback` route.
- Token-refresh injection point in `@cyoda/http-api-react` (`registerTokenRefresher` / `getTokenRefresher`), used by both axios instances.
- Login page: password form hidden in Go mode; OIDC button shown when configured; "session expired" notice.
- Removal of `@auth0/auth0-react`, `config/auth0.ts`, `components/Auth0TokenInitializer.tsx`, `utils/auth0TokenManager.ts`, and the `Auth0Provider` wrapper.
- Env migration (`.env`, `.env.template`, `.env.development.local`) and documentation in `ENV_FILES_GUIDE.md`.
- `scripts/zitadel/create-dashboard-oidc-app.sh` to register the dashboard as a Zitadel public client in the ctcc stack.
- Unit tests and a manual Playwright MCP smoke against ctcc.

### Out of scope

- Multiple providers per build.
- Runtime (`config.json`) or user-entered provider configuration.
- Proactive/background token renewal (`automaticSilentRenew`), silent iframe renew.
- Role-based UI gating from token claims.
- Changes to ctcc-management.
- Deprecated packages `packages/cobi-react` and `packages/cyoda-sass-react`.

## 3. Configuration

All build-time Vite env vars. OIDC is enabled only when both `ISSUER` and `CLIENT_ID` are set; otherwise the button is not rendered.

| Var | Required | Default | Example (ctcc Zitadel) | Notes |
|---|---|---|---|---|
| `VITE_APP_OIDC_ISSUER` | yes | — | `http://auth.localtest.me:8081` | Discovery via `{issuer}/.well-known/openid-configuration`. |
| `VITE_APP_OIDC_CLIENT_ID` | yes | — | `3401…@ctcc` | Public client (PKCE, no secret). |
| `VITE_APP_OIDC_DISPLAY_NAME` | no | `SSO` | `Zitadel` | Button label: "Login with {name}". |
| `VITE_APP_OIDC_SCOPES` | no | `openid profile email offline_access` | `openid profile email offline_access urn:zitadel:iam:org:project:roles` | Space-separated. `offline_access` is needed for refresh tokens. |
| `VITE_APP_OIDC_EXTRA_PARAMS` | no | — | Auth0: `audience=https://cloud.cyoda.com/api&organization=org_…` | Query-string format; parsed with `URLSearchParams` and passed as `extraQueryParams` on the authorize request. |
| `VITE_APP_OIDC_LOGOUT_URL` | no | — | Auth0: `https://auth.cyoda.net/v2/logout?client_id=…&returnTo=…` | Used only when discovery has no `end_session_endpoint` (Auth0 tenant `auth.cyoda.net` does not advertise one). |

Fixed, not configurable:

- `redirect_uri = ${window.location.origin}/oidc/callback`
- `post_logout_redirect_uri = ${window.location.origin}/login`

### Auth0 migration

| Old | New |
|---|---|
| `VITE_APP_AUTH0_DOMAIN=auth.cyoda.net` | `VITE_APP_OIDC_ISSUER=https://auth.cyoda.net/` (trailing slash must match Auth0's `issuer`) |
| `VITE_APP_AUTH0_CLIENT_ID` | `VITE_APP_OIDC_CLIENT_ID` |
| `VITE_APP_AUTH0_AUDIENCE`, `VITE_APP_AUTH0_ORGANIZATION` | `VITE_APP_OIDC_EXTRA_PARAMS=audience=…&organization=…` |
| — | `VITE_APP_OIDC_DISPLAY_NAME=Auth0` |
| `VITE_APP_AUTH0_REDIRECT_URI` (unused) | removed |

The Auth0 SPA application must allow `{origin}/oidc/callback` as a callback URL and `{origin}/login` as a logout URL.

## 4. Components

### 4.1 `apps/saas-app/src/auth/oidcConfig.ts`

- `getOidcConfig(): OidcConfig | null`: the only reader of `import.meta.env.VITE_APP_OIDC_*`. Returns `null` when disabled. Trims values, applies defaults, parses `EXTRA_PARAMS` into `Record<string, string>`.
- `OidcConfig = { issuer, clientId, displayName, scopes, extraParams, logoutUrl? }`.

### 4.2 `apps/saas-app/src/auth/oidcClient.ts`

Module-level lazily created `UserManager` singleton (no React context), so non-React code such as axios interceptors can call it.

`UserManager` settings:

- `authority`, `client_id`, `scope`, `extraQueryParams` from config; `redirect_uri` / `post_logout_redirect_uri` as in §3; `response_type: 'code'`.
- `userStore: new WebStorageStateStore({ store: window.localStorage })` so the refresh token survives new tabs (same exposure as the current Auth0 `cacheLocation: 'localstorage'`).
- `stateStore`: `sessionStorage` (transient PKCE/state data).
- `automaticSilentRenew: false`.

API:

- `isOidcEnabled(): boolean`
- `startLogin(returnTo?: string): Promise<void>`: `signinRedirect({ state: { returnTo } })`.
- `completeLogin(): Promise<{ returnTo?: string }>`: `signinRedirectCallback()`, then writes `cyoda_auth` via `HelperStorage`:
  `{ token: user.access_token, refreshToken: '', user: profile.preferred_username ?? profile.name ?? profile.email ?? profile.sub, userId: profile.sub, type: 'oidc' }`.
  `refreshToken` stays empty in `cyoda_auth`: the real refresh token lives only in the `UserManager` user store.
- `refreshToken(): Promise<string>`: single-flight; if the stored user has no `refresh_token`, reject immediately (never fall back to `signinSilent`'s iframe flow, which needs a `silent_redirect_uri` we don't provide); otherwise `signinSilent()` (refresh-token grant), updates `cyoda_auth.token`, resolves with the new access token. On any failure: `clearSession()` and reject.
- `logout(): Promise<void>`: clears `cyoda_auth` and the stored user, then in order of preference: `signoutRedirect({ id_token_hint })` if discovery has `end_session_endpoint`; else `window.location.assign(logoutUrl)` if configured; else navigate to `/login`.
- `clearSession(): Promise<void>`: `removeUser()` and `HelperStorage.remove('auth')`.

### 4.3 `apps/saas-app/src/auth/OidcCallback.tsx`

Public route `/oidc/callback`. On mount (guarded against StrictMode double-invoke with a ref), calls `completeLogin()`, then `navigate(returnTo ?? getDefaultRoute(), { replace: true })`. While pending, shows a full-page `Spin`. On error, shows an antd `Result` (status `error`) with the error message and a "Back to login" button.

`getDefaultRoute()` currently lives in `Login.tsx`. Move it to a shared place (`apps/saas-app/src/utils/defaultRoute.ts`) so both pages use it.

### 4.4 `Login.tsx`

- Password form rendered unless `HelperFeatureFlags.isCyodaGo()`. Still needed for Cloud test/dev environments.
- OIDC button "Login with {displayName}" rendered when `isOidcEnabled()`; calls `startLogin()`.
- Divider "OR" only when both are shown.
- If neither is available (Go mode, no OIDC config), show an antd `Alert` explaining that `VITE_APP_OIDC_*` must be configured.
- `?reason=expired` shows an info `Alert`: "Your session expired. Please log in again."
- Remove all `useAuth0` usage and the Auth0 redirect effect.

### 4.5 Other saas-app changes

- `App.tsx`: remove `Auth0Provider` and `Auth0TokenInitializer`.
- `routes/index.tsx`: add `<Route path="/oidc/callback" element={<OidcCallback />} />` next to `/login`.
- `main.tsx`: `registerTokenRefresher('oidc', refreshToken)` when OIDC is enabled, before first render.
- `providers/authProvider.ts`: `AuthData.type` becomes `'standard' | 'oidc'`; remove the `auth0` branch in `login`; `check` treats a stored `type: 'auth0'` entry as unauthenticated (removes it), so stale Auth0 sessions land on the login page once.
- `components/LeftSideMenu.tsx`: `handleLogout` calls `oidcClient.logout()` when `auth.type === 'oidc'`, otherwise keeps current behaviour.
- `providers/dataProvider.ts`: replace the Auth0 branch with the shared refresher (§5).
- `package.json`: remove `@auth0/auth0-react`, add `oidc-client-ts`.

## 5. Token refresh

### 5.1 Injection point in `@cyoda/http-api-react`

New `packages/http-api-react/src/config/tokenRefresh.ts`, exported from the package index:

```ts
export type TokenRefresher = () => Promise<string>; // resolves to the new access token
export function registerTokenRefresher(type: string, fn: TokenRefresher): void;
export function getTokenRefresher(type: string): TokenRefresher | undefined;
```

### 5.2 `http-api-react/src/config/axios.ts`

`refreshAccessToken()` looks up `getTokenRefresher(auth.type)`. If one is found, it calls it (the new token is already written to `cyoda_auth` by the refresher). Otherwise it falls back to the existing `/auth/token` flow, unchanged for `standard` sessions. The existing single-flight promise and one-retry (`__isRetryRequest`) behaviour stays. On failure: remove `cyoda_auth`, redirect to `/login?reason=expired`.

Both response interceptors in this file (the main and processing instances) get the same treatment.

### 5.3 `saas-app/providers/dataProvider.ts`

The 401 handler uses `getTokenRefresher(auth.type)` instead of `isAuth0Session()` / `refreshAuth0Token()`. Existing single-flight, retry-once and failure behaviour stays (`localStorage.clear()` and redirect), with the redirect target changed to `/login?reason=expired`.

### 5.4 Behaviour

- Reactive only: refresh on 401, retry the original request once.
- A failed refresh (no refresh token, refresh token rejected, network error) clears the session and redirects to `/login?reason=expired`. If the IdP session is still alive, the next OIDC login completes without re-entering credentials.
- IdPs issue refresh tokens only when `offline_access` is requested and the client allows the refresh-token grant.

## 6. ctcc Zitadel setup

New `scripts/zitadel/create-dashboard-oidc-app.sh` in this repo, modelled on ctcc's `infra/zitadel/create-oidc-app.sh`:

- Inputs: `CTCC_DIR` (default `../ctcc-management`), PAT from `$CTCC_DIR/infra/zitadel/machinekey/ctcc-seeder.pat`, `CTCC_ZITADEL_BASE` (default `http://auth.localtest.me:8081`), `DASHBOARD_URL` (default `http://localhost:5180`, trailing slashes trimmed).
- Finds project `ctcc-app`; fails with a clear message if it or the PAT is missing (run ctcc's `seed.sh` first).
- If an app named `cyoda-dashboard` exists, reuses it (public client, no secret to capture); otherwise creates it with:
  - `appType: OIDC_APP_TYPE_USER_AGENT`, `authMethodType: OIDC_AUTH_METHOD_TYPE_NONE`
  - `responseTypes: [CODE]`, `grantTypes: [AUTHORIZATION_CODE, REFRESH_TOKEN]`
  - `redirectUris: ["$DASHBOARD_URL/oidc/callback"]`, `postLogoutRedirectUris: ["$DASHBOARD_URL/login"]`
  - `accessTokenType: OIDC_TOKEN_TYPE_JWT`, `accessTokenRoleAssertion: true`, `idTokenRoleAssertion: true`, `idTokenUserinfoAssertion: true`, `devMode: true`
- Prints the `VITE_APP_OIDC_*` lines to paste into `apps/saas-app/.env.development.local`. It does not edit env files.

Verified during design: Zitadel's token endpoint answers the CORS preflight for `Origin: http://localhost:5180` (204, `Access-Control-Allow-Origin` echoed), so the browser-side code exchange works.

Dashboard dev server for ctcc testing: `pnpm dev --port 5180 --strictPort` (5173 is occupied by a Docker container).

## 7. Error handling

| Situation | Behaviour |
|---|---|
| OIDC env incomplete (only one of issuer/client ID) | Treated as disabled; `console.warn` once naming the missing var. |
| Discovery fetch fails on login click | `message.error("Could not reach {displayName}")`; stay on login page. |
| Callback error (`?error=` from IdP, state mismatch, token exchange failure) | `OidcCallback` error `Result` with message + "Back to login". |
| Refresh fails | Clear session, redirect to `/login?reason=expired`. |
| Stored legacy `type: 'auth0'` session | Removed by `authProvider.check`; user sees the login page. |
| Provider has no end-session endpoint and no `LOGOUT_URL` | Local logout only; IdP session may persist (next login may be silent). |

## 8. Testing

Unit tests (vitest), run as targeted files only, plus lint and type-check for `apps/saas-app` and `packages/http-api-react`; no full monorepo `pnpm test:run`:

- `oidcConfig.test.ts`: disabled when vars missing; defaults; scopes; `EXTRA_PARAMS` parsing; partial config warns.
- `oidcClient.test.ts` (mocked `oidc-client-ts`):
  - `completeLogin` writes `cyoda_auth` with the documented shape and returns `returnTo`
  - `refreshToken` updates the token; concurrent calls share one `signinSilent`; failure clears state and rejects
  - `logout` chooses end-session, then `LOGOUT_URL`, then local
- `tokenRefresh.test.ts` + `axios` tests in `http-api-react`:
  - a 401 on an `oidc` session calls the registered refresher once for concurrent 401s and retries with the new token
  - `standard` sessions still call `/auth/token`
  - refresher failure redirects to `/login?reason=expired`
- `Login.test.tsx`: visibility matrix (Go mode × OIDC configured); expired notice.
- `OidcCallback.test.tsx`: success navigates to `returnTo` / default route; error renders the error result.
- Existing tests referencing Auth0 are updated or removed.

Manual smoke (Playwright MCP, screenshots under `.playwright-mcp/`), ctcc stack up, dashboard on `:5180` in Go mode:

1. Login page shows only "Login with Zitadel".
2. Sign in as `analyst` / `Password1!`, then land on the default route.
3. Models and workflow pages load from cyoda-go. This also confirms that a regular user token is accepted on those endpoints.
4. Corrupt `cyoda_auth.token` in localStorage; the next API call refreshes transparently.
5. Logout ends the Zitadel session and returns to `/login`.

Auth0 is not exercised end-to-end in this work; it is covered by unit tests and the env migration.
