# Repository Notes

- This repository is a near-direct port of the OpenHands frontend, adapted to talk straight to `software-agent-sdk` / `agent_server` without the usual OpenHands app backend.
- Frontend API adaptation lives mainly in `src/api/`:
  - `option-service` fabricates an OSS web-client config and reads models/providers from `agent_server` LLM endpoints.
  - `settings-service` stores settings locally in browser localStorage and reads schemas from `agent_server` `/api/settings/*` endpoints.
  - `v1-conversation-service`, `event-service`, `sandbox-service`, `git-service`, and `skills-service` are mapped directly to `agent_server` REST endpoints.
  - `open-hands-axios` injects the optional `X-Session-API-Key` from env/local config for all requests.
- Supported env vars for deployment:
  - `VITE_BACKEND_BASE_URL` for the agent server base URL.
  - `VITE_SESSION_API_KEY` for optional session auth.
  - `VITE_WORKING_DIR` for the default workspace path sent when starting conversations.
  - `VITE_WORKER_URLS` as a comma-separated list of browser worker URLs if you want the Browser tab to probe exposed app hosts.
  - `VITE_ENABLE_BROWSER_TOOLS=false` to omit `BrowserToolSet` from new conversation payloads.
- The UI keeps most OpenHands routes/layout intact, but SaaS/org/billing/integration behavior is intentionally hidden or stubbed via the fabricated OSS config because there is no separate app backend.
- Verification command: `npm run typecheck && npm run build`.
- GitHub automation now includes `.github/workflows/ci.yml` for `npm ci`, `npm test`, and `npm run build`, plus `.github/dependabot.yml` with weekly npm/github-actions updates gated by a 7-day cooldown.
- Direct `dependencies` and `devDependencies` in `package.json` are exact-pinned (no caret ranges); reproducible installs should use the committed `package-lock.json` plus `npm ci`, and targeted transitive fixes still belong in `overrides`.
- `package-lock.json` must also retain the optional peer entry for `node_modules/vite-tsconfig-paths/node_modules/typescript@5.9.3`; without that nested lock entry, clean `npm ci` installs on CI fail with `Missing: typescript@5.9.3 from lock file`.
- `npm test` now runs `npm run make-i18n` first so clean environments generate `src/i18n/declaration.ts` before Vitest loads aliased imports.
- `__tests__/vite-config.test.ts` should import `vite.config` directly under `// @vitest-environment node`; spawning plain `node -e 'import ./vite.config.ts'` is not portable across Node patch releases in CI.
- `vitest.setup.ts` must guard DOM-specific globals (`HTMLCanvasElement`, `HTMLElement`, `window`) because some suites run in the Node environment instead of jsdom.
- `@openhands/typescript-client` is consumed directly from `github:OpenHands/typescript-client#4716d2e`; that package ships the needed subpath exports for `client/http-client`, `events/remote-events-list`, and `workspace/remote-workspace`.
- Shared TypeScript-client adapters live in `src/api/typescript-client.ts`; prefer those helpers for agent-server-backed REST/workspace/event/VS Code calls before falling back to `open-hands-axios`.
- Local verification/build gotchas:
  - `npm run typecheck` assumes generated translation types exist; run `npm run make-i18n` first if `src/i18n/declaration.ts` is missing.
- Phase-1 OSS cleanup removed SaaS-only auth/org/billing/onboarding/payment/invitation codepaths, routes, and tests. Keep `integrations`, `git-settings`, `secrets`, MCP settings, and other local/self-hosted flows intact when simplifying OSS behavior.
- When merging main into the Phase-1 OSS cleanup branch, keep the new agent-server compatibility bootstrap in `src/root.tsx`, but do not reintroduce SaaS invitation cleanup or enterprise CTA chrome in the OSS user menu; the OSS account menu should just render settings links plus Docs.

- During the Phase-1 OSS cleanup audit, the runtime SaaS removals held up, but route-level regression coverage for still-active OSS settings pages had been deleted too aggressively. Keep focused tests for local/self-hosted screens like `app-settings`, `llm-settings`, `git-settings`, `mcp-settings`, and `secrets-settings` even when stripping SaaS-only code.

