# Generic OIDC login: design spec

> **Branch:** `feat/oidc-login`, off `main`.
> **Test target:** ctcc stack (`../ctcc-management`). cyoda-go 0.8.4 runs on `http://localhost:8082`, Zitadel on `http://auth.localtest.me:8081`.
> **Revision 3:**
> - Rev 2 incorporated the first independent review: dead Refine providers, five axios interceptors, Auth0 leftovers, logout ordering, cross-tab refresh, `returnTo`, default route.
> - Rev 3 incorporates the second review: the logout contract given how redirects actually behave, the retry-401 loop guard, sign-in-only extra params, log level, smoke test that really exercises refresh, more Auth0 leftovers, and the trust model.

## 1. Summary

Replace the Auth0-specific login (`@auth0/auth0-react`) with one provider-agnostic "Login with {name}" flow built on `oidc-client-ts`. It uses Authorization Code + PKCE with a public client. Auth0 becomes one OIDC configuration and ctcc's Zitadel another. The IdP access token is sent as the cyoda bearer token.

Motivation: cyoda-go has no `/auth/login` or `/auth/token`, so the password form can't work against it. cyoda-go does accept JWTs from a registered federated OIDC provider. ctcc registers Zitadel through `scripts/register-oidc-provider.sh`, so browser OIDC login is how the dashboard connects to cyoda-go.

Success criteria:

- With the ctcc stack running and the dashboard in Go mode, a user can click "Login with Zitadel", sign in as a ctcc user and land in the dashboard. cyoda-go API calls succeed with the resulting token.
- When an access token expires, the next 401 triggers a refresh-token grant and the request succeeds without the user noticing. This covers every token-bearing axios instance in `@cyoda/http-api-react`.
- Logout ends the local session. Where the provider supports it, logout also ends the IdP session.
- Existing Cloud deployments keep working with Auth0 once their env vars are renamed.

## 2. Scope

### In scope

- `VITE_APP_OIDC_*` build-time configuration, one provider per build.
- New module `apps/saas-app/src/auth/`: `oidcConfig.ts`, `oidcClient.ts`, `OidcCallback.tsx`, `session.ts`.
- `/oidc/callback` route.
- A token-refresh injection point in `@cyoda/http-api-react` (`registerTokenRefresher` / `getTokenRefresher`) that `refreshAccessToken()` uses.
- Login page changes:
  - the password form is hidden in Go mode
  - the OIDC button appears when OIDC is configured
  - a "session expired" notice
- A shared, Go-aware default route.
- Removal of all Auth0 code and dependencies (§4.7).
- Removal of the dead Refine providers `apps/saas-app/src/providers/authProvider.ts` and `dataProvider.ts`. Nothing imports them, and `@refinedev/core` isn't installed.
- Env and tooling migration:
  - `.env`, `.env.template`, `.env.development.local`
  - `packages/cli/commands/setup.mjs`
  - `.devcontainer/devcontainer.json`
  - READMEs and `ENV_FILES_GUIDE.md`
- `scripts/zitadel/create-dashboard-oidc-app.sh`, which registers the dashboard as a Zitadel public client in the ctcc stack.
- Unit tests, an e2e test for login-page rendering, and a manual Playwright MCP smoke run against ctcc.

### Out of scope

- More than one provider per build.
- Provider configuration at runtime (`config.json`) or entered by the user.
- Proactive or background token renewal (`automaticSilentRenew`) and silent iframe renewal.
- Post-login return to the originally requested page (`returnTo`). After login the user always lands on the default route.
- Cross-tab refresh locking (`navigator.locks`). §5.4 covers the common race more cheaply.
- UI gating by roles from token claims.
- Changes to ctcc-management.
- Personal env files (`apps/saas-app/.env.patrick`).
- The logout path in `packages/processing-manager-react` `Header.tsx` (only navigates). Processing Manager isn't available in Go mode.
- The deprecated packages `packages/cobi-react` and `packages/cyoda-sass-react`.

## 3. Configuration

These are build-time Vite env vars. OIDC is on only when both `ISSUER` and `CLIENT_ID` are set; otherwise no button is rendered.

