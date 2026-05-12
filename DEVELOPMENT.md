# Development

This document is for contributors working on `agent-canvas` itself.

## Recommended local workflow

The default development command is:

```sh
npm run dev
```

This is an alias for `npm run dev:safe`.

It uses `uvx` to run a temporary `agent-server` installation for this checkout on `127.0.0.1:18000` and points the frontend at it. It isolates conversation persistence by setting separate `OH_CONVERSATIONS_PATH`, `OH_BASH_EVENTS_DIR`, and `OH_VSCODE_PORT` values under `.openhands-dev/`, and places tmux sockets under `/tmp` (via `TMUX_TMPDIR`) to avoid filesystem-support issues with mounted volumes, so it does not collide with other local or cloud-backed OpenHands sessions.

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Ingress port | `8000` |
| `OH_AUTOMATION_GIT_REF` | Git ref for automation backend | `main` |
| `OH_AGENT_SERVER_GIT_REF` | Git ref for agent-server | `main` |

### Alternative: Minimal Mode (without Automation)

To run without the automation service:

```sh
npm run dev:minimal
```

This runs only agent-server + Vite (no automation backend or ingress).
Access at `http://localhost:3001/`

### Agent server version selection

By default, the latest released version from PyPI is used. You can override this (highest precedence first):

```sh
# Run against a local software-agent-sdk checkout. Workspace packages
# (openhands-sdk, openhands-tools, openhands-workspace) are installed editable
# so source edits there are picked up on restart. Highest precedence.
OH_AGENT_SERVER_LOCAL_PATH=/abs/path/to/software-agent-sdk npm run dev

# Use a git branch or commit (takes precedence over version)
OH_AGENT_SERVER_GIT_REF=main npm run dev
OH_AGENT_SERVER_GIT_REF=abc1234 npm run dev

# Use a specific PyPI version
OH_AGENT_SERVER_VERSION=1.18.0 npm run dev
```

`OH_AGENT_SERVER_LOCAL_PATH` must be an absolute path to a `software-agent-sdk` checkout containing the `openhands-agent-server`, `openhands-sdk`, `openhands-tools`, and `openhands-workspace` workspace packages. The agent-server itself is rebuilt from local source on each `npm run dev` start (`uvx --reinstall`); the other workspace packages are installed editable, so their source changes take effect without a rebuild.

### Other useful overrides

- `OH_CANVAS_SAFE_BACKEND_PORT` — backend port for the isolated server (default `18000`)
- `OH_CANVAS_SAFE_VSCODE_PORT` — VS Code sidecar port (default `backend port + 1`)
- `OH_CANVAS_SAFE_STATE_DIR` — base directory for isolated server state
- `VITE_WORKING_DIR` — repo root used for new conversations (defaults to the current checkout)

## Alternative development workflows

### Multiple local backends (shared persistence)

To run a second standalone agent-server alongside `npm run dev` while sharing
its conversation history and encrypted secrets, see
[docs/multi-backend-setup.md](./docs/multi-backend-setup.md). The
`npm run dev:extra-backend` helper launches an extra server on `:18002` that
reuses the bundled instance's state dir.

### Frontend against an existing backend

Use this only if you intentionally started `agent-server` yourself or want the frontend to talk to another backend:

```sh
npm run dev:frontend
```

The frontend-only workflow expects the backend at `127.0.0.1:8000` by default.

If you start the backend with `SESSION_API_KEY` or `OH_SESSION_API_KEYS_0`, every `/api/*` route is authenticated with `X-Session-API-Key`. In that case the frontend must send the same key via `VITE_SESSION_API_KEY`.

### Mock mode

If you want to run the frontend without a live backend, use:

```sh
npm run dev:mock
```

## Build and test

```sh
npm run test
npm run build
npm run start
```

Useful targeted verification for the isolated dev launcher:

```sh
npm run test -- __tests__/api/agent-server-config.test.ts __tests__/scripts/dev-safe.test.ts
```

## CSS isolation and host-app customization

The standalone app and the exported provider/root wrapper now scope all bundled CSS under a dedicated shell element with the `data-agent-server-ui` attribute. That means Tailwind utilities, HeroUI component styles, xterm styles, and local CSS only apply inside the OpenHands UI subtree instead of leaking into a host app.

### Embedding strategy

- Use `AgentServerUIProviders` in host apps. It renders a scoped style root by default.
- For direct wrapper control, use `AgentServerUIRoot`.
- The standalone app opts out of the provider wrapper because the router layout already renders the scoped root.

### Customization strategy

Theme and surface tokens are exposed as CSS custom properties on the scoped root. You can override them either through the provider/root `styleOverrides` prop or with host CSS targeting `[data-agent-server-ui]`.

```tsx
<AgentServerUIProviders
  styleOverrides={{
    "--oh-color-base": "#101820",
    "--oh-color-content-2": "#f5f7ff",
    "--oh-accent": "#8b5cf6",
  }}
>
  <App />
</AgentServerUIProviders>
```

If you want Tailwind layout utilities on the inner themed container, pass `contentClassName` instead of `className`, because the outer scope element is what all generated selectors key off of.

## Environment variables

You can create a `.env` file in the project directory with these variables based on `.env.sample`.

| Variable                    | Description                                                                        | Default Value          |
| --------------------------- | ---------------------------------------------------------------------------------- | ---------------------- |
| `VITE_BACKEND_BASE_URL`     | Full base URL for the agent server used by direct browser requests                 | current browser origin |
| `VITE_BACKEND_HOST`         | Backend host used by the Vite dev proxy                                            | `127.0.0.1:8000`       |
| `VITE_SESSION_API_KEY`      | Optional `X-Session-API-Key` header value for authenticated agent_server instances | -                      |
| `VITE_WORKING_DIR`          | Workspace path sent when starting new conversations                                | `workspace/project`    |
| `VITE_WORKER_URLS`          | Optional comma-separated worker/app URLs for the Browser tab                       | -                      |
| `VITE_ENABLE_BROWSER_TOOLS` | Set to `false` to omit `BrowserToolSet` from new conversation payloads             | `true`                 |
| `VITE_MOCK_API`             | Enable/disable API mocking with MSW                                                | `false`                |
| `VITE_USE_TLS`              | Use HTTPS/WSS for the Vite proxy target                                            | `false`                |
| `VITE_FRONTEND_PORT`        | Port to run the frontend application                                               | `3001`                 |
| `VITE_INSECURE_SKIP_VERIFY` | Skip TLS certificate verification for proxied backend requests                     | `false`                |
| `VITE_GITHUB_TOKEN`         | GitHub token for repository access (used in some tests)                            | -                      |