- `npm run dev:mock` needs MSW handlers for the direct agent-server routes used by the adapted frontend, not the original OpenHands mock paths. Key routes that must stay covered are:
  - bootstrap/model loading: `/server_info`, `/api/llm/models/verified`, `/api/llm/providers`
  - settings schemas: `/api/settings/agent-schema`, `/api/settings/conversation-schema`
  - conversation browsing/loading: `/api/conversations/search`, `/api/conversations?ids=...`, `/api/conversations/:id`, `/api/conversations/:id/events/*`
  - runtime git panels: `/api/git/changes`, `/api/git/diff`
- Static mock verification needs a build created with `VITE_MOCK_API=true` (use `npm run build:mock`); the client must start MSW whenever that flag is enabled, even in production/static builds, otherwise routes like `/settings` and the conversations pane fall through to the static server and crash on undefined `.filter`/`.map` assumptions.
- Frontend compatibility guard: `OptionService.getConfig()` now uses `/server_info.version` to block unsupported agent-server versions before the app loads. Git history in `software-agent-sdk` shows `/api/settings/agent-schema` and `/api/settings/conversation-schema` first shipped in tag `v1.17.0`, so the GUI currently treats `< 1.17.0` (or unknown/unparseable versions) as incompatible, `useConfig` stops retrying that case, and `src/root.tsx` renders a blocking unsupported-version notice on every route.
- Useful regression tests for mock mode live in `__tests__/api/option-service.test.ts`, `__tests__/api/mock-conversation-handlers.test.ts`, and `__tests__/api/mock-settings-handlers.test.ts`.
- Browser-verified mock-mode tour artifact was generated at `artifacts/frontend-tour.gif`.
- Live `agent_server` compatibility quirks discovered during browser verification:
  - Latest `openhands-agent-server` live-mode notes (verified against 1.18.1):
    - `/api/settings/agent-schema` and `/api/settings/conversation-schema` exist on recent servers, but they return `401` when the server was started with `SESSION_API_KEY` or `OH_SESSION_API_KEYS_0`; the frontend must send the same value as `VITE_SESSION_API_KEY` / `X-Session-API-Key`.
    - The provider/model picker should use `/api/llm/providers`, `/api/llm/models`, and `/api/llm/models/verified`; `/api/v1/config/providers/search` and `/api/v1/config/models/search` 404 on current live agent-server releases.
    - When the browser is accessing the frontend through a remote host (for example an All Hands work URL) but `VITE_BACKEND_BASE_URL` points at `127.0.0.1`/`localhost`, browser-side REST calls must fall back to the frontend origin so Vite can proxy `/api` and `/sockets` to the local backend.
  - `GET /api/conversations` expects repeated `ids` params (`?ids=a&ids=b`), not Axios's default bracket form (`ids[]=a`), so the shared Axios client needs a custom params serializer.
  - Runtime git panels should prefer the conversation's reported `workspace.working_dir` when present; falling back to `/workspace/project` can produce 500s like `Not a git repository` for direct local workspaces such as `/workspace/project/agent-server-gui`.
  - For the current `openhands-agent-server` PyPI/uv-tool flow, `uv tool install -U openhands-agent-server` alone was not sufficient in this environment. A working install was:
    - `uv tool install -U --with openhands-tools --with openhands-workspace openhands-agent-server`
    - `uv tool install` exposes the executable as `agent-server`, not `openhands-agent-server`, and may require adding `~/.local/bin` to `PATH`.
  - Current SDK / agent-server conversation start payloads must use SDK-registered snake_case tool names, not the old class-style names. Working names against SDK v1.18.1 were:
    - `terminal`
    - `file_editor`
    - `task_tracker`
    - `browser_tool_set`
      Using `TerminalTool` / `FileEditorTool` / `TaskTrackerTool` / `BrowserToolSet` caused live `/api/conversations/{id}/events` runs to fail with `ToolDefinition '<name>' is not registered`.
  - The root compatibility bootstrap now treats `/server_info` network/timeout failures as a first-class `AgentServerUnavailableError`, uses a short 5s timeout for that probe, and disables React Query retries/toasts for the initial config fetch so missing backends fail fast with an explicit full-screen notice.
  - For local verification in this repo, setting `VITE_WORKING_DIR=/workspace/project/agent-server-gui` avoids initial Changes-tab 500s from pointing conversations at the non-repo parent `/workspace/project`.
  - OpenHands Cloud sandbox development note: do **not** reuse the sandbox's existing agent-server for this frontend. Current agent-server releases use a shared `openhands` tmux socket and default `workspace/conversations`, so a naive second server in the same sandbox can kill the cloud session's tmux state or attach to the same persisted conversations. `npm run dev` is now the recommended local workflow and starts an isolated local agent-server for the checkout by overriding `TMUX_TMPDIR`, `OH_CONVERSATIONS_PATH`, `OH_BASH_EVENTS_DIR`, and `OH_VSCODE_PORT` under `.openhands-dev/`; use `npm run dev:frontend` only when intentionally pointing at a separately managed backend, or `npm run dev:mock` for mock mode.

  - A successful end-to-end live run in this environment required a real LLM config (`LLM_MODEL` + `LLM_API_KEY`). The default `litellm_proxy/...` model with no `llm_api_key` failed at runtime with a `litellm.AuthenticationError`.
