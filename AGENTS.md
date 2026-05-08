# Repository Notes

- This repository is a near-direct port of the OpenHands frontend, adapted to talk straight to `software-agent-sdk` / `agent_server` without the usual OpenHands app backend.
- Frontend API adaptation lives mainly in `src/api/`:
  - `option-service` fabricates an OSS web-client config and reads models/providers from `agent_server` LLM endpoints.
  - `settings-service` uses agent server `/api/settings` endpoints for persistence; reads schemas from `/api/settings/agent-schema` and `/api/settings/conversation-schema`, fetches settings with optional `X-Expose-Secrets: encrypted` header for conversation start payloads, and saves settings via PATCH with diffs.
  - `v1-conversation-service`, `event-service`, `git-service`, and `skills-service` are mapped directly to `agent_server` REST endpoints.
  - `open-hands-axios` injects the optional `X-Session-API-Key` from env/local config for all requests.
- Supported env vars for deployment:
  - `VITE_BACKEND_BASE_URL` for the agent server base URL.
  - `VITE_SESSION_API_KEY` for optional session auth.
  - `VITE_WORKING_DIR` for the default workspace path sent when starting conversations.
  - `VITE_WORKER_URLS` as a comma-separated list of browser worker URLs if you want the Browser tab to probe exposed app hosts.
  - `VITE_ENABLE_BROWSER_TOOLS=false` to omit `BrowserToolSet` from new conversation payloads.
- Default working-dir fallback is now the relative path `workspace/project` (exported as `DEFAULT_WORKING_DIR` from `src/api/agent-server-config.ts`); git-path heuristics and the default PLAN preview path should reuse that constant instead of hardcoding `/workspace/project`.
- The UI keeps most OpenHands routes/layout intact, but hosted-only behavior (org, account management, integrations) has been removed via the fabricated OSS config because there is no separate app backend.
- Verification command: `npm run typecheck && npm run build`.
- GitHub automation now includes `.github/workflows/ci.yml` for `npm ci`, `npm test`, and `npm run build`, plus `.github/dependabot.yml` with weekly npm/github-actions updates gated by a 7-day cooldown.
- Direct `dependencies` and `devDependencies` in `package.json` are exact-pinned (no caret ranges); reproducible installs should use the committed `package-lock.json` plus `npm ci`, and targeted transitive fixes still belong in `overrides`.
- `package-lock.json` must also retain the optional peer entry for `node_modules/vite-tsconfig-paths/node_modules/typescript@5.9.3`; without that nested lock entry, clean `npm ci` installs on CI fail with `Missing: typescript@5.9.3 from lock file`.
- `npm test` now runs `npm run make-i18n` first so clean environments generate `src/i18n/declaration.ts` before Vitest loads aliased imports.
- `__tests__/vite-config.test.ts` should import `vite.config` directly under `// @vitest-environment node`; spawning plain `node -e 'import ./vite.config.ts'` is not portable across Node patch releases in CI.
- `vitest.setup.ts` must guard DOM-specific globals (`HTMLCanvasElement`, `HTMLElement`, `window`) because some suites run in the Node environment instead of jsdom.
- `__tests__/components/providers/posthog-wrapper.test.tsx` must wrap `PostHogWrapper` in a `QueryClientProvider`; the wrapper now reads its client from React Query context instead of importing the global singleton.

- `@openhands/typescript-client` is consumed directly from `github:OpenHands/typescript-client#4716d2e`; that package ships the needed subpath exports for `client/http-client`, `events/remote-events-list`, and `workspace/remote-workspace`.
- Shared TypeScript-client adapters live in `src/api/typescript-client.ts`; prefer those helpers for agent-server-backed REST/workspace/event/VS Code calls before falling back to `open-hands-axios`.
- Local verification/build gotchas:
  - `npm run typecheck` assumes generated translation types exist; run `npm run make-i18n` first if `src/i18n/declaration.ts` is missing.
- The OSS cleanup removed hosted-only auth, org, account, onboarding, and invitation codepaths, routes, and tests. Keep `integrations`, `git-settings`, `secrets`, MCP settings, and other local/self-hosted flows intact when simplifying OSS behavior.
- When merging main into this branch, keep the new agent-server compatibility bootstrap in `src/root.tsx`, but do not reintroduce hosted-only invitation cleanup or marketing CTA chrome in the OSS user menu; the OSS account menu should just render settings links plus Docs.