| Var | Required | Default | Example (ctcc Zitadel) | Notes |
|---|---|---|---|---|
| `VITE_APP_OIDC_ISSUER` | yes | — | `http://auth.localtest.me:8081` | Discovery via `{issuer}/.well-known/openid-configuration`. Use the provider's `issuer` value exactly (e.g. Auth0's has a trailing slash). The value becomes part of the stored-user key, so changing it logs users out. |
| `VITE_APP_OIDC_CLIENT_ID` | yes | — | `3401…@ctcc` | Public client: PKCE, no secret. |
| `VITE_APP_OIDC_DISPLAY_NAME` | no | `SSO` | `Zitadel` | Button label: "Login with {name}". |
| `VITE_APP_OIDC_SCOPES` | no | `openid profile email offline_access` | `openid profile email offline_access urn:zitadel:iam:org:project:roles` | Space-separated. Refresh tokens require `offline_access`. |
| `VITE_APP_OIDC_EXTRA_PARAMS` | no | — | Auth0: `audience=https://cloud.cyoda.com/api&organization=org_…` | Query-string format. It's parsed with `URLSearchParams` and passed as `signinRedirect({ extraQueryParams })`. It is deliberately **not** a `UserManager` setting: `createSignoutRequest` falls back to `settings.extraQueryParams`, which would add these params to the end-session URL. |
| `VITE_APP_OIDC_LOGOUT_URL` | no | — | Auth0: `https://auth.cyoda.net/v2/logout?client_id=…&returnTo=…` | Used only when the provider has no `end_session_endpoint`. The Auth0 tenant `auth.cyoda.net` doesn't advertise one today. If RP-initiated logout is enabled on the tenant, the endpoint appears and this var isn't needed. |

These are fixed and can't be configured:

- `redirect_uri = ${window.location.origin}/oidc/callback`
- `post_logout_redirect_uri = ${window.location.origin}/login`

The dashboard must be served from a secure context, because PKCE needs `crypto.subtle`. That means HTTPS or `http://localhost`. It must also be opened on exactly the registered origin, e.g. `http://localhost:5180` and not `127.0.0.1`.

### Auth0 migration

| Old | New |
|---|---|
| `VITE_APP_AUTH0_DOMAIN=auth.cyoda.net` | `VITE_APP_OIDC_ISSUER=https://auth.cyoda.net/` |
| `VITE_APP_AUTH0_CLIENT_ID` | `VITE_APP_OIDC_CLIENT_ID` |
| `VITE_APP_AUTH0_AUDIENCE`, `VITE_APP_AUTH0_ORGANIZATION` | `VITE_APP_OIDC_EXTRA_PARAMS=audience=…&organization=…` |
| — | `VITE_APP_OIDC_DISPLAY_NAME=Auth0` |
| `VITE_APP_AUTH0_REDIRECT_URI` (unused) | removed |

Two behaviour changes need calling out:

- `config/auth0.ts` currently falls back to hard-coded values when env vars are missing: domain `dev-ex6r-yqc.us.auth0.com`, a client ID, and audience `https://cobi.cyoda.com/api`. There are no such fallbacks any more. A build without `VITE_APP_OIDC_*` shows no SSO button.
- The Auth0 SPA application must allow `{origin}/oidc/callback` as a callback URL and `{origin}/login` as a logout URL.

## 4. Components

### 4.1 `apps/saas-app/src/auth/oidcConfig.ts`

- `getOidcConfig(): OidcConfig | null` is the only code that reads `import.meta.env.VITE_APP_OIDC_*`.
  - It returns `null` when OIDC is disabled.
  - If only one of `ISSUER` / `CLIENT_ID` is set, it logs one `console.warn` naming the missing var.
  - It trims values, applies defaults, and parses `EXTRA_PARAMS` into `Record<string, string>`.
- `OidcConfig = { issuer, clientId, displayName, scopes, extraParams, logoutUrl? }`.

### 4.2 `apps/saas-app/src/auth/oidcClient.ts`

A `UserManager` singleton, created lazily at module level with no React context, so non-React code such as the axios refresh can call it.

`UserManager` settings:

