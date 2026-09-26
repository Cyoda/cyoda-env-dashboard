# Dev Container

This folder lets you run the whole repo inside a Docker container managed by
VS Code, with no local Node, pnpm, or Corepack install required on the host.

## Prerequisites

- **Docker Desktop** (Windows / macOS / Linux) or **OrbStack** (macOS)
- **VS Code** with the **Dev Containers** extension
  (`ms-vscode-remote.remote-containers`)

That's it. You do **not** need Node, pnpm, Corepack, or any of the toolchain
installed on the host.

## First-time setup

1. Clone the repo and open the folder in VS Code:
   ```bash
   git clone https://github.com/Cyoda-platform/cyoda-env-dashboard.git
   code cyoda-env-dashboard
   ```
2. VS Code shows a toast: *"Folder contains a Dev Container configuration
   file. Reopen in Container?"* Click **Reopen in Container**. (If you miss
   the toast: `Cmd/Ctrl+Shift+P` → *"Dev Containers: Reopen in Container"*.)
3. First time only, VS Code pulls the base image (~500 MB) and runs
   `pnpm install` automatically. This takes a few minutes.
4. Open the integrated terminal (`` Ctrl+` `` / `` Cmd+` ``). You are now
   *inside* the container, in `/workspaces/cyoda-env-dashboard`. Verify:
   ```bash
   node -v   # v22.x
   pnpm -v   # 9.15.4
   ```

## Configure the SaaS app

The `.env` file is gitignored and is **not** created automatically — you
need to make one before the first `pnpm dev`:

```bash
cp apps/saas-app/.env.template apps/saas-app/.env
```

Then open `apps/saas-app/.env` in the VS Code editor and fill in at least:

- `VITE_APP_BASE_URL` — the Cyoda backend URL
- `VITE_APP_OIDC_ISSUER`
- `VITE_APP_OIDC_CLIENT_ID`
- `VITE_APP_OIDC_DISPLAY_NAME`
- `VITE_APP_OIDC_EXTRA_PARAMS` (Auth0's audience and organization)

The full reference for every variable is in
[`apps/saas-app/README.md`](../apps/saas-app/README.md#32-variable-reference).

## Run the app

```bash
pnpm dev
```

VS Code's port forwarder detects port 5173 listening inside the container
and pops up a toast:

> *Your application running on port 5173 is available.*

Click **Open in Browser** (or just open `http://localhost:5173` on your
host machine). The dev server inside the container is reachable at
`localhost:5173` on the host because VS Code tunnels the connection
through its remote extension host.

## OIDC redirect URIs

The IdP must allow `http://localhost:5173/oidc/callback` as redirect URI,
`http://localhost:5173/login` as post-logout URI, and origin
`http://localhost:5173`. This works **unchanged** with Dev Containers — the
port forward keeps the browser-side origin unchanged, so from the browser's
point of view (which is what the IdP sees), the URL is still
`http://localhost:5173`. No new IdP configuration needed.

The only case that *would* require new IdP configuration is if you also use
**GitHub Codespaces** with this same `devcontainer.json`. In that case the
dev server is forwarded to a per-codespace URL like
`https://yourname-fluffy-tribble-xxxx-5173.app.github.dev`, which would
need to be added to the IdP separately.

## Common tasks

All run inside the container terminal:

```bash
pnpm dev                                 # SaaS app dev server (port 5173)
pnpm build:saas                          # production build into apps/saas-app/dist
pnpm test                                # vitest in watch mode
pnpm test:run                            # vitest single run
pnpm test:e2e                            # playwright e2e
pnpm --filter @cyoda/statemachine-react dev   # single package on its own port
```

See [`PORTS.md`](../PORTS.md) for the per-package ports.

## Tips

- **Rebuild the container** after editing `devcontainer.json`:
  `Cmd/Ctrl+Shift+P` → *"Dev Containers: Rebuild Container"*.
- **`pnpm install` is fast on rebuild** because the pnpm content-addressable
  store is mounted on a named volume (`cyoda-pnpm-store`) that survives
  container rebuilds.
- **`node_modules` lives inside the container's bind-mounted workspace**,
  not in a separate volume. That means it's visible to VS Code's TypeScript
  language server with no extra setup.
- **To get out of the container** and back to a normal local VS Code window:
  `Cmd/Ctrl+Shift+P` → *"Dev Containers: Reopen Folder Locally"*.

## Troubleshooting

**Port 5173 doesn't forward**
Check the **Ports** panel in VS Code's bottom bar. If it isn't listed, click
*Forward a Port* and add `5173` manually. If Vite binds successfully but the
host can't reach it, restart the container.

**`pnpm: command not found` after a rebuild**
The `postCreateCommand` only runs once per container creation. If something
went wrong on first run, rebuild via the command palette:
*"Dev Containers: Rebuild Container Without Cache"*.

**Vite says `VITE_APP_BASE_URL is not set in .env file.`**
You haven't created `apps/saas-app/.env` yet. See *Configure the SaaS app*
above.

**OIDC login redirect fails**
Make sure the IdP allows `http://localhost:5173/oidc/callback` as redirect
URI, `http://localhost:5173/login` as post-logout URI, and origin
`http://localhost:5173`. (This is the same requirement as the non-container
setup; the port forward keeps the browser-side origin unchanged.)