- During the OSS cleanup audit, the runtime removals held up, but route-level regression coverage for still-active OSS settings pages had been deleted too aggressively. Keep focused tests for local/self-hosted screens like `app-settings`, `llm-settings`, `git-settings`, `mcp-settings`, and `secrets-settings` even when stripping hosted-only code.

- `npm run dev:mock` needs MSW handlers for the direct agent-server routes used by the adapted frontend, not the original OpenHands mock paths. Key routes that must stay covered are:
  - bootstrap/model loading: `/server_info`, `/api/llm/models/verified`, `/api/llm/providers`
  - settings schemas: `/api/settings/agent-schema`, `/api/settings/conversation-schema`
  - settings CRUD: `GET /api/settings`, `PATCH /api/settings`
  - secrets CRUD: `GET /api/settings/secrets` (list), `GET /api/settings/secrets/:name` (value), `PUT /api/settings/secrets` (upsert), `DELETE /api/settings/secrets/:name`
  - conversation browsing/loading: `/api/conversations/search`, `/api/conversations?ids=...`, `/api/conversations/:id`, `/api/conversations/:id/events/*`
  - runtime git panels: `/api/git/changes`, `/api/git/diff`
- Static mock verification needs a build created with `VITE_MOCK_API=true` (use `npm run build:mock`); the client must start MSW whenever that flag is enabled, even in production/static builds, otherwise routes like `/settings` and the conversations pane fall through to the static server and crash on undefined `.filter`/`.map` assumptions.
- Frontend compatibility guard: `OptionService.getConfig()` now uses `/server_info.version` to block unsupported agent-server versions before the app loads. Git history in `software-agent-sdk` shows `/api/settings/agent-schema` and `/api/settings/conversation-schema` first shipped in tag `v1.17.0`, so Agent Canvas currently treats `< 1.17.0` (or unknown/unparseable versions) as incompatible, `useConfig` stops retrying that case, and `src/root.tsx` renders a blocking unsupported-version notice on every route.
- Useful regression tests for mock mode live in `__tests__/api/option-service.test.ts`, `__tests__/api/mock-conversation-handlers.test.ts`, and `__tests__/api/mock-settings-handlers.test.ts`.
- Browser-verified mock-mode tour artifact was generated at `artifacts/frontend-tour.gif`.
- Live `agent_server` compatibility quirks discovered during browser verification:
  - Latest `openhands-agent-server` live-mode notes (verified against 1.18.1):
    - `/api/settings/agent-schema` and `/api/settings/conversation-schema` exist on recent servers, but they return `401` when the server was started with `SESSION_API_KEY` or `OH_SESSION_API_KEYS_0`; the frontend must send the same value as `VITE_SESSION_API_KEY` / `X-Session-API-Key`.
    - The provider/model picker should use `/api/llm/providers`, `/api/llm/models`, and `/api/llm/models/verified`; `/api/v1/config/providers/search` and `/api/v1/config/models/search` 404 on current live agent-server releases.
    - When the browser is accessing the frontend through a remote host (for example an All Hands work URL) but `VITE_BACKEND_BASE_URL` points at `127.0.0.1`/`localhost`, browser-side REST calls must fall back to the frontend origin so Vite can proxy `/api` and `/sockets` to the local backend.
  - `GET /api/conversations` expects repeated `ids` params (`?ids=a&ids=b`), not Axios's default bracket form (`ids[]=a`), so the shared Axios client needs a custom params serializer.
  - Runtime git panels should prefer the conversation's reported `workspace.working_dir` when present; falling back to `/workspace/project` can produce 500s like `Not a git repository` for direct local workspaces such as `/workspace/project/agent-canvas`.
  - For development, `npm run dev` now uses `uvx` to run a temporary agent-server installation, so no permanent `uv tool install` is required. For standalone installations, `uv tool install -U --with openhands-tools --with openhands-workspace openhands-agent-server` would expose the executable as `agent-server` (not `openhands-agent-server`), possibly requiring `~/.local/bin` on `PATH`.
  - Current SDK / agent-server conversation start payloads must use SDK-registered snake_case tool names, not the old class-style names. Working names against SDK v1.18.1 were:
    - `terminal`
    - `file_editor`
    - `task_tracker`
    - `browser_tool_set`
      Using `TerminalTool` / `FileEditorTool` / `TaskTrackerTool` / `BrowserToolSet` caused live `/api/conversations/{id}/events` runs to fail with `ToolDefinition '<name>' is not registered`.
  - The root compatibility bootstrap now treats `/server_info` network/timeout failures as a first-class `AgentServerUnavailableError`, uses a short 5s timeout for that probe, and disables React Query retries/toasts for the initial config fetch so missing backends fail fast with an explicit full-screen notice.
  - For local verification in this repo, setting `VITE_WORKING_DIR=/workspace/project/agent-canvas` avoids initial Changes-tab 500s from pointing conversations at the non-repo parent `/workspace/project`.
  - A successful end-to-end live run in this environment required a real LLM config (`LLM_MODEL` + `LLM_API_KEY`). The default `litellm_proxy/...` model with no `llm_api_key` failed at runtime with a `litellm.AuthenticationError`.

