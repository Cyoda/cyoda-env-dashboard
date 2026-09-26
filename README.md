# Cyoda Env Dashboard

> Repository: <https://github.com/Cyoda-platform/cyoda-env-dashboard>

A React + TypeScript monorepo for the Cyoda environment dashboard. The repository
ships a single deployable application — `apps/saas-app` — that composes a set of
feature packages (`packages/*`) into one UI for managing workflows, instances,
tasks, reporting, processing nodes and Trino schemas against a Cyoda backend.

## Repository layout

```
cyoda-env-dashboard/
├── apps/
│   └── saas-app/                  # Deployable application (Vite + React)
├── packages/
│   ├── cli/                       # Internal CLI helpers
│   ├── cobi-react/                # Data mapping (legacy — not bundled into saas-app)
│   ├── cyoda-sass-react/          # Trino SQL schema management (legacy)
│   ├── http-api-react/            # HTTP client, hooks, EntityViewer
│   ├── processing-manager-react/  # Processing node / transition UI
│   ├── reporting-react/           # Reports & catalogue of aliases
│   ├── source-configuration-react/# Source configuration (standalone only)
│   ├── statemachine-react/        # Workflows, instances, state machine
│   ├── tasks-react/               # Task management
│   └── ui-lib-react/              # Shared UI components, layout, theming
├── tools/
│   └── backend-mock-server/       # Optional local mock backend
├── docs/cyoda-cloud/              # OpenAPI specifications
├── e2e/                           # Playwright end-to-end tests
├── scripts/                       # Build / maintenance scripts
├── package.json                   # pnpm workspaces root
├── pnpm-workspace.yaml            # Workspace package globs
├── pnpm-lock.yaml                 # Lockfile (committed)
├── .npmrc                         # pnpm config (hoisted layout, workspace linking)
├── PORTS.md                       # Port assignments for dev servers
└── ENV_FILES_GUIDE.md             # Detailed .env reference
```

The `apps/saas-app` package is the only thing meant to be deployed. Every
`packages/*` workspace can also be run standalone for isolated development on
its own dev-server port (see [PORTS.md](./PORTS.md)).

## Requirements

| Tool         | Version    | Notes                                            |
|--------------|------------|--------------------------------------------------|
| Node.js      | `>= 22`    | Required by all workspaces                       |
| pnpm         | `9.x`      | Pinned via `packageManager`; install via Corepack |
| Git          | any recent |                                                  |

The package manager is **pnpm** — pinned in `package.json`'s
`packageManager` field. Don't use npm or yarn in this repo; they will
create a competing lockfile and break workspace linking.

> If you previously cloned this repo when it used Yarn 4, run
> `find . -name node_modules -prune -exec rm -rf {} +` and delete any
> stray `yarn.lock` before reinstalling with pnpm.

## First-time setup

You have two options. Pick one.

### Option A — VS Code Dev Container (no local toolchain install)

If you have **Docker Desktop** (or OrbStack) and the **Dev Containers**
VS Code extension, you don't need to install Node, pnpm, or Corepack on
your host machine at all:

1. `git clone https://github.com/Cyoda-platform/cyoda-env-dashboard.git`
2. Open the folder in VS Code → click *Reopen in Container* when prompted.
3. VS Code pulls the image and runs `pnpm install` automatically.

See [`.devcontainer/README.md`](./.devcontainer/README.md) for details.

### Option B — Local toolchain

```bash
# 1. Clone
git clone https://github.com/Cyoda-platform/cyoda-env-dashboard.git
cd cyoda-env-dashboard

# 2. Enable Corepack and activate the pinned pnpm version
corepack enable
corepack prepare pnpm@9.15.4 --activate

# 3. Install all workspace dependencies
pnpm install
```

For a step-by-step macOS walkthrough (Homebrew, Node 22, Corepack, Git),
see [`apps/saas-app/README.md` §1](./apps/saas-app/README.md#1-prerequisites-macos).

## Running the app

The default `dev` script in the root starts `apps/saas-app`:

```bash
pnpm dev
# equivalent to: pnpm --filter @cyoda/saas-app dev
```

Vite will start on **http://localhost:5173** (the port configured in
`apps/saas-app/vite.config.ts`).

> **Important:** the app will not start until `apps/saas-app/.env` exists and
> defines `VITE_APP_BASE_URL`. See
> [`apps/saas-app/README.md`](./apps/saas-app/README.md) for the full
> environment configuration walkthrough.

### Other useful root scripts