- `authority`, `client_id` and `scope` come from config. `extraQueryParams` does **not** (see `startLogin`). `redirect_uri` and `post_logout_redirect_uri` are as in §3. `response_type` is `'code'`.
- `userStore: new WebStorageStateStore({ store: window.localStorage })`, so the refresh token survives new tabs. This is the same exposure as the current Auth0 setting `cacheLocation: 'localstorage'`, and a known SPA trade-off.
- `stateStore` uses `sessionStorage`, for the short-lived PKCE and state data.
- `automaticSilentRenew: false`.

API:

- `isOidcEnabled(): boolean`
- `startLogin(): Promise<void>` calls `signinRedirect({ extraQueryParams: config.extraParams })`, with no `state` argument.
  - On a normal redirect the returned promise never settles, because the page navigates away. It rejects if the redirect can't start: discovery fails, or there's no secure context.
- `completeLogin(): Promise<void>` is memoized at module level. Repeated calls, including the StrictMode double-mount and HMR re-mounts, share one promise for the same callback URL.
  - It calls `signinRedirectCallback()`.
  - It then writes `cyoda_auth` via `HelperStorage`:
    `{ token: user.access_token, refreshToken: '', user: profile.preferred_username ?? profile.name ?? profile.email ?? profile.sub, userId: profile.sub, type: 'oidc' }`.
  - `refreshToken` stays empty in `cyoda_auth`. The real refresh token exists only in the `UserManager` user store.
- `refreshToken(failedToken?: string): Promise<string>` is single-flight within a tab. Steps:
  1. Read the stored user with `getUser()`.
  2. **Cross-tab check:** if `failedToken` is given and the stored `access_token` differs from it and hasn't expired, another tab has already refreshed. Write it to `cyoda_auth` and resolve with it, without calling the IdP. This keeps two tabs from redeeming the same rotating refresh token. Auth0 treats that kind of reuse as theft and revokes the whole token family.
  3. If there's no `refresh_token`, reject right away. It must never fall back to `signinSilent`'s iframe flow, which needs a `silent_redirect_uri` that this setup doesn't provide.
  4. Otherwise call `signinSilent()`, which runs the refresh-token grant. Then update `cyoda_auth.token` and resolve with the new access token.
  5. On any failure, call `clearSession()` and reject.
- `logout(opts?: { clearAll?: boolean }): Promise<'redirecting' | 'local'>`:
  1. `const user = await getUser()` and keep `idToken = user?.id_token`. This happens **before** anything is cleared.
  2. `await clearSession()`. If `clearAll` is set, also `HelperStorage.clear()` and `localStorage.clear()`. This takes over the clearing `handleLogoutAndClear` does today, so it runs before navigation.
  3. Decide where to send the browser:
     - `await userManager.metadataService.getEndSessionEndpoint()` returns an endpoint: call `userManager.signoutRedirect({ id_token_hint: idToken })` **without awaiting** (its promise never settles on a real redirect) and return `'redirecting'`. A synchronous throw or a rejection falls back to the next options.
     - Otherwise, when `logoutUrl` is configured: `window.location.assign(logoutUrl)` and return `'redirecting'`.
     - Otherwise, including when discovery itself fails: return `'local'`. The caller navigates to `/login`, and the IdP session may stay alive.

  `signoutRedirect` removes the stored user itself too. That's harmless, since step 2 already did it.
- `clearSession(): Promise<void>` calls `removeUser()` and `HelperStorage.remove('auth')`.

No app code logs tokens or `User` objects. The library's logger is `Log.setLogger(console)` with `Log.setLevel(Log.WARN)` in every environment. At DEBUG level `oidc-client-ts` logs the whole token response, access and refresh tokens included, so DEBUG is never enabled.

**Trust model:** `oidc-client-ts` doesn't check the discovery `issuer` or the id_token signature or `iss`. It checks only `sub`, `nonce` and `azp`. The dashboard trusts the configured issuer URL, and it uses the id_token only as a display name and a logout hint. cyoda-go's JWT validation (signature, issuer, audience) of the access token is the only authorization check, and that's intended.

### 4.3 `apps/saas-app/src/auth/OidcCallback.tsx`

This is the public route `/oidc/callback`.