- Agent-server recovery UX gotchas:
  - Keep `/settings/agent-server` in the intermediate-page bypass path (`use-is-on-intermediate-page`) so `useConfig()`-driven layout/sidebar queries do not block the recovery screen behind a global spinner.
  - `PostHogWrapper` should treat config-fetch failures as silent/optional (no user-facing toast), otherwise onboarding/recovery screens show a duplicate incompatible-server toast on top of the friendly guidance.
  - Keep the settings route on the compact `AgentServerConnectionForm` variant with `showSectionHeader={false}` and no checklist; the blocked root onboarding should stay similarly minimal, with only the status card plus a single sentence that links to the repo setup instructions.
  - For local screenshot/GIF capture of SPA routes, serve `build/` with an SPA fallback (for example `sirv build --single`) and restart the static server after each rebuild so hashed asset URLs stay in sync.

- Git provider token persistence note: `src/api/secrets-service.ts` stores git provider tokens in TWO places:
  1. **Agent-server secrets API** (`PUT /api/settings/secrets`) with naming convention `GIT_PROVIDER_{PROVIDER}_TOKEN` - for agent runtime use
  2. **localStorage** (`openhands-agent-server-git-provider-tokens`) - for frontend git API calls (repo search, branches, etc.)
  The `addGitProvider` method stores to server FIRST (must succeed), then updates localStorage. This ensures server-side persistence is the source of truth.
- Agent server connection settings now live at `Settings > Agent Server` (`/settings/agent-server`). The page reads deployment defaults from `VITE_BACKEND_BASE_URL` / `VITE_SESSION_API_KEY`, saves user overrides in the `openhands-agent-server-config` localStorage key, and must stay reachable even when the backend compatibility probe fails so users can recover from missing or wrong backend configuration.