| Script                  | What it does                                                                                           |
|-------------------------|--------------------------------------------------------------------------------------------------------|
| `pnpm dev`              | Start the SaaS app dev server                                                                          |
| `pnpm dev:saas`         | Explicit alias for `pnpm dev`                                                                          |
| `pnpm dev:all`          | Start every workspace that defines a `dev` script (parallel)                                           |
| `pnpm build`            | Build every workspace                                                                                  |
| `pnpm build:saas`       | Build `apps/saas-app` and all its workspace dependencies in topological order                          |
| `pnpm test`             | Run the Vitest unit-test suite (watch mode)                                                            |
| `pnpm test:run`         | Run Vitest once (CI mode)                                                                              |
| `pnpm test:ui`          | Vitest with interactive browser UI                                                                     |
| `pnpm test:coverage`    | Vitest with coverage                                                                                   |
| `pnpm test:e2e`         | Run Playwright E2E suite (`e2e/`)                                                                      |
| `pnpm test:e2e:ui`      | Playwright in interactive UI mode                                                                      |
| `pnpm test:e2e:headed`  | Playwright in headed mode (visible browser)                                                            |
| `pnpm lint`             | Run `eslint .` across the repository                                                                   |
| `pnpm lint:fix`         | Run `eslint . --fix` across the repository                                                             |
| `pnpm type-check`       | `tsc --noEmit` in every workspace that defines it (excludes legacy `cobi-react` and `cyoda-sass-react`) |
| `pnpm format`           | Prettier across `packages/**`                                                                          |
| `pnpm clean`            | Run each workspace's `clean` script, then remove the root `node_modules`                               |

### Working on a single package

Each workspace can be run on its own dev server. See [PORTS.md](./PORTS.md) for
the assigned ports. Example:

```bash
pnpm --filter @cyoda/statemachine-react dev   # port 3014
pnpm --filter @cyoda/reporting-react dev      # port 3000
```

Standalone mode reads its own `.env*` files from the package directory; it does
**not** use `apps/saas-app/.env`.

## Backend connection

`apps/saas-app` talks to a real Cyoda backend through the Vite dev-server proxy.
The proxy targets are derived from `VITE_APP_BASE_URL` in `apps/saas-app/.env`
and rewritten in `apps/saas-app/vite.config.ts`. Proxied path prefixes:

- `/api` → `${VITE_APP_BASE_URL}`
- `/platform-api` → `${VITE_APP_BASE_URL}/api/platform-api`
- `/platform-processing` → `${VITE_APP_API_BASE}` (resolved API target)
- `/platform-common` → resolved API target
- `/auth` → resolved API target

A local mock backend is available for offline work:

```bash
cd tools/backend-mock-server
npm install
npm start
```

## Authentication

The app logs in either with username/password (Cyoda Cloud test/dev) or with
any OIDC provider via `VITE_APP_OIDC_*` in `apps/saas-app/.env` — Auth0 for
Cyoda Cloud, Zitadel for the ctcc cyoda-go stack. See
[`apps/saas-app/README.md`](./apps/saas-app/README.md#oidc-login).

## Testing

- **Unit tests** — Vitest, configured at the repository root
  (`vitest.config.ts`). Run with `pnpm test`.
- **E2E tests** — Playwright, configured at the repository root
  (`playwright.config.ts`); specs live under `e2e/`. Run with `pnpm test:e2e`.

### E2E credentials

The Playwright suite reads `TEST_ENV_USER` and `TEST_ENV_SECRET` from the
environment. These are **test-user credentials and must never be committed**.
Provide them one of two ways:

- **Locally** — add them to your gitignored `apps/saas-app/.env`
  (or export them in your shell before running `pnpm test:e2e`).
- **CI** — inject them as secret environment variables in the CI job.

Do not add these to any `.env.template` or other checked-in file.

## Documentation

- [`PORTS.md`](./PORTS.md) — port assignments for the app and standalone packages
- [`ENV_FILES_GUIDE.md`](./ENV_FILES_GUIDE.md) — full reference for `.env` files
- [`apps/saas-app/README.md`](./apps/saas-app/README.md) — setup and run the app
- `docs/cyoda-cloud/` — backend OpenAPI specifications
- Each `packages/*` workspace has its own README with package-specific notes

## Tech stack

React 18 · TypeScript 5 · Vite 6 · Ant Design 5 · React Router 6 ·
TanStack Query · Zustand · oidc-client-ts · Vitest · Playwright · pnpm 9 workspaces.

## License

Private — Cyoda. See [`LICENSE`](./LICENSE).