- On mount it calls `completeLogin()`, then `navigate(getDefaultRoute(), { replace: true })`.
- While that's pending, it shows a full-page `Spin`.
- On error it shows an antd `Result` with status `error`, the error message and a "Back to login" button.

### 4.4 `apps/saas-app/src/auth/session.ts`

`isValidSession(): boolean` returns true when `cyoda_auth` has a `token` and its `type` is `'standard'`, `'oidc'` or missing (missing means legacy standard). A stored `type: 'auth0'` entry is removed here and counts as invalid, so users with a stale Auth0 session see the login page once.

### 4.5 Default route: `apps/saas-app/src/utils/defaultRoute.ts`

`getDefaultRoute()` moves here from `Login.tsx` and checks which features exist, in this order:

1. `/trino` if `isTrinoSqlSchemaEnabled()`
2. otherwise `/reporting/reports` if `isReportingAvailable()`
3. otherwise `/workflows`

This matters because today Go mode lands on `/reporting/reports`, a route that isn't registered, and bounces through `*` to `/workflows`. `Login.tsx` and `OidcCallback.tsx` both use this function. The `/` index redirect in `routes/index.tsx` stays `/workflows`, as it is now.

### 4.6 `Login.tsx` and other saas-app changes

`Login.tsx`:

- The password form is shown unless `HelperFeatureFlags.isCyodaGo()`. It's still needed for Cloud test and dev environments.
- A "Login with {displayName}" button is shown when `isOidcEnabled()` and calls `startLogin()`. If `startLogin()` rejects, it shows `message.error("Login with {displayName} failed: {err.message}")` and stays on the page. Using the real message means a missing secure context ("Crypto.subtle is available only in secure contexts") is distinguishable from an unreachable provider.
- The "OR" divider appears only when both the form and the button are shown.
- If neither is available (Go mode without OIDC config), an antd `Alert` explains that `VITE_APP_OIDC_*` must be configured.
- `?reason=expired` shows an info `Alert`: "Your session expired. Please log in again."
- `?reason=rejected` shows a warning `Alert`: "The server rejected your credentials. If this persists, check that the backend trusts this identity provider."
- All `useAuth0` usage goes, including the Auth0 redirect effect.

Other files:

- **`App.tsx`:** remove `Auth0Provider` and `Auth0TokenInitializer`.
- **`routes/index.tsx`:** add `<Route path="/oidc/callback" element={<OidcCallback />} />` next to `/login`, outside `AppLayout`.
- **`main.tsx`:** when OIDC is enabled, call `registerTokenRefresher('oidc', refreshToken, { clearSession })` before the first render. On every start, also call `purgeLegacyAuth0Cache()` (in `auth/session.ts`), which removes `localStorage` keys that begin with `@@auth0spajs@@`. Those are the old Auth0 SDK cache and contain refresh tokens.
- **`components/AppLayout.tsx`:** the route guard uses `isValidSession()` instead of checking for a token. Remove the Auth0 comment.
- **`components/LeftSideMenu.tsx`:** for `auth.type === 'oidc'`, both handlers first close the modal (`setLogoutModalVisible(false)`), then `await logout()` (`handleLogout`) or `await logout({ clearAll: true })` (`handleLogoutAndClear`), and navigate to `/login` only when the result is `'local'`. Other session types keep today's behaviour.

### 4.7 Auth0 removal

