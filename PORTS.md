# Development server ports

This file lists the dev-server ports used by the workspaces in this monorepo.
Each port is set either in the corresponding `vite.config.ts` or, where the
package's `dev` script overrides it, in that script in `package.json`.

## Application

| Port   | Workspace                  | Start command                                  |
|--------|----------------------------|------------------------------------------------|
| `5173` | `apps/saas-app`            | `pnpm dev` (alias for `pnpm --filter @cyoda/saas-app dev`) |

`http://localhost:5173` is the canonical URL for the Cyoda Env Dashboard during
local development. The port is set explicitly in `apps/saas-app/vite.config.ts`.

`5180` is used ad hoc for OIDC testing against the ctcc stack (`pnpm dev
--port 5180 --strictPort`); it is the default `DASHBOARD_URL` of
`scripts/zitadel/create-dashboard-oidc-app.sh`.

## Packages (standalone development)

Each package with its own dev server can be run standalone. Use this when
iterating on a single package without bringing up `apps/saas-app`.

| Port   | Workspace                                | Start command                                              |
|--------|------------------------------------------|------------------------------------------------------------|
| `3000` | `packages/reporting-react`               | `pnpm --filter @cyoda/reporting-react dev`                 |
| `3001` | `packages/cobi-react` (legacy)           | `pnpm --filter @cyoda/cobi-react dev`                      |
| `3008` | `packages/processing-manager-react`      | `pnpm --filter @cyoda/processing-manager-react dev`        |
| `3010` | `packages/tasks-react`                   | `pnpm --filter @cyoda/tasks-react dev`                     |
| `3011` | `packages/cyoda-sass-react` (legacy)     | `pnpm --filter @cyoda/cyoda-sass-react dev`                |
| `3014` | `packages/statemachine-react`            | `pnpm --filter @cyoda/statemachine-react dev`              |
| `5176` | `packages/source-configuration-react`    | `pnpm --filter @cyoda/source-configuration-react dev`      |

`packages/ui-lib-react`, `packages/http-api-react`, and `packages/cli` are
libraries with no standalone dev server.

## Where each port is defined

| Port   | Source                                                                                  |
|--------|-----------------------------------------------------------------------------------------|
| `5173` | `apps/saas-app/vite.config.ts` (`server.port`)                                          |
| `3000` | `packages/reporting-react/package.json` (`dev` script: `vite --port 3000`, overrides config) |
| `3001` | `packages/cobi-react/vite.config.ts`                                                    |
| `3008` | `packages/processing-manager-react/vite.config.ts`                                      |
| `3010` | `packages/tasks-react/vite.config.ts`                                                   |
| `3011` | `packages/cyoda-sass-react/vite.config.ts`                                              |
| `3014` | `packages/statemachine-react/package.json` (`dev` script: `vite --port 3014`)           |
| `5176` | `packages/source-configuration-react/vite.config.ts`                                    |

## Rules

1. **Do not change `apps/saas-app`'s port.** `5173` is the canonical local URL
   and is referenced by tests, OIDC redirect URIs, and developer bookmarks.
2. **No two workspaces may share a port.** When adding a new package, pick an
   unused port from this file and update the table.
3. **Standalone packages do not collide with the app.** You can run
   `apps/saas-app` on `5173` while running any package on its own port at the
   same time.

## Adding a new workspace

1. Pick an unused port (check this file).
2. Set `server.port` in the new `vite.config.ts`.
3. Add a row to both tables above.
4. Commit the change in the same PR that adds the workspace.