- **SDK Dependency for Settings Persistence (PR #98)**: The settings persistence API changes depend on [software-agent-sdk PR #3060](https://github.com/OpenHands/software-agent-sdk/pull/3060) which adds:
  - `/api/settings` GET/PATCH with `X-Expose-Secrets: encrypted` header support
  - `/api/settings/secrets` CRUD endpoints for custom secrets
  - `OH_SECRET_KEY` environment variable for encryption
  
  **IMPORTANT**: Until PR #3060 is merged and released, `npm run dev` must use `OH_AGENT_SERVER_GIT_REF=main` to point at the SDK main branch (or the feature branch), not a released PyPI version. The dev scripts now default to `main` for this reason. Once released, update `dev-safe.mjs` to use the minimum required version.

- README expectation: keep the first section as a concrete, chronological from-scratch quickstart for running this frontend against a real `openhands-agent-server` (clone, install uv, optional `.env`, run `npm run dev`).
- Keep README user-focused and move contributor/developer-specific workflows (`dev:safe`, mock mode, detailed env vars/build-test notes) into `DEVELOPMENT.md`.
- `scripts/dev-safe.mjs` uses `uvx` for temporary agent-server installation — no permanent `uv tool install` needed. Environment variables (highest precedence first):
  - `OH_AGENT_SERVER_LOCAL_PATH` — absolute path to a local `software-agent-sdk` checkout. Runs the local checkout via `uvx` with `--with-editable` for `openhands-sdk`/`openhands-tools`/`openhands-workspace` and `--reinstall` for `openhands-agent-server`, so SDK edits are picked up on restart. Highest precedence.
  - `OH_AGENT_SERVER_GIT_REF` — git commit SHA or branch name (takes precedence over version)
  - `OH_AGENT_SERVER_VERSION` — specific PyPI version (e.g., "1.18.0")
  - `OH_SECRET_KEY` — secret key for settings encryption; uses a default value for local dev, override for production
  - Default: latest released version from PyPI
- `scripts/dev-safe.mjs` should fail fast if `uvx` cannot be spawned (for example missing PATH entries).
- `npm run dev` now runs the full stack with automation by default (via `dev:automation`). Use `npm run dev:minimal` for agent-server + Vite only.
- `scripts/dev-with-automation.mjs` runs the full stack: agent-server, automation backend (both via uvx), Vite dev server, and ingress proxy. Uses a standalone ingress proxy (`scripts/ingress.mjs`) to route traffic:
  - `/api/automation/*` → automation backend (:18001)
  - `/api/*`, `/sockets`, etc. → agent server (:18000)
  - `/*` (default) → Vite dev server (:3001)
  - Environment variables: `PORT` (ingress port, default: 8000), `OH_AUTOMATION_GIT_REF` (default: `main`)
  - Access points: `http://localhost:8000/` (main UI), `http://localhost:8000/api/automation/docs` (API docs)
- `scripts/ingress.mjs` is a standalone HTTP reverse proxy that can be used independently to route traffic to multiple backends based on URL path prefix.
- `scripts/dev-safe.mjs` (now `npm run dev:minimal`) runs just agent-server + Vite without automation.
- Vite dev mode can black-screen on first load with `504 Outdated Optimize Dep` if core client-entry deps are not prebundled; keep `react`, `react/jsx-runtime`, `react-dom/client`, and `react-router/dom` in `optimizeDeps.include`.
- Vercel deployment note: React Router builds for this repo must keep `build/client` intact on actual Vercel builds and include `presets: [vercelPreset()]` from `@vercel/react-router/vite`; flattening `build/client` during a Vercel build produces deployments with empty outputs (`routes: null`, no static files) and a production 404.

- The repo should include a root `LICENSE` file to satisfy the incubator-program requirements.
- OpenHands repo bootstrap files live under `.openhands/`:
  - `.openhands/setup.sh` installs `uv` (via `curl -LsSf https://astral.sh/uv/install.sh | sh`) if not present, installs frontend dependencies with `npm ci` when needed, creates `.env` from `.env.sample` if missing, appends `VITE_WORKING_DIR` for this repo when unset, and generates `src/i18n/declaration.ts` via `npm run make-i18n`.
  - `.openhands/pre-commit.sh` mirrors the repo's local quality gate with `npm run lint && npm run test`.
- GitHub PR-review automation should stay aligned with the current OpenHands repo conventions: keep the review workflow at `.github/workflows/pr-review-by-openhands.yml`, keep the companion `.github/workflows/pr-review-evaluation.yml`, auto-run on newly opened non-draft PRs and `ready_for_review` events from established contributors, still support the `review-this` label / `openhands-agent` / `all-hands-bot` reviewer triggers, use the OpenHands app LLM proxy defaults, and use the dual-trigger pattern (`pull_request` for same-repo PRs, `pull_request_target` for forks) so workflow changes can self-verify without widening fork secret exposure.
- The repo now includes `.agents/skills/custom-codereview-guide.md`, adapted from `OpenHands/software-agent-sdk`, to force PR reviews to always leave either an APPROVE or COMMENT review instead of silently finishing with no review object.

- HeroUI rollback / migration notes:
  - The attempted HeroUI v3 upgrade changed global theme wiring and homepage design tokens enough that the repo currently prefers `@heroui/react@2.8.10` until a broader visual validation pass is done.
  - Keep the v2 Tailwind integration active via `@plugin '../hero.ts'` in `src/tailwind.css` and source HeroUI classes from `node_modules/@heroui/theme/dist/**/*`.
  - The settings UI currently relies on the v2 `Autocomplete` + `AutocompleteItem`/`AutocompleteSection` APIs in `settings-dropdown-input.tsx` and `model-selector.tsx`; a future v3 retry will need to replace those controls again.
- Library i18n is now namespace-scoped under `openhands`: `src/i18n/index.ts` exports `OPENHANDS_I18N_NAMESPACE`, `translationResources`, and `waitForI18n()`, `scripts/make-i18n-translations.cjs` emits `public/locales/<lang>/openhands.json`, standalone `src/entry.client.tsx` explicitly awaits i18n init, and host apps can register bundles via the `@openhands/agent-canvas/i18n` subpath export.

- Route decoupling note: `src/components/` should stay free of direct `react-router` imports. Route state now flows through `src/context/navigation-context.tsx`, the standalone app bridges router state with `src/routes/react-router-navigation-provider.tsx`, and link-like UI should use `src/components/shared/navigation-link.tsx`.
- Test helper note: `test-utils.tsx` now wraps renders with a default `NavigationProvider` (`currentPath: "/"`, `conversationId: "test-conversation-id"`). Navigation-sensitive tests can override that via `renderWithProviders(..., { navigation: { ... } })`.
- CSS isolation for embeddable/hosted use now relies on a scoped wrapper attribute: all bundled CSS is prefixed under `[data-agent-server-ui]` via `postcss-prefix-selector` in `vite.config.ts`, with selector exceptions handled by `transformAgentServerUISelector()` in `src/styles/agent-server-ui-style-scope.ts`. That transform must remap global selectors like `:root`, `html`, and `body` directly onto the scoped shell instead of emitting impossible descendants such as `[data-agent-server-ui] :root`.
- Public embedding entry points should use `AgentServerUIProviders` (scoped root on by default) or `AgentServerUIRoot` for manual control. The standalone app already renders its own scoped root in `src/root.tsx`, so `src/entry.client.tsx` must pass `withStyleRoot={false}` to avoid nesting duplicate shells. Keep `AgentServerUIRoot` and the scoping constants re-exported from `src/lib/index.ts` so library consumers can customize the host wrapper without reaching into private paths.
- `AgentServerUIRoot`'s themed inner wrapper must set a default `color: var(--foreground)` in addition to the `dark` / `data-theme` markers; otherwise inherited text and `currentColor` SVG icons fall back to dark browser defaults after CSS scoping, causing dark-on-dark regressions on pages like the home screen.
- Theme/customization tokens for the embedded shell are exposed as `--oh-*` CSS variables. Override them through `styleOverrides`, `style`, or host CSS targeting `[data-agent-server-ui]`; Tailwind theme tokens in `src/tailwind.css` should continue to reference those variables with `@theme inline` so host apps can restyle the UI without reworking component class names.
- Regression coverage for the CSS isolation work lives in `__tests__/agent-server-ui-providers.test.tsx`, `__tests__/agent-server-ui-style-scope.test.ts`, and the browser-level `tests/css-isolation.spec.ts` Playwright test.


- Action grouping in the chat stream:
  - `src/components/v1/chat/group-events.ts` folds runs of consecutive groupable events (regular `ActionEvent`/`ObservationEvent` cards, but not `FinishAction`, `ThinkAction`, `PlanningFileEditorObservation`, `TaskTrackerObservation`, hooks, errors, or message events) into single `RenderedItem` groups. The threshold lives in `EVENT_GROUP_MIN_SIZE` (currently 2, so even pairs of back-to-back actions get folded).
  - `EventGroup` (`src/components/v1/chat/event-message-components/event-group.tsx`) is the collapsible header that wraps each run. Default state is collapsed; the header shows `EVENT_GROUP$ACTIONS_COMPLETED` (with a success check) when the group is done, or `EVENT_GROUP$ACTIONS_PROGRESS` plus the currently-running action's title (from `getEventContent`) while a member `ActionEvent` has not yet been replaced by its observation in the UI events array. Expanding renders the original `EventMessage`s verbatim so each card still expands the way it did before.
  - Agent thoughts attached to an `ActionEvent` (`event.thought`) are hoisted out of groups: `groupEvents` emits a third `RenderedItem` kind `"thought"` whenever a groupable event carries (or, for an observation, originates from) a non-empty thought, flushing the current run and starting a new one. `messages.tsx` renders that item via `ThoughtEventMessage` and passes `suppressThought` to `EventMessage` so the inline thought isn't duplicated inside the group's expanded content. `ThinkAction` is excluded from this hoisting because the thought IS its action body and is rendered through its own codepath.
  - `src/components/v1/chat/messages.tsx` is the only consumer; the grouping is transparent to upstream code. Coverage lives in `__tests__/components/v1/chat/group-events.test.ts` (pure logic, including thought hoisting) and `__tests__/components/v1/chat/event-message-components/event-group.test.tsx` (rendering/interaction).


- Library packaging notes:
  - Public npm entrypoints now come from `src/index.ts` → `src/lib/index.ts`, with domain barrels under `src/components/{conversation,terminal,browser,files,settings,sidebar}/index.ts`.
  - `npm run build` remains the standalone app build (`react-router build`), while `npm run build:lib` runs `vite build` in library mode plus `tsc -p tsconfig.lib.json` to emit `.d.ts` files into `dist/`.
  - The library build relies on `vite.config.ts` with `BUILD_LIB=true`, preserved modules in `dist/`, and package `exports` entries that map root/subpaths to `dist/**/*.js` plus matching declaration files.
  - Declaration emit needs `src/library-env.d.ts` and the narrowed `tsconfig.lib.json`; broad `src/**/*.tsx` declaration builds pulled in route-only files and missed `?react`/window globals.