| Item | Action |
|---|---|
| `apps/saas-app/src/config/auth0.ts`, `components/Auth0TokenInitializer.tsx`, `utils/auth0TokenManager.ts` | delete |
| `apps/saas-app/src/providers/authProvider.ts`, `providers/dataProvider.ts` (dead Refine code) | delete |
| `@auth0/auth0-react` in root `package.json` and `apps/saas-app/package.json` | remove; add `oidc-client-ts` to `apps/saas-app/package.json` |
| `packages/ui-lib-react/src/components/LoginAuth0Btn/*` and the export at `components/index.ts:9` | delete (not used by any app) |
| `showAuth0Button` / `auth0ButtonComponent` props and the `.auth0-button-wrapper` markup/styles in `packages/ui-lib-react/src/components/Login/` | remove; update `Login.test.tsx` |
| `e2e/auth0-login.spec.ts` | replace with `e2e/oidc-login.spec.ts` (§8) |
| `packages/cli/commands/setup.mjs` Auth0 prompts | replace with `VITE_APP_OIDC_*` prompts (issuer, client ID, display name, extra params) |
| Tracked templates: root `.env.template` (drop the hard-coded `dev-ex6r-yqc` values) and `apps/saas-app/.env.template` | migrate to `VITE_APP_OIDC_*` per §3 |
| Docs: `.devcontainer/README.md`, `README.md`, `apps/saas-app/README.md`, `packages/cli/README.md`, `PORTS.md` | migrate Auth0 mentions to OIDC |
| `.devcontainer/devcontainer.json` (Auth0 appears only in comments) | update the comments |
| `tools/backend-mock-server/server.mjs` mock `/auth/login/auth0` endpoint | delete |
| `apps/saas-app/test-backend-connection.sh` Auth0 section | delete |
| `apps/saas-app/src/pages/Login.scss` Auth0 button styles | rename to generic `.oidc-login-button` styles |
| `apps/saas-app/src/components/RefineLayout.tsx` (dead) and the `@refinedev` stubs in `apps/saas-app/src/cobi-react.d.ts` | delete |
| Local, gitignored `apps/saas-app/.env` and `.env.development.local` | migrate on the developer's machine (these changes don't appear in the diff) |

## 5. Token refresh

### 5.1 Injection point in `@cyoda/http-api-react`

A new file, `packages/http-api-react/src/config/tokenRefresh.ts`, exported from the package index:

```ts
export type TokenRefresher = (failedToken?: string) => Promise<string>; // resolves to the new access token
export interface TokenRefresherEntry {
  refresh: TokenRefresher;
  clearSession?: () => Promise<void> | void;
}
export function registerTokenRefresher(
  type: string,
  fn: TokenRefresher,
  opts?: { clearSession?: () => Promise<void> | void },
): void;
export function getTokenRefresher(type: string): TokenRefresherEntry | undefined;
```

### 5.2 `http-api-react/src/config/axios.ts`

`refreshAccessToken(failedToken?: string)` gains a parameter. Each interceptor passes the token taken from the failing request's `error.config.headers.Authorization`, minus its `Bearer ` prefix.

The file has five response interceptors: `instance`, `axiosPlatform`, `axiosProcessing`, `axiosGrafana` and `axiosAI`. All of them call one shared `refreshAccessToken()`, and that function is where the change goes:

- Look up `getTokenRefresher(auth.type)`. If one is found, call its `refresh(failedToken)`. The refresher writes the new token to `cyoda_auth`.
- Otherwise use the existing `/auth/token` flow. `standard` sessions don't change.
- On failure, remove `cyoda_auth` and redirect to `/login?reason=expired`. Today it redirects to `/login`.

The interceptors keep their existing single-flight promise and their one retry (`__isRetryRequest`).

**Grafana is excluded.** `axiosGrafana` authenticates with basic auth, so a 401 from it says nothing about the cyoda token. Its interceptor stops calling `refreshAccessToken()` and just rejects.

**Retry rejected (loop guard):** a retried request goes through global `axios.request(error.config)`, which has none of these interceptors, so a second 401 comes back to the original caller as a plain rejection. Each interceptor wraps the retry. If it fails with 401, the interceptor doesn't refresh again: it removes `cyoda_auth`, calls the entry's `clearSession` hook if one is registered, and redirects to `/login?reason=rejected`. That way a backend that won't accept a freshly issued token can't turn every request into another refresh, redeeming a refresh token each time. A cold JWKS cache in cyoda-go is one way this happens.

Error toasts need no change. `HelperErrors.handler` already skips 401s (`utils/errors.ts:36`).

### 5.3 Behaviour

- Refresh is reactive: it happens on a 401, and the original request is retried once.
- A retried request that still gets a 401 clears the session and redirects to `/login?reason=rejected`. It never triggers a second refresh.
- A failed refresh clears the session and redirects to `/login?reason=expired`. This covers a missing refresh token, a rejected refresh token and a network error. If the IdP session is still alive, the next OIDC login completes without re-entering credentials.
- IdPs issue refresh tokens only when `offline_access` is requested and the client allows the refresh-token grant. Auth0 refresh tokens are already tied to the requested audience, so the refresh request doesn't need `audience` again.

