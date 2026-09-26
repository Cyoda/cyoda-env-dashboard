# Environment Files Guide

## Quick answer — which `.env` file do I use?

### SaaS app development (the common case)

Edit **`apps/saas-app/.env`**. After cloning, copy the template once:

```bash
cp apps/saas-app/.env.template apps/saas-app/.env
# edit values as needed, then:
pnpm dev
```

The app starts on **http://localhost:5173** (see
[`apps/saas-app/vite.config.ts`](./apps/saas-app/vite.config.ts) and
[PORTS.md](./PORTS.md)). `VITE_APP_BASE_URL` is required — Vite will refuse
to start without it.

### Standalone package development (rare)

Copy the root `.env.template` into the package you're working on as
`.env.development.local`:

```bash
cp .env.template packages/<package-name>/.env.development.local
# edit for your local backend, then:
pnpm --filter @cyoda/<package-name> dev
```

---

## Env files in this repo

```
cyoda-env-dashboard/
├── .env.template                           # Template — standalone package dev
├── .env.template.development.local         # Older template variant (kept for reference)
│
├── apps/saas-app/
│   ├── .env.template                       # Template for the SaaS app
│   ├── .env                                # Main config (gitignored)
│   └── .env.development.local              # Local overrides (gitignored)
│
└── packages/
    ├── reporting-react/, statemachine-react/, tasks-react/, ...
    │   └── .env.development.local          # Standalone package config (gitignored)
```

> `.gitignore` rule: `.env*` is ignored except for `.env.template`. This means
> `apps/saas-app/.env.template` (and every nested `.env.template`) is **not**
> whitelisted by the root rule alone — review `.gitignore` before relying on it.

---

## SaaS app configuration

### `apps/saas-app/.env` (main config)

- **Status:** gitignored; create it by copying `apps/saas-app/.env.template`.
- **Purpose:** main configuration for the SaaS app. Vite's dev-server proxy
  uses `VITE_APP_BASE_URL` to route `/api`, `/platform-api`,
  `/platform-processing`, `/platform-common`, and `/auth` to the backend
  (see `apps/saas-app/vite.config.ts`).

Typical content:

```bash
VITE_APP_API_BASE=/api
VITE_APP_API_BASE_PROCESSING=
VITE_APP_BASE_URL=https://cyoda-develop.kube3.cyoda.org/
VITE_APP_OIDC_DISPLAY_NAME=Auth0
VITE_APP_OIDC_ISSUER=https://auth.cyoda.net/
VITE_APP_OIDC_CLIENT_ID=<your-auth0-spa-client-id>
VITE_APP_OIDC_EXTRA_PARAMS=audience=https://cloud.cyoda.com/api&organization=<your-auth0-org-id>
VITE_APP_OIDC_LOGOUT_URL=https://auth.cyoda.net/v2/logout?client_id=<your-auth0-spa-client-id>&returnTo=http%3A%2F%2Flocalhost%3A5173%2Flogin
# ...
```

See [`apps/saas-app/README.md`](./apps/saas-app/README.md) for the full
variable reference.

### `apps/saas-app/.env.development.local` (optional overrides)

- **Status:** gitignored; local only.
- **Purpose:** per-developer overrides and feature flags that should not be
  checked in.

Example:

```bash
VITE_FEATURE_FLAG_USE_MODELS_INFO=true
VITE_FEATURE_FLAG_IS_CYODA_GO=false
```

---

## Files NOT used by the SaaS app

### `.env.template` (root)

Template for **standalone package development only**. The SaaS app ignores it
— Vite loads env files from `apps/saas-app/` when running `pnpm dev`.

### `.env.template.development.local` (root)

Older, equivalent template kept for historical reference. Prefer
`.env.template`.

---

## How Vite loads `.env` files

### Running `pnpm dev` (SaaS app)

Vite reads from **`apps/saas-app/`** in this order (later files override
earlier ones):

1. `.env`
2. `.env.development`
3. `.env.local`
4. `.env.development.local`

Vite does **not** load:

- `.env.template` or `.env.template.development.local` at the repo root
- Any `.env*` files under `packages/*`

### Running a package standalone

Vite reads from the package directory, e.g.
`packages/reporting-react/.env.development.local` when running
`pnpm --filter @cyoda/reporting-react dev`.

---

## Common scenarios

### 1. First-time setup

```bash
pnpm install
cp apps/saas-app/.env.template apps/saas-app/.env
# edit VITE_APP_BASE_URL and OIDC values
pnpm dev
# open http://localhost:5173
```

### 2. Change the backend endpoint

Edit `apps/saas-app/.env`:

```bash
# remote (via Vite proxy)
VITE_APP_BASE_URL=https://cyoda-develop.kube3.cyoda.org/
VITE_APP_API_BASE=/api

# or local
VITE_APP_BASE_URL=http://localhost:8082/
VITE_APP_API_BASE=/api
```

Restart the dev server.

### 3. Enable a feature flag

Edit `apps/saas-app/.env.development.local` (gitignored):

```bash
VITE_FEATURE_FLAG_CHATBOT=true
VITE_FEATURE_FLAG_USE_MODELS_INFO=true
```

### 4. Standalone package development

```bash
cp .env.template packages/reporting-react/.env.development.local
# edit for your local backend
pnpm --filter @cyoda/reporting-react dev
# port for each package: see PORTS.md
```

### 5. Running against a Cyoda-Go backend

Cyoda-Go is a digital twin of Cyoda Cloud that does **not** expose the legacy
`/platform-*` endpoints. In `apps/saas-app/.env.development.local`:

```bash
VITE_FEATURE_FLAG_IS_CYODA_GO=true
```

When this flag is set:

- `VITE_FEATURE_FLAG_IS_CYODA_CLOUD` is implicitly `true`.
  `HelperFeatureFlags.isCyodaCloud()` enforces this in code, so a config with
  only `IS_CYODA_GO=true` still behaves correctly.
- The menu shows only **Trino**, **Lifecycle** (Workflows + Instances), and
  **Entity Viewer**. Reporting, Tasks, and Processing are hidden because
  their endpoints don't exist on cyoda-go.
- `VITE_APP_BASE_URL` should point at your cyoda-go instance.

> See [`docs/feature-matrix.md`](./docs/feature-matrix.md) for the full
> panel-by-mode matrix and the current known gaps (notably: the
> Business/Technical entity-type toggle has no meaningful "Technical" option
> in Go mode, since legacy `/platform-*` endpoints aren't reachable).

## OIDC login against ctcc (Zitadel + cyoda-go)

1. Start the ctcc stack.
2. Run `scripts/zitadel/create-dashboard-oidc-app.sh`.
3. Paste its output into `apps/saas-app/.env.development.local`.
4. Run `pnpm dev --port 5180 --strictPort`, because 5173 is often taken by a
   Docker container.
5. Open exactly `http://localhost:5180` and log in as `analyst` /
   `Password1!`.

---

## Summary

| File                                       | Used by              | Purpose           | In git? |
|--------------------------------------------|----------------------|-------------------|---------|
| `apps/saas-app/.env`                       | SaaS app             | Main config       | No (.gitignore) |
| `apps/saas-app/.env.template`              | —                    | Template          | No¹     |
| `apps/saas-app/.env.development.local`     | SaaS app             | Local overrides   | No (.gitignore) |
| `.env.template`                            | Standalone packages  | Template          | Yes (whitelisted) |
| `.env.template.development.local`          | Standalone packages  | Older template    | No¹     |
| `packages/*/.env*.local`                   | Standalone packages  | Package config    | No (.gitignore) |

¹ `.gitignore` only whitelists the root `.env.template`; the nested and
alternate-named templates are ignored by default.

---

## Troubleshooting

**My .env changes aren't applied.**
Make sure you're editing `apps/saas-app/.env` (not the root `.env.template`),
then restart `pnpm dev`. Vite only reads env files at startup.

**`VITE_APP_BASE_URL is not set` on startup.**
Vite enforces this in `apps/saas-app/vite.config.ts`. Copy
`apps/saas-app/.env.template` to `apps/saas-app/.env` and set a value.

**Backend connection fails.**
- Check `VITE_APP_BASE_URL` in `apps/saas-app/.env`.
- Confirm the proxy targets in `apps/saas-app/vite.config.ts` resolve.
- Verify the backend is reachable:
  `curl -I <VITE_APP_BASE_URL>/api`.

---

## Do / don't

**Do:**
- Edit `apps/saas-app/.env` for SaaS app config.
- Use `apps/saas-app/.env.development.local` for local overrides.
- Keep every local `.env*` file out of git (the repo's `.gitignore` handles
  this — don't force-add).

**Don't:**
- Don't put real secrets behind a `VITE_` prefix. Vite inlines them into the
  client bundle. See the security notice at the top of
  `apps/saas-app/.env.template`.
- Don't use npm or yarn in this repo — the workspace uses pnpm. The only
  exception is `tools/backend-mock-server`, which is outside the workspace
  and ships its own `package-lock.json`.

---

## Related documentation

- [README.md](./README.md) — monorepo overview and root scripts
- [PORTS.md](./PORTS.md) — dev-server port assignments
- [`apps/saas-app/README.md`](./apps/saas-app/README.md) — full SaaS app
  setup walkthrough and variable reference