- Git provider token persistence note: this direct-agent-server frontend now persists `Settings > Git` provider tokens locally in browser storage instead of posting to an app-backend secrets route. `src/api/secrets-service.ts` writes the token payload to localStorage, mirrors provider hosts into `provider_tokens_set` through `SettingsService.saveSettings()`, and `use-delete-git-providers` clears that local state.


- README expectation: keep the first section as a concrete, chronological from-scratch quickstart for running this frontend against a real `openhands-agent-server` (clone, install backend, optional `.env`, run `npm run dev`).
- Keep README user-focused and move contributor/developer-specific workflows (Cloud sandbox debugging, `dev:safe`, mock mode, detailed env vars/build-test notes) into `DEVELOPMENT.md`.
- `scripts/dev-safe.mjs` should fail fast if `agent-server` cannot be spawned (for example missing PATH entries).
- Vite dev mode can black-screen on first load with `504 Outdated Optimize Dep` if core client-entry deps are not prebundled; keep `react`, `react/jsx-runtime`, `react-dom/client`, and `react-router/dom` in `optimizeDeps.include`.

- As an OpenHands incubator **Sandbox** project, the repo should carry the standard sandbox warning badge in `README.md` and include a root `LICENSE` file to satisfy the incubator-program requirements.
- OpenHands repo bootstrap files live under `.openhands/`:
  - `.openhands/setup.sh` installs frontend dependencies with `npm ci` when needed, creates `.env` from `.env.sample` if missing, appends `VITE_WORKING_DIR` for this repo when unset, and generates `src/i18n/declaration.ts` via `npm run make-i18n`.
  - `.openhands/pre-commit.sh` mirrors the repo's local quality gate with `npm run lint && npm run test`.
- GitHub PR-review automation should stay aligned with the current OpenHands repo conventions: keep the review workflow at `.github/workflows/pr-review-by-openhands.yml`, keep the companion `.github/workflows/pr-review-evaluation.yml`, auto-run on newly opened non-draft PRs and `ready_for_review` events from established contributors, still support the `review-this` label / `openhands-agent` / `all-hands-bot` reviewer triggers, use the OpenHands app LLM proxy defaults, and use the dual-trigger pattern (`pull_request` for same-repo PRs, `pull_request_target` for forks) so workflow changes can self-verify without widening fork secret exposure.
- The repo now includes `.agents/skills/custom-codereview-guide.md`, adapted from `OpenHands/software-agent-sdk`, to force PR reviews to always leave either an APPROVE or COMMENT review instead of silently finishing with no review object.


- HeroUI v3 migration notes:
  - The repo now uses `@heroui/react@3.0.3` plus `@heroui/styles@3.0.3`.
  - `src/tailwind.css` should import `@heroui/styles`; the old `hero.ts` Tailwind plugin file was removed and should not be reintroduced.
  - Settings selectors no longer use the v2 `Autocomplete` APIs. `settings-dropdown-input.tsx` and `model-selector.tsx` now use HeroUI v3 `ComboBox` + `ListBox` patterns, and the model/provider comboboxes must keep their `name` attributes so `FormData` submission still populates settings diffs.
  - Tooltip consumers that used the old monolithic `Tooltip` props should prefer the shared `StyledTooltip` wrapper so HeroUI v3 trigger/content typing stays centralized.
  - Visual verification artifacts for the migration live under `.pr/issue-44/`; to reproduce the static screenshots, use `npm run build:mock`, serve `build/` (for example with `python -m http.server --directory build`), and navigate client-side before capturing screenshots because a plain static server will not provide SPA deep-link fallbacks.