### 5.4 Multiple tabs

All tabs share the `localStorage` user store. When two tabs get a 401 at the same moment, the cross-tab check in §4.2 `refreshToken` step 2 handles the common case: the second tab sees that the first already stored a new token and reuses it. A true simultaneous race can still redeem the same refresh token twice. With rotation and reuse detection, the loser's refresh fails and that tab lands on `/login?reason=expired`. We accept this, and `navigator.locks` stays out of scope.

## 6. ctcc Zitadel setup

`scripts/zitadel/create-dashboard-oidc-app.sh` is new and lives in this repo. It's modelled on ctcc's `infra/zitadel/create-oidc-app.sh`.

**Inputs:**

- `CTCC_DIR`, default `../ctcc-management`
- the PAT at `$CTCC_DIR/infra/zitadel/machinekey/ctcc-seeder.pat`
- `CTCC_ZITADEL_BASE`, default `http://auth.localtest.me:8081`
- `DASHBOARD_URL`, default `http://localhost:5180`, with trailing slashes trimmed

**Steps:**

1. Find project `ctcc-app`. If the project or the PAT is missing, fail with a clear message telling the user to run ctcc's `seed.sh` first.
2. If an app named `cyoda-dashboard` already exists, reuse it; a public client has no secret to capture. Update its OIDC config (`PUT /management/v1/projects/{projectId}/apps/{appId}/oidc_config`) with the settings below so that a changed `DASHBOARD_URL` takes effect, and read its client ID from `oidcConfig.clientId`. Otherwise create it with:
   - `appType: OIDC_APP_TYPE_USER_AGENT`, `authMethodType: OIDC_AUTH_METHOD_TYPE_NONE`
   - `responseTypes: [CODE]`, `grantTypes: [AUTHORIZATION_CODE, REFRESH_TOKEN]`
   - `redirectUris: ["$DASHBOARD_URL/oidc/callback"]`, `postLogoutRedirectUris: ["$DASHBOARD_URL/login"]`
   - `accessTokenType: OIDC_TOKEN_TYPE_JWT`, `accessTokenRoleAssertion: true`, `idTokenRoleAssertion: true`, `idTokenUserinfoAssertion: true`, `devMode: true`
3. Print the `VITE_APP_OIDC_*` lines for the user to paste into `apps/saas-app/.env.development.local`. The script doesn't edit env files.

**Checked while writing this spec:** Zitadel's token endpoint answers the CORS preflight for `Origin: http://localhost:5180` with a 204 and echoes `Access-Control-Allow-Origin`, so the browser can exchange the code directly. ctcc registers Zitadel with cyoda without `expectedAudiences`, and ctcc's own probe uses an analyst token against `/api/model/`.

To run the dashboard for ctcc testing: `pnpm dev --port 5180 --strictPort`. Port 5173 is taken by a Docker container.

## 7. Error handling

| Situation | Behaviour |
|---|---|
| OIDC env incomplete (only one of issuer / client ID) | Treated as disabled, with one `console.warn` naming the missing var. |
| `startLogin()` rejects (discovery unreachable, insecure context) | `message.error("Login with {displayName} failed: {err.message}")`; the user stays on the login page. |
| Callback error (`?error=` from the IdP, state mismatch, token exchange failure) | `OidcCallback` shows the error `Result` with the message and "Back to login". |
| Refresh fails | The session is cleared and the user is redirected to `/login?reason=expired`. |
| Retried request still gets a 401 | No second refresh. The session is cleared and the user is redirected to `/login?reason=rejected`. |
| Discovery fails during logout | Local logout (`'local'`). |
| Grafana 401 | Rejected without a refresh, and the session is kept. |
| Stored legacy `type: 'auth0'` session | `isValidSession()` removes it and `AppLayout` redirects to `/login`. |
| Provider has no end-session endpoint and no `LOGOUT_URL` is set | Local logout only. The IdP session may persist, so the next login may complete silently. |

## 8. Testing

Unit tests use vitest and are run as targeted files only, plus lint and type-check for `apps/saas-app`, `packages/http-api-react` and `packages/ui-lib-react`. There is no full monorepo `pnpm test:run`.

- `oidcConfig.test.ts`:
  - disabled when vars are missing
  - defaults and scopes
  - `EXTRA_PARAMS` parsing
  - a partial config warns
- `oidcClient.test.ts` (with `oidc-client-ts` mocked):
  - `completeLogin` writes `cyoda_auth` in the documented shape, and concurrent calls share one `signinRedirectCallback`
  - `refreshToken`:
    - updates the token, and concurrent calls share one `signinSilent`
    - when the stored token differs from `failedToken`, returns it without calling `signinSilent`
    - rejects without `signinSilent` when there's no refresh token
    - on failure, clears state and rejects
  - `startLogin` passes `extraQueryParams` to `signinRedirect`, and `extraQueryParams` isn't in the `UserManager` settings
  - `logout`:
    - reads `id_token` before clearing
    - with an end-session endpoint, calls `signoutRedirect({ id_token_hint })` without awaiting it and returns `'redirecting'`
    - with no endpoint, uses `LOGOUT_URL` when set; otherwise returns `'local'`
    - on a discovery error, returns `'local'`
    - `clearAll` clears all storage
  - `Log` level is WARN
- `session.test.ts`: valid types pass; `auth0` is removed and counts as invalid; a missing token is invalid; `purgeLegacyAuth0Cache()` removes only `@@auth0spajs@@*` keys.
- `defaultRoute.test.ts`: Trino, then reporting, then workflows.
- `tokenRefresh.test.ts` and `axios` tests in `http-api-react`:
  - a 401 on an `oidc` session calls the registered refresher once even when several 401s arrive together, passes the failed token, and retries with the new token
  - `standard` sessions still call `/auth/token`
  - a refresher failure redirects to `/login?reason=expired`
  - a Grafana 401 doesn't refresh
  - a 401 on the retried request doesn't refresh again; it calls the `clearSession` hook and redirects to `/login?reason=rejected`
- `Login.test.tsx`:
  - which elements show for each combination of Go mode and OIDC configured
  - the expired and rejected notices
  - the error message from a `startLogin` rejection is shown
  - the no-login-method alert
- `OidcCallback.test.tsx`: success navigates to the default route; an error renders the error result.
- `AppLayout` test: an `auth0` session redirects to `/login`.
- `LeftSideMenu` test: for `oidc` sessions, both logout actions close the modal, call `logout()` (with `clearAll: true` for the clear variant), and navigate only on `'local'`.
- `ui-lib-react` `Login.test.tsx` is updated for the removed props, and the `LoginAuth0Btn` tests are deleted.

E2E: `e2e/oidc-login.spec.ts` replaces `auth0-login.spec.ts`. It checks rendering only and doesn't drive a real IdP:
- The password form is expected only when the dev server isn't in Go mode.
- The "Login with {name}" button is expected only when the dev server's env configures OIDC.
- The expectations are read from `VITE_FEATURE_FLAG_IS_CYODA_GO` / `VITE_APP_OIDC_*`, loaded in the Playwright process from `apps/saas-app/.env*` with Vite's `loadEnv('development', …)`.
- The test is skipped when there's nothing to assert.

Manual smoke run with Playwright MCP, saving screenshots under `.playwright-mcp/`. Precondition: the ctcc stack is up and the dashboard runs at exactly `http://localhost:5180` in Go mode.

1. The login page shows only "Login with Zitadel".
2. Sign in as `analyst` / `Password1!`. The user lands on `/workflows`.
3. The models and workflow pages load from cyoda-go, which confirms that a regular user token is accepted on those endpoints.
4. Force a real refresh-token grant. In localStorage, corrupt `cyoda_auth.token`, and in the `oidc.user:{issuer}:{clientId}` entry, corrupt `access_token` and set `expires_at` in the past. The next API call must send a `refresh_token` grant to Zitadel's token endpoint (visible in network requests) and then succeed. Corrupting only `cyoda_auth.token` would take the cross-tab shortcut and never contact the IdP.
5. Log out. The Zitadel session ends and the browser returns to `/login`.

Auth0 isn't tested end to end in this work. Unit tests and the env migration cover it.
