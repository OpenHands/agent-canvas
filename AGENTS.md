# Repository Notes

## General

- This repository is a near-direct port of the OpenHands frontend, adapted to talk straight to `software-agent-sdk` / `agent_server` without the usual OpenHands app backend.
- Frontend API adaptation lives mainly in `src/api/`:
  - `option-service` fabricates an OSS web-client config and reads models/providers through `@openhands/typescript-client` LLM endpoints.
  - `settings-service` uses `@openhands/typescript-client` settings APIs for persistence; reads schemas from `/api/settings/agent-schema` and `/api/settings/conversation-schema`, fetches settings with optional `X-Expose-Secrets: encrypted` header for conversation start payloads, and saves settings via PATCH with diffs.
  - `agent-server-conversation-service`, `event-service`, `agent-server-git-service`, and `skills-service` route local agent-server access through `@openhands/typescript-client` rather than direct HTTP calls.
- Supported env vars for deployment:
  - `VITE_BACKEND_BASE_URL` for the agent server base URL.
  - `VITE_SESSION_API_KEY` for optional session auth.
  - `VITE_WORKING_DIR` for the default workspace path sent when starting conversations.
  - `VITE_WORKER_URLS` as a comma-separated list of browser worker URLs if you want the Browser tab to probe exposed app hosts.
  - `VITE_ENABLE_BROWSER_TOOLS=false` to omit `BrowserToolSet` from new conversation payloads.
  - `VITE_LOAD_PUBLIC_SKILLS=false` to disable loading public skills from the OpenHands extensions marketplace (https://github.com/OpenHands/extensions). Defaults to true (opt-out).
- Default working-dir fallback is now the relative path `workspace/project` (exported as `DEFAULT_WORKING_DIR` from `src/api/agent-server-config.ts`); git-path heuristics and the default PLAN preview path should reuse that constant instead of hardcoding `/workspace/project`.
- The UI keeps most OpenHands routes/layout intact, but hosted-only behavior (org, account management, integrations) has been removed via the fabricated OSS config because there is no separate app backend.
- Verification command: `npm run typecheck && npm run build`.
- GitHub automation now includes `.github/workflows/ci.yml` for `npm ci`, `npm test`, and `npm run build`, plus `.github/dependabot.yml` with weekly npm/github-actions updates gated by a 7-day cooldown.

## Runtime Services in Dev Stacks

- When the agent-canvas dev launchers (`npm run dev` / `dev:minimal` / the published `agent-canvas` binary) start a stack, they set a `VITE_RUNTIME_SERVICES_INFO` env var on the frontend describing which services are running and how the agent should reach them. The frontend forwards this verbatim as `AgentContext.system_message_suffix` on every `POST /api/conversations`, so conversations land with a `<RUNTIME_SERVICES>` block appended to the system prompt.
- The block lists URLs **from the agent's point of view**:
  - The Agent Server is always reachable as `http://localhost:<port>` from inside the sandbox — but that is _you_, not the automation backend.
  - Host-side services (ingress, Vite, automation) are reachable as `http://localhost:<port>`.
- Agents should treat the `<RUNTIME_SERVICES>` block as authoritative: don't hardcode `localhost:8000` for "the automation server", and don't probe random ports trying to discover services. If the block says automation is not running, skip `/api/automation` calls; otherwise use the listed `url_from_agent` + `api_prefix` (default `/api/automation`) and the `X-API-Key: $OPENHANDS_AUTOMATION_API_KEY` header.
- The launcher → frontend → suffix plumbing is:
  - `scripts/dev-safe.mjs::buildRuntimeServicesInfo()` — pure helper that constructs the info object.
  - `scripts/dev-with-automation.mjs::buildAutomationRuntimeServicesInfo()` — wraps it with automation details; called from both Vite spawn (`startVite`) and the static build (`static-build.mjs`).
  - `src/api/agent-server-adapter.ts::buildRuntimeServicesSystemSuffix()` reads `VITE_RUNTIME_SERVICES_INFO` and renders the `<RUNTIME_SERVICES>` markdown block; `createAgentFromSettings()` attaches it to `agent_context.system_message_suffix` when present.

### `VITE_RUNTIME_SERVICES_INFO` shape

The env var is a JSON string of:

```json
{
  "mode": "dev:automation",
  "services": {
    "agent_server": {
      "description": "The OpenHands Agent Server this agent is running inside. ...",
      "url_from_agent": "http://localhost:18000"
    },
    "ingress": {
      "description": "Unified entry point. Routes /api/automation/* ...",
      "url_from_agent": "http://localhost:8000"
    },
    "frontend": {
      "kind": "vite",
      "description": "Vite dev server hosting the agent-canvas frontend.",
      "url_from_agent": "http://localhost:3001"
    },
    "automation": {
      "description": "OpenHands Automations service. All routes are mounted under '/api/automation'. Authenticate with header 'X-API-Key: $OPENHANDS_AUTOMATION_API_KEY'.",
      "url_from_agent": "http://localhost:18001",
      "api_prefix": "/api/automation",
      "docs_url": "http://localhost:18001/api/automation/docs",
      "openapi_url": "http://localhost:18001/api/automation/openapi.json",
      "auth_env_var": "OPENHANDS_AUTOMATION_API_KEY"
    }
  }
}
```

All keys under `services` are optional and omitted when the corresponding service isn't running. `frontend.kind` is `"vite"` for dev launchers running the Vite dev server and `"static"` for stacks serving a pre-built `build/` directory (`dev:static`, the published `agent-canvas` binary). `services.vite` is accepted as a legacy alias for `services.frontend` by the renderer.

### Example `<RUNTIME_SERVICES>` block (dev with automation)

```
<RUNTIME_SERVICES>
You are running inside an agent-canvas dev stack started in 'dev:automation' mode.
The following services are reachable from your sandbox. URLs are written
from your point of view (i.e., as you should curl/fetch them).

* Agent Server (you): http://localhost:18000
    The OpenHands Agent Server this agent is running inside. Tool calls (terminal, file_editor, browser, etc.) execute here.
* Ingress: http://localhost:8000
    Unified entry point. Routes /api/automation/* to the automation backend, /api/* and /sockets to the agent-server, and /* to the frontend.
* Frontend: http://localhost:3001
    Vite dev server hosting the agent-canvas frontend.
* Automation backend: http://localhost:18001
    OpenHands Automations service. All routes are mounted under '/api/automation'. Authenticate with header 'X-API-Key: $OPENHANDS_AUTOMATION_API_KEY'.
    Docs:    http://localhost:18001/api/automation/docs
    OpenAPI: http://localhost:18001/api/automation/openapi.json
    Auth:    header 'X-API-Key: $OPENHANDS_AUTOMATION_API_KEY'

Trust this block over guessing: do not assume any other URLs are running.
In particular, http://localhost:18000 inside your sandbox is the Agent Server
you are running inside of — NOT the automation backend.
</RUNTIME_SERVICES>
```

## Visual Snapshot Testing

- Snapshot tests live in `tests/e2e/snapshots/` and compare screenshots against baselines stored as GitHub Actions artifacts (NOT in git).
- **Baseline storage**: Baselines are stored as the `snapshot-baselines` artifact (90-day retention), uploaded on every push to `main`. They are never committed to the repository — `tests/e2e/__snapshots__/` is gitignored. The artifact is found by querying the artifacts API by name (not by workflow run status) so only runs that actually uploaded the artifact are matched.
- Run locally with `npm run test:e2e:snapshots`; generate/update snapshots with `npm run test:e2e:snapshots:update`.
- **CI workflow (`snapshot-tests.yml`)**:
  - **On `main`**: Runs `test:e2e:snapshots:update`, uploads `tests/e2e/__snapshots__/` as the `snapshot-baselines` artifact (90 days).
  - **On PRs**: Downloads the latest `snapshot-baselines` artifact, runs `test:e2e:snapshots` against it, generates current snapshots via `test:e2e:snapshots:update`, then posts a fresh PR comment (old comment is deleted first so image URLs always point to the current run). Changed snapshots are shown in a side-by-side expected/actual/diff table; new snapshots show the full screenshot. Images are force-pushed to a dedicated `snapshot-artifacts/pr-<N>` orphan branch (NOT the PR branch) so required CI checks are never invalidated. URLs are `raw.githubusercontent.com/<owner>/<repo>/<sha>/changed/...` or `.../new/...`. Triggers: `opened`, `synchronize`, `reopened`, `labeled`, `unlabeled`.
  - **Force-regenerate baselines**: Trigger the `Snapshot Tests` workflow manually with `force_update=true`.
- **PR comment**: `tests/e2e/snapshots/scripts/post-snapshot-comment.mjs` posts a fresh comment (`<!-- snapshot-test-report -->` marker) with collapsed `<details>` sections — 🔴 Changed (side-by-side expected/actual/diff), 🆕 New (full screenshot), ✅ Unchanged (list of names).
- **Critical ordering note**: Playwright clears `test-results/` at the start of every new run. The workflow runs two Playwright passes: (1) `test:e2e:snapshots` (comparison, writes `*-diff.png`), then (2) `test:e2e:snapshots:update` (regenerates baselines, clears `test-results/`, no diffs written). The "Save comparison test-results" step copies `test-results/` to `/tmp/comparison-results` between these two passes and passes it as `COMPARISON_RESULTS_DIR` to the comment script, which reads `TEST_RESULTS_DIR` from that env var. Without this step all snapshots appear "unchanged" because the diff files are gone.
- **Acknowledging intentional changes**: If snapshots changed on purpose (UI redesign, etc.), add the `update-snapshots` label to the PR. This causes: (1) the CI failure step to be skipped so the check passes, (2) the comment status to flip to ✅ with a note that changes are acknowledged, (3) the `labeled` trigger fires a fresh CI run automatically so no manual re-run is needed. Removing the label re-enables the failure. When the PR merges, the main-branch run uploads the new screenshots as the updated baseline — no separate "regenerate on main" step required.
- **Viewing diffs**: On failure, Playwright generates `*-actual.png`, `*-expected.png`, and `*-diff.png` in `test-results/`. Run `npx playwright show-report` to view the HTML report. The PR comment also embeds these images directly.
- **Bootstrap**: When no `snapshot-baselines` artifact exists on main yet, all snapshots are classified as "🆕 New" and CI passes. The first main-branch run after this state uploads the initial artifact.
- **Image branch cleanup**: the `snapshot-artifacts/pr-<N>` branch is deleted automatically by the `cleanup-snapshot-artifacts` job in `pr-artifacts.yml` when the PR is closed (merged or abandoned). No manual cleanup needed.
- Key patterns for writing snapshot tests:
  - Use `setupMocks(page, showConsentModal)` helper to configure API mocks consistently.
  - Use `dismissConsentModal(page)` after navigation to dismiss the analytics modal.
  - Use `animations: "disabled"` and `maxDiffPixelRatio: 0.01` in `toHaveScreenshot()` to reduce flakiness.
  - Target specific elements via `page.getByTestId()` rather than full-page screenshots when possible.
  - **Hidden checkbox pattern**: `SettingsSwitch` renders `<input hidden data-testid="...">`. Both `toBeVisible()` and `click({ force: true })` fail on hidden inputs (no layout dimensions). Use the enclosing `<label>`: `page.locator('label:has([data-testid="my-toggle"])').click()` — the browser's label→control activation fires `onChange` on the hidden input.
  - **HeroUI Autocomplete testId forwarding**: `Autocomplete` does NOT forward `data-testid` to any DOM element. Use `getByRole("combobox", { name: /label text/ })` to locate/assert on dropdown fields generated by `SchemaField`.
  - **SdkSectionPage early return**: `SdkSectionPage` returns a plain `<p>` (no `data-testid` wrapper) when `filteredSchema.sections.length === 0`. Always ensure the mock schema includes the section the page requests. The condenser section is in `agent_settings_schema` (default source), not `conversation_settings_schema`.
- **Composing tests**: Use `test.step()` for iterative snapshots within a single test, or extract helper functions (like `navigateToSettings(page)`) to share setup across tests. For heavier reuse, use Playwright fixtures via `test.extend()`.
- Snapshots are organized by `{snapshotDir}/{testFilePath}/{projectName}/{arg}.png` (configured in `playwright.config.ts`).
- **Conversation page snapshot tests**: The dev server uses MSW service workers for API mocking. For conversation-page tests, rely on MSW's pre-defined mock conversations (IDs "1", "2", "3" in `src/mocks/conversation-handlers.ts`) rather than fighting Playwright route interception. MSW's service worker intercepts requests before Playwright `page.route()` can; Playwright route interceptors only see requests that escape the service worker. Stub WebSocket via `page.addInitScript()` and inject events into the Zustand store via the exposed `window.__OH_EVENT_STORE__` API. Use `test.describe.configure({ mode: "serial" })` for conversation tests since the WebSocket stub + heavier page setup can cause intermittent failures in parallel mode.
- **Baseline generation for CI**: Baselines generated locally will NOT match CI (different OS, fonts, rendering). Baselines are regenerated automatically on every push to `main`. After adding new snapshot tests, open a PR — the new snapshots will be shown as "🆕 New" in the PR comment and become the baseline when the PR merges. To force-refresh baselines from main without waiting for a code push, trigger the "Snapshot Tests" workflow manually with `force_update=true`.
- **Mock conversation timestamps must ALL be `now`-relative**: `src/mocks/conversation-handlers.ts` defines mock conversations sorted by `updated_at` descending in the sidebar. Every conversation's `created_at`/`updated_at` must use `now - X * days` (relative to module-load time), never a fixed absolute date like `PAGINATION_BASE_TIME`. Mixing the two strategies causes a sort-order crossover as real time passes — the fixed-date conversation ages past a relative one and they swap positions, breaking every snapshot that includes the sidebar. `PAGINATION_BASE_TIME` is kept only for internal event timestamps used by pagination tests; conversation listing timestamps are decoupled from it.
- **MSW handler state is PAGE-level JS, not service-worker state**: In MSW 2.x browser mode the request handlers (including mutable Maps like `automations`) are compiled into the client bundle and run in the main thread. `page.reload()` re-initialises all module-level state (e.g. `const automations = new Map(...)` runs fresh on every page load). Tests that need to show an "empty list" state must NOT call `page.reload()` after deleting items. Instead: make the DELETE fetches from `page.evaluate()` (which DO go through MSW), then call `window.__TEST_INVALIDATE_QUERIES__()` (exposed in mock mode by `entry.client.tsx`) to trigger React Query's cache invalidation in-place without a reload. Example: the automations empty-state snapshot test in `tests/e2e/snapshots/automations.snapshot.spec.ts`.

## Live End-to-End Test Framework

- The live QA path is intentionally separate from ordinary mocked Playwright coverage. If ordinary browser tests are added, keep them outside `tests/e2e/live/` so `playwright.config.ts` can run them while ignoring `**/live/**`; live LLM-backed tests must never run as part of `npm run test:e2e`.
- Live tests live under `tests/e2e/live/` and are run only through `npm run test:e2e:live`, which uses `playwright.live.config.ts`. Keep the spec names descriptive; the primary conversation smoke test is `tests/e2e/live/real-agent-server-conversation.spec.ts`.
- `npm run test:e2e:live` loads `.env` through Node's `--env-file-if-exists` flag and invokes `tests/e2e/live/scripts/run-live-e2e.mjs`. The runner validates the required local environment, explains missing credentials/prerequisites, and then runs `playwright test --config=playwright.live.config.ts`. Use `npm run test:e2e:live -- --check` to validate local setup without running the test, and pass Playwright flags after `--` (for example `npm run test:e2e:live -- --headed`).
- Local live E2E requires one LLM credential: `LIVE_E2E_LLM_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `LLM_API_KEY`. Optional overrides are `LIVE_E2E_LLM_BASE_URL`, `LIVE_E2E_LLM_MODEL`, `LIVE_E2E_SESSION_API_KEY`, `LIVE_E2E_BACKEND_URL`, and `LIVE_E2E_FRONTEND_PORT`. The local runner prints which variables are missing without printing secret values.
- Live-test-only helpers belong under `tests/e2e/live/utils/`. The current helper module is `tests/e2e/live/utils/agent-server-conversation.ts`; do not put live-only helpers in the shared `tests/e2e/support/` directory.
- `playwright.live.config.ts` starts the real local Agent Server/UI stack via `npm run dev:minimal`, not MSW mocks. It uses `LIVE_E2E_SESSION_API_KEY` when set, otherwise generates a per-run random session key and passes it through `SESSION_API_KEY`, `OH_SESSION_API_KEYS_0`, and `VITE_SESSION_API_KEY`; specs that need direct backend requests must inject `X-Session-API-Key` only for the configured backend origin through `routeBackendSessionApiKey(page)`, never through global Playwright `extraHTTPHeaders`. Live tests default to frontend port `3101` and Agent Server `http://127.0.0.1:18100` so they do not accidentally reuse a normal local dev stack.
- `tests/e2e/live/utils/agent-server-conversation.ts` configures the running Agent Server before each live conversation by PATCHing `${LIVE_E2E_BACKEND_URL ?? "http://127.0.0.1:18100"}/api/settings` with LLM settings and low-risk conversation settings. LLM credentials are read from `LIVE_E2E_LLM_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `LLM_API_KEY`; CI defaults use `LIVE_E2E_LLM_BASE_URL` (default `https://llm-proxy.app.all-hands.dev`) and `LIVE_E2E_LLM_MODEL` (default `openhands/claude-haiku-4-5-20251001`).
- The live conversation test should stay cheap and as deterministic as possible while still exercising one real tool call: it asks the model to run the exact `EXPECTED_BASH_COMMAND`, waits for the bash output token to appear outside the user's message in the UI, confirms a successful `ExecuteBashObservation`/`TerminalObservation` through the real Agent Server events API, and then waits for the final `EXPECTED_REPLY_TOKEN`. This exercises the real UI, Agent Server settings API, conversation creation, websocket/event path, terminal tool execution, and LLM response path. Because LLM behavior is not perfectly deterministic even at temperature 0, CI keeps one retry for live E2E; future live tests should document any expected variance and avoid prompts that require unnecessary formatting obedience.
- Live E2E must not pollute analytics. `playwright.live.config.ts` starts the app with `VITE_DO_NOT_TRACK=1`; the live helper seeds local storage with telemetry/analytics opt-out values before app code runs; and each live spec should install `guardAgainstPostHogRequests(page)` before navigation so any attempted request to `*.posthog.com` or `z.openhands.dev` is blocked locally and fails the test.
- Live Playwright videos are intentionally recorded for PR QA debugging when `LIVE_E2E_RECORD_VIDEO=on` is set by CI; local default video mode is `retain-on-failure`. Do not add live tests that render API keys, tokens, secret values, or credential-bearing error messages in the browser. Screenshots should target a safe app/chat region such as `data-testid="chat-interface"` instead of `page.screenshot({ fullPage: true })`, and should apply `getLiveArtifactMask(page)` for text/field redaction; if a future live test must exercise sensitive UI, change that test/media path to redact the sensitive output or retain video only on failure.
- `.github/workflows/ci.yml` runs live E2E only at PR level: either manually via `workflow_dispatch` with a required `pr_number`, or from a same-repository PR carrying the `live-e2e` label. The live job must skip fork PRs before checking out PR code so LLM credentials and artifact-push tokens are never exposed to untrusted code. Do not broaden it to run on every PR push unless cost and credential policy are explicitly revisited.
- Keep live E2E secrets out of job-level `env`. The workflow should check whether credentials exist before checkout, but inject the LLM key only into the trusted step that actually runs the live test.
- The live job uploads the Playwright HTML report plus screenshot/video output as a GitHub Actions artifact, and also extracts the primary screenshot/video attachments. It converts the WebM recording to a GIF preview with `ffmpeg` so GitHub PR comments can inline the preview. Keep Playwright trace capture disabled for live tests because the setup flow sends LLM credentials to the Agent Server settings API, and traces can record request bodies. Failure messages around live Agent Server settings must not print response bodies from credential-bearing requests.
- Inline PR-comment media is stored as PR-only files under `.pr/live-e2e/<github_run_id>/` on the PR branch, not on a long-lived orphan media branch. The comment uses `raw.githubusercontent.com/<repo>/<artifact_commit>/.pr/live-e2e/...` URLs for the GIF and PNG so GitHub can render them inline. The WebM is linked as the full recording because GitHub comments do not reliably inline WebM.
- `.github/workflows/pr-artifacts.yml` owns two cleanup responsibilities: (1) `.pr/live-e2e/` — comments when `.pr/` artifacts exist and removes them after PR approval for same-repo PRs (fork PRs require manual cleanup); (2) `snapshot-artifacts/pr-<N>` — deletes the snapshot image orphan branch when the PR is closed (merged or abandoned), via the `cleanup-snapshot-artifacts` job triggered on `pull_request: [closed]`.
- The live reporting scripts live beside the live tests under `tests/e2e/live/scripts/`: `run-live-e2e.mjs`, `extract-live-e2e-media.mjs`, `render-live-e2e-report.mjs`, and `upsert-pr-comment.mjs`. Keep report/comment/local-runner logic there rather than in top-level `scripts/`, because these scripts are part of the live E2E framework.
- When changing any part of this framework — live workflow triggers, artifact publishing, `.pr` cleanup, live Playwright config, live test file layout, helper locations, local runner behavior, or report/comment scripts — update this `AGENTS.md` section in the same PR so future agents have the current operating model.

## Mock-LLM E2E Test Framework

- Mock-LLM tests live under `tests/e2e/mock-llm/` and exercise the complete stack — from the browser through the real agent-server to a scripted mock LLM server — without any real LLM credentials. Run locally with `npm run test:e2e:mock-llm`.
- **Production-fidelity launch**: The Playwright config (`playwright.mock-llm.config.ts`) starts the full `agent-canvas` stack via `bin/agent-canvas.mjs` — the same binary that `npx @openhands/agent-canvas` executes when users install the npm package. This means mock-LLM tests exercise the actual production path: pre-built static frontend + static-server.mjs + agent-server via uvx + automation backend via uvx + ingress proxy, all behind a single port.
- A pre-built `build/` directory is required. The Playwright webServer command runs `npm run build:app` when `build/index.html` is absent, but CI should run the build step explicitly for caching (`npm run build:app` in `.github/workflows/mock-llm-e2e.yml`).
- **Single ingress URL**: Tests use one URL for both the browser (`baseURL`) and backend API assertions (`BACKEND_URL`). The ingress proxy routes `/api/*` to the agent-server, `/api/automation/*` to the automation backend, and `/*` to the static frontend. Default ingress port for tests is `18300` (override via `MOCK_LLM_INGRESS_PORT` env var).
- **State isolation**: `OH_CANVAS_SAFE_STATE_DIR=.tmp/mock-llm-state` isolates test state from the user's real `~/.openhands/agent-canvas/` directory. The directory is cleaned before each test run.
- **Session API key**: A random key is generated per test run and passed to the stack via `SESSION_API_KEY` / `OH_SESSION_API_KEYS_0` / `VITE_SESSION_API_KEY`. The static server injects it into `index.html` at serve time so the frontend authenticates automatically.
- **Mock LLM server** (`tests/e2e/mock-llm/scripts/mock-llm-server.py`): Python HTTP server using openhands-sdk's `TestLLM` to return scripted tool-call + text trajectories. Supports admin API endpoints for dynamic trajectory management:
  - `POST /admin/reset` — reset to the default trajectory (terminal printf + text reply)
  - `POST /admin/trajectory/register` — register a named trajectory (JSON body: `{name, turns}` where each turn is `{tool_call: {name, arguments}}` or `{text: "..."}`)
  - `POST /admin/trajectory/activate` — activate a previously registered trajectory
- **Real automation backend**: The automation test uses the production automation backend (started by `bin/agent-canvas.mjs`), NOT a mock server. Terminal `curl` commands from the agent hit the automation API through the ingress proxy at the test's `BACKEND_URL` (default `http://localhost:18300`). Auth uses the `X-Session-API-Key` header matching the stack's session key. The `mock-automation-server.py` file still exists as a reference but is not used by current tests.
- **Test helpers** (`tests/e2e/mock-llm/utils/mock-llm-helpers.ts`): Exports `registerTrajectory()`, `activateTrajectory()`, `resetMockLLM()`, `ensureMockLLMProfile()`, etc.
- **Padding response for internal LLM call**: The agent-server makes an internal LLM call (condenser/skill-analysis) before the agent's main loop starts when skills are activated. This consumes one trajectory response. Automation tests prepend a throwaway `{ text: "" }` response as padding. The conversation test does NOT need this because its user message doesn't trigger skill activation.
- **Test specs**:
  - `mock-llm-conversation.spec.ts` — Creates LLM profile via UI, runs a conversation with a terminal tool call, verifies bash execution and agent reply.
  - `mock-llm-automation.spec.ts` — Full automation lifecycle: registers a trajectory (7 responses total — 4 for the main conversation + 3 for the automation run's spawned conversation) where the LLM creates a cron automation and dispatches a run via terminal `curl` commands to the real automation backend. Verifies: automation created with correct schedule, run reaches COMPLETED status with a conversation_id, automation appears on the `/automations` list page, detail page shows COMPLETED badge (`data-testid="run-status-icon-completed"`), and clicking the run's conversation link navigates to the correct `/conversations/{id}` page.
- Tests run serially (`workers: 1`, `mode: "serial"` per describe block). Files are discovered alphabetically so automation tests run before conversation tests; each spec is self-contained (automation test configures its own LLM profile via the settings API). The `afterEach` hook resets the mock LLM to its default trajectory so subsequent specs start fresh even when a preceding test fails.
- CI workflow: `.github/workflows/mock-llm-e2e.yml` runs on PRs with the `e2e-tests` label or on manual dispatch. It builds the frontend, starts the mock LLM server, runs the tests, and posts a PR comment with results.
- The custom `DoneMarkerReporter` writes `.mock-llm-markers/.tests-done` after all tests complete (before webServer teardown) so the CI wrapper can detect completion and kill the lingering teardown process.

## Additional Notes

- **Published binary auth fix**: When users install the npm package globally (`npm install -g @openhands/agent-canvas`) and run `agent-canvas`, the pre-built static frontend has a `VITE_SESSION_API_KEY` baked in at publish time that differs from the user's persisted runtime key (`~/.openhands/agent-canvas/session-api-key.txt`). The fix is to inject the runtime session key into `index.html` responses at serve time (not build time). `scripts/static-server.mjs` accepts a `--session-api-key <key>` flag and injects a tiny inline `<script>` before `</head>` that seeds the key into `localStorage['openhands-agent-server-config'].sessionApiKey` — only if no key is already stored (preserving user-set overrides). `scripts/dev-with-automation.mjs` and `scripts/dev-static.mjs` both pass `--session-api-key ${config.sessionApiKey}` when starting the static server.

- Direct `dependencies` and `devDependencies` in `package.json` are exact-pinned (no caret ranges); reproducible installs should use the committed `package-lock.json` plus `npm ci`, and targeted transitive fixes still belong in `overrides`.
- `package-lock.json` must also retain the optional peer entry for `node_modules/vite-tsconfig-paths/node_modules/typescript@5.9.3`; without that nested lock entry, clean `npm ci` installs on CI fail with `Missing: typescript@5.9.3 from lock file`.
- `npm test` now runs `npm run make-i18n` first so clean environments generate `src/i18n/declaration.ts` before Vitest loads aliased imports.
- `__tests__/vite-config.test.ts` should import `vite.config` directly under `// @vitest-environment node`; spawning plain `node -e 'import ./vite.config.ts'` is not portable across Node patch releases in CI.
- `vitest.setup.ts` must guard DOM-specific globals (`HTMLCanvasElement`, `HTMLElement`, `window`) because some suites run in the Node environment instead of jsdom.
- `__tests__/components/providers/posthog-wrapper.test.tsx` must wrap `PostHogWrapper` in a `QueryClientProvider`; the wrapper now reads its client from React Query context instead of importing the global singleton.
- WebSocket hook regression note: `__tests__/hooks/use-websocket.test.ts`'s `onClose` callback assertion was flaky against the shared MSW websocket server in CI; keep that single test on a deterministic stubbed `WebSocket` close path instead of relying on MSW close timing.
- Library i18n regression note: `__tests__/i18n/library-namespace.test.ts` imports `../../src/index`, which can take >5s under the full Vitest suite after `vi.resetModules()`. Keep an explicit per-test timeout (currently 15s) so the suite doesn't fail on slow workers.

- `src/components/shared/buttons/styled-tooltip.tsx` should keep HeroUI tooltip animations disabled in Vitest (`disableAnimation` when `import.meta.env.MODE === "test"`); otherwise full-suite runs can end with unhandled `window is not defined` rejections from `framer-motion` after jsdom teardown (seen via `recent-conversation` tests in CI).
- `__tests__/i18n/library-namespace.test.ts` imports the full library entry and can exceed Vitest's default 5s timeout under full-suite load; keep an explicit higher timeout on that case unless the test is substantially narrowed.

- `@openhands/typescript-client` should be pinned to a released git tag/version rather than an unreleased commit SHA; when agent-canvas needs new client API, release/tag the client first and then update the dependency to that tag. Released versions should include the typed clients, agent-server version compatibility helpers, `WorkspacesClient`, `ConversationClient.switchLLM`, and subpath exports for `client/http-client`, `events/remote-events-list`, and `workspace/remote-workspace` needed by the agent-canvas agent-server integration. `RemoteWorkspace.gitChanges`/`gitDiff` accept an optional `{ ref }` option; agent-canvas passes `'HEAD'` so the changes panel reflects working-tree + index versus the latest commit (i.e. staged + unstaged) instead of a diff against the upstream/default branch.
- The `@openhands/typescript-client` git dep must be expressed as a `git+https://github.com/...` URL in both `package.json` and the top-level dep entry of `package-lock.json`; the `github:OpenHands/...` shorthand normalizes to `git+ssh://` inside the lockfile, and Vercel's build environment has no GitHub SSH key, so an ssh-pinned lockfile makes Vercel fall back to a stale cached tarball and the bundler then fails with `[MISSING_EXPORT] ConversationClient/FileClient/SharedClient is not exported by .../dist/clients.js`. `scripts/vercel-install.sh` (wired up via `vercel.json`'s `installCommand`) defensively rewrites any leftover `git+ssh://git@github.com/` resolved URLs to `git+https://github.com/` and adds matching `git config --global url..insteadOf` aliases before invoking `npm ci`, so a future regression that re-introduces an ssh-pinned lockfile entry still builds on Vercel. See GitHub issue #384 for the original failure and PR #382 for the prior single-shot lockfile fix that this generalizes.

## API Access Rules

Two strict conventions govern every REST call in the frontend. Violations break CI
via `src/api/no-direct-agent-server-calls.test.ts`.

### Rule 1 -- Agent-server calls must use `@openhands/typescript-client`

All calls that target the local agent-server (`/api/*`, `/server_info`, `/sockets`)
**must** go through typed client classes from `@openhands/typescript-client`, **never**
raw `axios`, `fetch`, or the legacy shared `openHands` axios instance.

Available clients and their subpath imports:

- `ConversationClient` -- `@openhands/typescript-client/clients`
- `FileClient` -- `@openhands/typescript-client/clients`
- `VSCodeClient` -- `@openhands/typescript-client/clients`
- `ServerClient` -- `@openhands/typescript-client/clients`
- `HttpClient` -- `@openhands/typescript-client/client/http-client`
- `RemoteWorkspace` -- `@openhands/typescript-client/workspace/remote-workspace`
- `RemoteEventsList` -- `@openhands/typescript-client/events/remote-events-list`

Client options are always assembled via helpers in `src/api/agent-server-client-options.ts`:

- `getAgentServerClientOptions(overrides?)` -- for SDK client constructors
- `getAgentServerHttpClientOptions(overrides?)` -- for `HttpClient`-based callers

These helpers read host, session API key, and working directory from the active backend
registry and env config, so callers never hardcode URLs or auth tokens.

```ts
// CORRECT
const data = await new ConversationClient(
  getAgentServerClientOptions(),
).getConversation(id);
const file = await new FileClient(
  getAgentServerClientOptions(),
).downloadTextFile(path);

// WRONG -- raw axios/fetch calls fail the no-direct-agent-server-calls.test.ts guard
const data = await axios.get(`${host}/api/conversations/${id}`);
const data = await fetch(`/api/conversations/${id}`);
```

**Allowed exceptions** (files that may use axios directly for infrastructure reasons):

- `src/api/automation-service/automation-service.api.ts`
- `src/api/cloud/proxy.ts` -- the proxy envelope POST itself

### Rule 2 -- Cloud backend routes must go through `callCloudProxy`

Any call from the browser to the cloud backend (`app.all-hands.dev`) or a cloud
runtime sandbox (`*.prod-runtime.all-hands.dev`) **must** go through `callCloudProxy()`
in `src/api/cloud/proxy.ts`. These origins do not permit CORS from `localhost`;
`callCloudProxy` POSTs the request envelope to `/api/cloud-proxy` on the local
agent-server, which forwards it server-side.

```ts
import { callCloudProxy } from "../cloud/proxy";

// CORRECT -- cloud endpoint
const result = await callCloudProxy<ResponseType>({
  backend,
  method: "GET",
  path: `/api/v1/app-conversations/search?${params}`,
});

// CORRECT -- cloud runtime sandbox, auth via session key
const result = await callCloudProxy<ResponseType>({
  backend,
  method: "GET",
  hostOverride: buildHttpBaseUrl(conversationUrl),
  path: `/api/git/changes?path=${path}`,
  authMode: "session-api-key",
  sessionApiKey,
});

// WRONG -- direct fetch/axios to a cloud host is blocked by CORS in the browser
const result = await axios.get(`${backend.host}/api/v1/app-conversations`);
```

`callCloudProxy` key options:

- `backend` -- the cloud `Backend` object (provides host and bearer token)
- `hostOverride` -- override for runtime-sandbox calls; replaces `backend.host`
- `authMode` -- `"bearer"` (default, cloud) | `"session-api-key"` (runtime sandbox) | `"none"`
- `sessionApiKey` -- required when `authMode === "session-api-key"`

Standard cloud/local branch pattern used throughout the service layer:

```ts
if (getActiveBackend().backend.kind === "cloud") {
  return callCloudProxy({ backend: active, ... });
}
return new ConversationClient(getAgentServerClientOptions()).someMethod(...);
```

## No Magic Strings

Inline string literals that carry meaning (user-facing copy, identifiers, keys, route paths, storage keys, event types, query keys, env-var names, etc.) **must not** appear at call sites. Magic strings drift across files, defeat search/refactor, bypass `tsc`'s spell-checking, and ship untranslated UI text. The `i18next/no-literal-string` rule is set to `"error"` in `eslint.config.js` and CI fails on violations — do not silence it with `eslint-disable` unless the string is genuinely non-localizable (e.g. the `⌘↩` keyboard glyph in `plan-preview.tsx` / `conversation-tabs.tsx`).

### Rule 1 — User-facing strings go through i18n

Every visible string (button labels, headings, validation messages, `aria-label`, `title`, `alt`, toast copy, placeholders) **must** be routed through `react-i18next`'s `t()` keyed by an `I18nKey` enum member. Keys are declared once in `src/i18n/translation.json` with values for all 15 supported languages (see `src/i18n/index.ts::AvailableLanguages`), and `npm run make-i18n` regenerates `src/i18n/declaration.ts` + `public/locales/<lang>/openhands.json`. `npm run check-translation-completeness` fails CI if any key is missing a language.

```tsx
// CORRECT
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";

const { t } = useTranslation("openhands");
return (
  <button aria-label={t(I18nKey.CHAT$DISMISS_LABEL)}>
    {t(I18nKey.CHAT$DISMISS)}
  </button>
);

// WRONG -- ships English to every locale; flagged by i18next/no-literal-string
return <button aria-label="Dismiss">Dismiss</button>;
```

Key naming follows the existing `CATEGORY$IDENTIFIER` convention (see `src/i18n/translation.json` — common prefixes: `CHAT_INTERFACE$`, `SETTINGS$`, `COMMON$`, `BUTTON$`, `HOME$`, `MICROAGENT$`, etc.). Reuse an existing prefix; only introduce a new one when no sensible bucket exists.

Caveat: `eslint-plugin-i18next`'s recommended config catches JSX text children but NOT string-literal prop values like `aria-label="…"` or string ternaries passed to props. Even when the rule does not flag them, treat them as user-facing strings and route them through `t()`. If you find a hardcoded prop string, fix it; do not assume the linter's silence is approval.

### Rule 2 — Non-UI identifiers live in named constants, not inline literals

For strings the user never sees but the program reads (storage keys, event names, query keys, route paths, env-var names, header names, hardcoded paths, feature-flag identifiers), declare a single named constant in the closest module that owns the concept and import it everywhere else. Co-locate related constants in a tiny dedicated file (`*-keys.ts`, `*-constants.ts`) when more than two callers need them.

```ts
// CORRECT
const ONBOARDING_COMPLETED_KEY = "openhands-onboarded";
localStorage.setItem(ONBOARDING_COMPLETED_KEY, "true");

// CORRECT -- query keys go through SETTINGS_QUERY_KEYS / SECRETS_QUERY_KEYS / …
//            in src/hooks/query/query-keys.ts (enforced by no-restricted-syntax)
queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEYS.all });

// WRONG -- duplicated literal across files, no compile-time link, silent typo risk
localStorage.setItem("openhands-onboarded", "true");
queryClient.invalidateQueries({ queryKey: ["settings"] });
```

Already-named constants in this repo include `DEFAULT_WORKING_DIR` (`src/api/agent-server-config.ts`), `OPENHANDS_I18N_NAMESPACE` (`src/i18n/index.ts`), `BUNDLED_BACKEND_ID` (backend registry), and the `*_QUERY_KEYS` helpers in `src/hooks/query/query-keys.ts`. Reuse these instead of re-inlining the literal.

### Rule 3 — Discriminated-union tags use string-literal types, not bare strings

When a string is part of a discriminated union or enum-like set (event kinds, backend kinds, tab IDs, agent statuses, observation result statuses), the type itself should constrain the literal. Pass values typed against that union, not raw `string`, so callers get autocomplete and the compiler catches typos.

```ts
// CORRECT
type BackendKind = "local" | "cloud";
if (backend.kind === "cloud") { … }

// WRONG -- `backend.kind` typed as `string`; "clould" compiles fine
if (backend.kind === "clould") { … }
```

### Allowed exceptions

- Test fixtures (`__tests__/`, `tests/e2e/`) may use inline literals for setup data — tests are the boundary where strings stop being magic.
- Non-localizable display glyphs (keyboard shortcuts like `⌘↩`, currency symbols, etc.) may stay inline behind an `eslint-disable-next-line i18next/no-literal-string` comment. Keep the disable on the single offending line; never widen it to a file-level disable for a single glyph.
- Generated files (`src/i18n/declaration.ts`, `public/locales/<lang>/openhands.json`) are produced by `npm run make-i18n`; do not hand-edit, do not lint-target.

When adding code that needs a new string, decide up front which rule it falls under: if a user reads it → Rule 1; if the program reads it → Rule 2; if it tags a union → Rule 3. Do not commit code that fails any of these rules just because the linter happens not to catch it.

- Use `@openhands/typescript-client` classes directly for agent-server-backed REST/workspace/event/VS Code calls. Centralize host/session API key/working-directory option assembly through `src/api/agent-server-client-options.ts`; the backend fallback policy itself lives in `src/api/backend-registry/active-store.ts`.
- Local verification/build gotchas:
  - `npm run typecheck` assumes generated translation types exist; run `npm run make-i18n` first if `src/i18n/declaration.ts` is missing.
- Merge note: `main` removed the old project-management integration subcomponents/hooks and their related feature-flag/i18n surface. If a feature branch still keeps the top-level `/integrations` git-token page, retain `src/routes/git-settings.tsx` plus the git-provider token inputs/hooks, but do **not** blindly restore `src/components/features/settings/project-management/*` or the old integration mutation/query hooks unless the corresponding option types and i18n keys are also reintroduced.

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
- No frontend version guard: `OptionService.getConfig()` calls `loadAgentServerInfo()` which fetches `/server_info` only to (a) detect an unreachable agent server (renders the onboarding screen via `AgentServerUnavailableError`) and (b) cache `usable_tools` for tool gating. All advertised versions are accepted. The "manage backends" modal displays each local backend's `/server_info.version` in light text via the `BACKEND$VERSION_LABEL` translation key.
- Backend registry: there is no longer a separate "bundled" backend. On first read of the `openhands-backends` localStorage key (`raw === null`), `readStoredBackends()` seeds the registry with one default local backend (`makeDefaultLocalBackend()`, id `BUNDLED_BACKEND_ID = "default-local"`, host/api-key from `agent-server-config`). After that the seed is just an ordinary registered backend — users can rename or remove it like any other. `getEffectiveLocalBackend()` returns the first registered local, falling back to a synthesized default if the registry has no locals (used by API clients that need a baseline `local` target). The "Manage backends" modal and the BackendSelector dropdown both read from the single registered list, so the seeded default appears in both without any special-casing.
- Shared `Dropdown` open behavior: when the menu opens, it clears the input/search text so callers can show the current selection via `placeholder` while still rendering the full option list. Generic dropdown tests should not expect the selected label to remain in the input after reopening unless the parent explicitly controls that display.
- `useLoadOlderEvents` needs ref-based `isLoading` / `hasMore` guards in addition to React state because `ChatInterface` can trigger pagination from `onScroll`, `onWheel`, and the no-overflow effect in the same tick; closure-based state alone allows duplicate page requests.
- `ChatInterface` continuity tests should assert that conversation messages render without the full `chat-messages-skeleton`, not that `data-testid="loading-spinner"` is absent: the lazy older-events indicator reuses the shared `LoadingSpinner` component and legitimately renders that inner test id while history backfill is running.
- `useConversationHistory` now mirrors the older-events pagination fallback when the first page is exactly `INITIAL_HISTORY_PAGE_SIZE`: treat `next_page_id` **or** a full page as `hasMore`, so older agent-server variants that omit `next_page_id` still allow one more backfill request. The hook and `useLoadOlderEvents` also defensively reject mocked/malformed `page.items` responses before reversing them.

- `/server_info` tool capability metadata from `software-agent-sdk` PR #3028 ended up shipping as `usable_tools` (not `available_tools`). Frontend browser-tool gating should key off `usable_tools`, and still default to allowing tools when the server does not advertise tool metadata.

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
- Auth modes for `agent-canvas` (dev and production):
  - **Local mode** (default, no `--public` flag): A session API key is auto-generated and persisted to `~/.openhands/agent-canvas/session-api-key.txt`. The key is baked into the Vite dev server via `VITE_SESSION_API_KEY` or injected into static builds via `static-server.mjs --session-api-key`. Users never need to paste a key.
  - **Public mode** (`--public` flag): Requires `LOCAL_BACKEND_API_KEY` env var. The key is used as the agent-server session key (`OH_SESSION_API_KEYS_0`) but is NOT baked into the frontend (no `VITE_SESSION_API_KEY`, no `--session-api-key` to static-server). The frontend detects a 401 from `/server_info` via `isAgentServerAuthError()` and shows `ApiKeyEntryScreen` (`src/components/features/backends/api-key-entry-screen.tsx`). The screen reuses `BackendForm` with the host pre-filled (read-only) and prompts for the API key. On submit, the key is persisted to `localStorage['openhands-agent-server-config']` and the page reloads.
  - Dev usage: `LOCAL_BACKEND_API_KEY=my-secret npm run dev -- --public`
  - Production usage: `LOCAL_BACKEND_API_KEY=my-secret npx @openhands/agent-canvas --public`
  - The `--public` flag is supported by both `scripts/dev-with-automation.mjs` (parsed in `parseArgs()`, propagated via `config.isPublic`) and `bin/agent-canvas.mjs` (passed as `isPublic` to `main()`).
  - The 401 detection lives in `src/api/agent-server-compatibility.ts` (`isAgentServerAuthError()`), and the gate is in `src/root.tsx`'s `App` component, between the `AgentServerUnavailableError` check and the `<Outlet />` render.
  - **Key rotation resilience (non-public):** When `VITE_SESSION_API_KEY` is baked in and differs from the stored key in `openhands-agent-server-config.sessionApiKey` (localStorage), `syncBakedSessionApiKey()` (called from `readStoredBackends()` at module init) overwrites the stale stored key. Without this sync, `getConfiguredSessionApiKey()` returns the stale localStorage value (which takes priority over the env fallback), poisoning the backend registry seed via `makeDefaultLocalBackend()` and causing 401s from `loadAgentServerInfo()`. The `static-server.mjs` injection script also always overwrites when the key differs (changed from `if(!_c.sessionApiKey)` to `if(_c.sessionApiKey!==<runtime_key>)`). E2E coverage: `tests/e2e/mock-llm/mock-llm-auth-modes.spec.ts`.
- Backend/footer actions that launch modals from inside a dropdown or popover should intercept `onMouseDown` to keep the menu mounted, then perform the actual open on `onClick`. Current examples: `Add backend` / `Manage backends` in `src/components/features/backends/backend-selector.tsx`, plus the mirrored workspace-footer buttons in `src/components/features/conversation-panel/new-conversation-button.tsx`.
- `BackendSelector`'s cloud-org switch paths should never rethrow from the dropdown `onChange` handler: unexpected non-Axios failures need a generic error toast instead of an unhandled promise rejection, and the malformed `(cloud backend, null org)` self-heal path should fall back to the bundled backend if `/switch` fails.
- `NewConversationButton` should support keyboard dismissal (`Escape`) for its inline popover, while still keeping the popover open when its modal children (`FolderBrowserModal`, `ManageWorkspacesModal`) are active.

- README expectation: keep the first section as a concrete, chronological from-scratch quickstart for running this frontend against a real `openhands-agent-server` (clone, install prerequisites, optional `.env`, run `npm run dev`).
- Keep README user-focused and move contributor/developer-specific workflows (`dev:safe`, mock mode, detailed env vars/build-test notes) into `DEVELOPMENT.md`.
- `scripts/dev-safe.mjs` uses `uvx` for temporary agent-server installation — no permanent `uv tool install` needed. Environment variables (highest precedence first):
  - `OH_AGENT_SERVER_LOCAL_PATH` — absolute path to a local `software-agent-sdk` checkout. Runs the local checkout via `uvx` with `--with-editable` for `openhands-sdk`/`openhands-tools`/`openhands-workspace` and `--reinstall` for `openhands-agent-server`, so SDK edits are picked up on restart. Highest precedence.
  - `OH_AGENT_SERVER_GIT_REF` — git commit SHA or branch name (takes precedence over version)
  - `OH_AGENT_SERVER_VERSION` — specific PyPI version (e.g., "1.24.0")
  - `OH_SECRET_KEY` — secret key for settings encryption; auto-generated and persisted to `~/.openhands/agent-canvas/secret-key.txt` on first run (same file Docker uses), ensuring dev mode and Docker share the same key when both mount the same `~/.openhands` directory. Override with the env var to pin a specific key.
  - `SESSION_API_KEY` / `OH_SESSION_API_KEYS_0` / `VITE_SESSION_API_KEY` — session API key for agent-server authentication; auto-generated using `crypto.randomBytes(32)` if not set, passed to both agent-server (`OH_SESSION_API_KEYS_0`) and frontend (`VITE_SESSION_API_KEY`)
  - Default: released PyPI version `1.24.0` for agent-server SDK libraries

- Security: `scripts/dev-safe.mjs` and `scripts/dev-with-automation.mjs` auto-generate random API keys when needed and persist the defaults so static builds, localStorage, and restarted services stay in sync:
  - `SESSION_API_KEY` — 64-character hex (256-bit) for agent-server API authentication; persisted at `~/.openhands/agent-canvas/session-api-key.txt` unless overridden via env var
  - `AUTOMATION_LOCAL_API_KEY` — 64-character hex for automation backend auth; persisted at `~/.openhands/agent-canvas/automation-api-key.txt` unless overridden
  - `OH_SECRET_KEY` — 64-character hex (256-bit) for settings encryption; persisted at `~/.openhands/agent-canvas/secret-key.txt` unless overridden via env var. Same file used by `docker/entrypoint.sh`, so dev mode and Docker share the same key automatically.
- `scripts/dev-safe.mjs` should fail fast if `uvx` cannot be spawned (for example missing PATH entries).
- `npm run dev` runs the full local stack via `uvx` (agent-server + automation backend + Vite dev server + ingress proxy) with no Docker dependency. `npm run dev:static` does the same but serves a production build of the frontend instead of the Vite dev server.
- `scripts/dev-with-automation.mjs` runs the full stack: agent-server, automation backend (both via uvx), frontend server, and ingress proxy. It defaults to Vite when run directly, supports `--static` for an existing build, and supports `--dynamic` so wrappers that default static can opt back into Vite. Uses a standalone ingress proxy (`scripts/ingress.mjs`) to route traffic:
  - `/api/automation/*` → automation backend (:18001)
  - `/api/*`, `/sockets`, etc. → agent server (:18000)
  - `/*` (default) → frontend server (:3001), either Vite or static depending on launcher mode
  - Environment variables: `PORT` (ingress port, default: 8000), `OH_AUTOMATION_GIT_REF` (git ref, overrides default version), `OH_AUTOMATION_VERSION` (default: `1.0.0a3`), `AUTOMATION_LOCAL_API_KEY` (optional, use a fixed key; default: persisted generated key), `OH_AUTOMATION_API_KEY_PATH` (override the persisted default key path)
  - `scripts/check-sdk-version-sync.mjs` checks the released `openhands-automation` package against `versions.automationSdk` in `config/defaults.json`; that value may intentionally lag `versions.agentServer` while automation has not yet published a matching release.
  - Access points: `http://localhost:8000/` (main UI), `http://localhost:8000/api/automation/docs` (API docs)
  - Security: `AUTOMATION_LOCAL_API_KEY` defaults to a generated key persisted across restarts because static frontend builds bake it into `VITE_AUTOMATION_API_KEY`. Set the env var explicitly to rotate or pin it. The cipher key (`OH_SECRET_KEY`) is persisted at `~/.openhands/agent-canvas/secret-key.txt` (same file used by `docker/entrypoint.sh`); both modes share the same key automatically when using the same `~/.openhands` directory.
- `scripts/ingress.mjs` is a standalone HTTP reverse proxy that can be used independently to route traffic to multiple backends based on URL path prefix.
- `scripts/dev-safe.mjs` (now `npm run dev:minimal`) runs just agent-server + Vite without automation.
- Vite dev mode can black-screen on first load with `504 Outdated Optimize Dep` if core client-entry deps are not prebundled; keep `react`, `react/jsx-runtime`, `react-dom/client`, and `react-router/dom` in `optimizeDeps.include`.
- Bundle/dev-graph hygiene (Tier 1 cleanup landed):
  - `src/i18n/translation.json` (~1 MB) is imported only by `src/i18n/resources.ts`, which `src/i18n/index.ts` re-exports as `translationResources` for the `@openhands/agent-canvas/i18n` subpath. The re-export is a `export … from` plus `/* @__PURE__ */` annotation, so rollup drops the JSON from the app build (the prod `custom-toast-handlers` chunk went from ~909 KB to ~74 KB). Do not move the JSON import back into `src/i18n/index.ts` — that immediately re-bundles all translations into every chunk that imports `i18n`.
  - The environment-switch overlay is split: lightweight store/triggers live in `components/features/backends/environment-switch-store.ts`; the React component lives in `environment-switch-overlay.tsx` (re-exports the store API for back-compat). Eagerly-mounted callers (e.g. `backend-selector.tsx`) MUST import trigger helpers from the store, not the overlay file. The overlay is `React.lazy`'d from `routes/root-layout.tsx`.
  - Other always-conditional UI is `React.lazy`'d to keep the root layout's eager graph small: `AnalyticsConsentFormModal`, `AlertBanner` (root-layout), `SettingsModal` (sidebar), `AgentServerConnectionForm` (root.tsx). Tests that assert on these mounted nodes need `await screen.findByTestId(...)` instead of `getByTestId(...)`.
  - The terminal tab (`components/features/terminal/terminal.tsx`) is `React.lazy`'d in `conversation-tab-content.tsx` alongside the other tabs, so xterm + addon-fit + xterm.css don't enter the conversation route's eager graph.
  - Avoid importing app code through `#/components/conversation-events/chat` or its `event-message-components/index.ts` barrel — they exist for `lib/index.ts` (npm subpath) consumers only. Internal callers use deep paths (`./messages`, `./event-message-components/<name>`, `./event-content-helpers/should-render-event`) so Vite dev doesn't fan out the barrel.
- Vercel deployment note: React Router builds for this repo must keep `build/client` intact on actual Vercel builds and include `presets: [vercelPreset()]` from `@vercel/react-router/vite`; flattening `build/client` during a Vercel build produces deployments with empty outputs (`routes: null`, no static files) and a production 404.

- The repo should include a root `LICENSE` file to satisfy the incubator-program requirements.
- OpenHands repo bootstrap files live under `.openhands/`:
  - `.openhands/setup.sh` installs `uv` (via `curl -LsSf https://astral.sh/uv/install.sh | sh`) if not present, installs frontend dependencies with `npm ci` when needed, creates `.env` from `.env.sample` if missing, appends `VITE_WORKING_DIR` for this repo when unset, and generates `src/i18n/declaration.ts` via `npm run make-i18n`.
  - `.openhands/hooks.json` registers `.openhands/hooks/on_stop.sh` as a Stop hook so OpenHands runs the local quality gate (`npm run lint` and `npm test`) before finishing.
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
- Regression coverage for the CSS isolation work lives in `__tests__/agent-server-ui-providers.test.tsx`, `__tests__/agent-server-ui-style-scope.test.ts`, and the browser-level `tests/e2e/regressions/css-isolation.spec.ts` Playwright test.

- Conversation history is loaded lazily, REST-first then WebSocket:
  - `useConversationHistory` (in `src/hooks/query/use-conversation-history.ts`) fetches only the most recent `INITIAL_HISTORY_PAGE_SIZE` (default 50) events using `sort_order='TIMESTAMP_DESC'`, then reverses to chronological order. Older pages are paginated in via `useLoadOlderEvents` when the user scrolls near the top of the chat.
  - `EventService.searchEvents(conversationId, conversationUrl, sessionApiKey, options)` returns the raw `EventSearchPage` (`{ items, next_page_id }`); options support `limit`, `pageId`, `sortOrder`, `timestampGte`, `timestampLt`. Both the local and cloud-proxy code paths forward the new params.
  - The main `ConversationWebSocketProvider` waits for the REST query to settle before opening its socket, then connects with `resend_mode='since'` and `after_timestamp=<latest preloaded event ts>` (falling back to `'all'` when the REST result is empty or errored). The legacy `resend_all=true` flag is removed for the main connection; the planning-agent sub-conversation still uses `resend_all` until it is migrated to the same REST-then-WS pattern.
  - The event store gained a bulk `addEvents(events)` action (used for the initial REST seed and for "scroll-up" pagination) that re-sorts by timestamp once at the end so older pages can be merged in cheaply. Per-event dedup still works via the existing `eventIds` set.
  - `ChatInterface` wires `useLoadOlderEvents` into its scroll handler (threshold 80px from the top), shows a `data-testid="loading-older-events"` spinner during pagination, and preserves the visible scroll offset by storing the previous `scrollHeight` and adding the height delta after the older page renders.

  - `useLoadOlderEvents` intentionally distinguishes between "no anchor yet" (empty store before the initial REST seed, so `loadOlder()` should no-op) and "malformed oldest event" (store has an oldest event with no timestamp, so the hook throws, flips `hasMore` false, and `ChatInterface` surfaces the failure via the shared error banner instead of failing silently).

- Action grouping in the chat stream:
  - `src/components/conversation-events/chat/group-events.ts` folds runs of consecutive groupable events (regular `ActionEvent`/`ObservationEvent` cards, but not `FinishAction`, `ThinkAction`, `PlanningFileEditorObservation`, `TaskTrackerObservation`, hooks, errors, or message events) into single `RenderedItem` groups. The threshold lives in `EVENT_GROUP_MIN_SIZE` (currently 2, so even pairs of back-to-back actions get folded).
  - `EventGroup` (`src/components/conversation-events/chat/event-message-components/event-group.tsx`) is the collapsible header that wraps each run. Default state is collapsed; the header shows `EVENT_GROUP$ACTIONS_COMPLETED` (with a success check) when the group is done, or `EVENT_GROUP$ACTIONS_PROGRESS` plus the currently-running action's title (from `getEventContent`) while a member `ActionEvent` has not yet been replaced by its observation in the UI events array. Expanding renders the original `EventMessage`s verbatim so each card still expands the way it did before.
  - Agent thoughts attached to an `ActionEvent` (`event.thought`) are hoisted out of groups: `groupEvents` emits a third `RenderedItem` kind `"thought"` whenever a groupable event carries (or, for an observation, originates from) a non-empty thought, flushing the current run and starting a new one. `messages.tsx` renders that item via `ThoughtEventMessage` and passes `suppressThought` to `EventMessage` so the inline thought isn't duplicated inside the group's expanded content. `ThinkAction` is excluded from this hoisting because the thought IS its action body and is rendered through its own codepath.
  - `groupEvents` now de-duplicates hoisted thoughts by action ID so mixed UI arrays that temporarily contain both an action and its replacement observation do not emit the same thought twice; `minSize` is treated as a validated internal invariant (`>= 1`).
  - `EventGroup` should return `null` for an empty `events` array and wire the toggle button to the expanded body with `aria-controls` / `role="region"` / `aria-labelledby`.
  - `src/components/conversation-events/chat/messages.tsx` is the only consumer; the grouping is transparent to upstream code. Coverage lives in `__tests__/components/conversation-events/chat/group-events.test.ts` (pure logic, including thought hoisting) and `__tests__/components/conversation-events/chat/event-message-components/event-group.test.tsx` (rendering/interaction).

- Home page workspace UX (agent-server backend):
  - `RepoConnector` no longer renders a tabbed launcher; it just renders `WorkspaceSelectionForm` because this build only ever talks to an agent-server backend (no cloud backend is wired up). The old `LaunchTabs` component was removed; if a cloud backend is ever supported again, branch on backend mode in `RepoConnector` and render `RepositorySelectionForm` for that path.
  - `FolderBrowserModal`'s "Use this folder" button adds **only the currently navigated directory** as a single workspace (named by its basename). It no longer iterates `subdirs` and adds each child as a separate workspace.
  - The `WorkspaceDropdown` sticky footer now exposes both "+ Add Workspace" (opens the folder browser) and "Manage Workspaces" (opens `ManageWorkspacesModal`, which lets users remove individual workspaces via `useWorkspacesStore.removeWorkspace`). The Manage button is hidden when there are no workspaces yet.
  - The sidebar "+ New Conversation" trigger (`NewConversationButton` in `src/components/features/conversation-panel/`) opens a popover that is a **flat list**, not the home-screen combobox: a leading "No workspace" entry plus one entry per stored workspace, each clicking through to `useCreateConversation` immediately (no separate Launch button). It mirrors the dropdown footer actions/pattern (`+ Add Workspace`, `Manage Workspaces`) locally rather than embedding `WorkspaceDropdown` itself.
  - `useResolvedWorkspaces()` now returns `isLoading` / `isError` for parent-directory scans; `WorkspaceSelectionForm` should surface that state (status text and disabling the empty dropdown while parent results are still loading) instead of assuming the merged list is immediately ready.
  - `ManageWorkspacesModal` should require a confirmation step before removing either a saved workspace or a workspace parent; parent removals should mention the child-workspace impact, and tests should assert both the confirmation flow and that removing the selected workspace clears the launch selection.
  - In `useWorkspacesStore`, keep `clearWorkspaces()` scoped to literal workspaces only; use explicit helpers like `clearWorkspaceParents()` / `clearAll()` for broader resets so future callers do not accidentally wipe parent registrations.

- Default LLM model — `DEFAULT_SETTINGS.llm_model` (`"openhands/minimax-m2.7"`, defined in `src/services/settings.ts`) is the canonical frontend default. `buildConfiguredOpenHandsAgentSettings` in `src/api/agent-server-adapter.ts` **always** sends this value explicitly when the resolved `llm.model` is absent, empty, or whitespace-only — the frontend never relies on the agent-server SDK's own default (`gpt-5.5`). If you change the default model, update `DEFAULT_SETTINGS.llm_model` in `src/services/settings.ts` **and** the checklist in `specs/llm-defaults.md`. Spec: `@spec LLD-001`.

- Custom secrets are NOT auto-attached by the agent-server. `POST /api/conversations` only persists what the client sends in `request.secrets`; the persisted secrets store (`/api/settings/secrets`) is never read at conversation-start. `buildStartConversationRequestWithEncryptedSettings` enumerates `SecretsService.getSecrets()` and turns each entry into a `LookupSecret` whose `url` points back at `/api/settings/secrets/{name}` and whose `headers` carry `X-Session-API-Key` for auth. Pre-1.21.x agent-server SDKs would silently drop that header during validation when `secrets_encrypted=true` (the cipher in the validation context tried to `cipher.decrypt(plaintext_session_key)`, failed, and the validator removed the header — the conversation runtime then got 401s for every saved secret). The SDK fix preserves plaintext header values when decryption fails; if you still see saved secrets unavailable inside a conversation, verify the running agent-server bundles a `LookupSecret._validate_secrets` that falls back to plaintext on decrypt failure.

- MCP page layout: MCP is a **top-level** nav entry at `/mcp` (rendered by `src/routes/mcp.tsx`), shown right below "Skills" in `src/components/features/sidebar/sidebar.tsx`. The legacy `/settings/mcp` route still works as a redirect via `src/routes/mcp-settings-redirect.tsx`, and `src/routes/mcp-settings.tsx` re-exports the new page so the published `MCPSettings` library symbol (in `src/components/settings/index.ts`) keeps the same shape. Marketplace catalog data and MCP logo mappings live in the MCP-capable entries from `@openhands/extensions/integrations`; the Slack API catalog option should point at `https://github.com/zencoderai/slack-mcp-server` and use `@zencoderai/slack-mcp-server`. Deprecated marketplace entries removed upstream (for example GitLab / Google Maps / Postgres / Puppeteer / SQLite) should disappear from the marketplace grid. The Installed section still needs to render and search arbitrary non-catalog custom servers via the raw server `name` / `command` fallback in `src/utils/mcp-marketplace-utils.ts` + `InstalledServerCard`. Tavily is a regular stdio MCP entry (`tavily-mcp` + `TAVILY_API_KEY`), not a special built-in sentinel anymore. Components are colocated under `src/components/features/mcp-page/` and reuse the existing `MCPServerForm` for the "Add custom server" / edit flow.

- Library packaging notes:
  - Public npm entrypoints now come from `src/index.ts` → `src/lib/index.ts`, with domain barrels under `src/components/{conversation,terminal,browser,files,settings,sidebar}/index.ts`.
  - `npm run build` remains the standalone app build (`react-router build`), while `npm run build:lib` runs `vite build` in library mode plus `tsc -p tsconfig.lib.json` to emit `.d.ts` files into `dist/`.
  - The library build relies on `vite.config.ts` with `BUILD_LIB=true`, preserved modules in `dist/`, and package `exports` entries that map root/subpaths to `dist/**/*.js` plus matching declaration files.
  - Declaration emit needs `src/library-env.d.ts` and the narrowed `tsconfig.lib.json`; broad `src/**/*.tsx` declaration builds pulled in route-only files and missed `?react`/window globals.
- Bundle/dev-graph hygiene (Tier 1 cleanup landed):
  - `src/i18n/translation.json` (~1 MB) is imported only by `src/i18n/resources.ts`, which `src/i18n/index.ts` re-exports as `translationResources` for the `@openhands/agent-canvas/i18n` subpath. The re-export is a `export … from` plus `/* @__PURE__ */` annotation, so rollup drops the JSON from the app build (prod `custom-toast-handlers` chunk: 909 KB -> 74 KB; `conversation` chunk: 728 KB -> 392 KB). Do not move the JSON import back into `src/i18n/index.ts` — that immediately re-bundles all translations into every chunk that imports `i18n`.
  - The environment-switch overlay is split: lightweight store/triggers live in `components/features/backends/environment-switch-store.ts`; the React component lives in `environment-switch-overlay.tsx` (re-exports the store API for back-compat). Eagerly-mounted callers (e.g. `backend-selector.tsx`) MUST import trigger helpers from the store, not the overlay file. The overlay is `React.lazy`'d from `routes/root-layout.tsx`.
  - Other always-conditional UI is `React.lazy`'d to keep the root layout's eager graph small: `AnalyticsConsentFormModal`, `AlertBanner` (root-layout), `SettingsModal` (sidebar), and the unreachable-backend modal path in `root.tsx` (`ManageBackendsModal`). Tests that assert on these mounted nodes may need `await screen.findByTestId(...)` / `waitFor(...)` instead of synchronous `getByTestId(...)`.
  - The terminal tab (`components/features/terminal/terminal.tsx`) is `React.lazy`'d in `conversation-tab-content.tsx` alongside the other tabs, so xterm + addon-fit + xterm.css don't enter the conversation route's eager graph (they ship as a separate `terminal-*.js` chunk now).
  - Avoid importing app code through `#/components/conversation-events/chat` or its `event-message-components/index.ts` barrel — they exist for `lib/index.ts` (npm subpath) consumers only. Internal callers use deep paths (`./messages`, `./event-message-components/<name>`, `./event-content-helpers/should-render-event`) so Vite dev doesn't fan out the barrel.

- Backend dropdown connectivity indicator: `useBackendsHealth` (`src/hooks/query/use-backends-health.ts`) polls each registered backend every 10s. Local agent-server backends are probed via `ServerClient.getServerInfo()` (`/server_info`); cloud backends are probed via `getCurrentCloudApiKey()` (`/api/keys/current` through the bundled `/api/cloud-proxy`). Verdicts are surfaced as a colored dot rendered through `DropdownOption.prefix` (added to `src/ui/dropdown/types.ts`); the trigger reads its prefix from the live `options` array (not downshift's frozen `selectedItem`) so the indicator updates without remounting. The same dot is also rendered in each row of `ManageBackendsModal`, which now opts into a one-shot re-probe for previously disabled backends so opening the modal can clear stale persisted error state when a server has recovered. Tests live in `__tests__/hooks/query/use-backends-health.test.tsx`, the `connection indicator` block of `__tests__/components/backends/backend-selector.test.tsx`, and `__tests__/components/backends/manage-backends-modal.test.tsx`.

- Manage Backends modal: `src/components/features/backends/manage-backends-modal.tsx` lets users edit (host/name/api-key/kind) and remove existing backends, plus add new ones inline via a "+ Add Backend" footer button that opens a `BackendFormModal`. Both the dropdown footer's "Add backend" and the manage modal's "+ Add Backend" reuse `BackendFormModal` (see `backend-form-modal.tsx`), with `mode="add"` or `mode="edit"`; `AddBackendModal` is now a thin compatibility wrapper for `BackendFormModal mode="add"`. The modal is also auto-rendered (with a no-op `onClose`) by `src/root.tsx` when the active backend is unreachable, replacing the old full-screen `MissingAgentServerNotice` onboarding screen.

- Conversation right-panel regression note: `ConversationTabs` now owns the moved refresh/build buttons, so `__tests__/components/features/conversation/conversation-tabs.test.tsx` should cover that behavior directly. The drawer's open/closed state (`isRightPanelShown` / `hasRightPanelToggled`) is intentionally **session-only**: it always starts closed on app load (or on opening a fresh/existing conversation after a restart), but it survives in-app navigation because the Zustand `useConversationStore` stays alive across React Router transitions. The `ConversationState` localStorage blob (`conversation-state-{id}`) deliberately does **not** carry a `rightPanelShown` field — `useConversationLocalStorageState` does not expose a `setRightPanelShown` setter, `sanitizeStoredState` strips the legacy `rightPanelShown` key from older persisted blobs on read, and `RightPanelToggle` / `useSelectConversationTab` only mutate the in-memory store. In tests, seed the Zustand store directly for `selectedTab` / `isRightPanelShown` / `hasRightPanelToggled` (the component sync effect currently restores only `selectedTab` from localStorage, so localStorage alone will not make a tab read as active or the drawer read as open).

- Changes tab / `FileDiffViewer` deleted-file note: the agent-server's `/api/git/diff` endpoint calls `path.exists()` first (see `openhands-sdk/openhands/sdk/git/git_diff.py` → `get_git_diff`), so requesting a diff for a `D` (deleted) file returns `GitPathError` → HTTP 400 and trips the global QueryCache error toast. `useUnifiedGitDiff` disables the query when `type === "D"` and `FileDiffViewer` renders a localized "file deleted" placeholder (`DIFF_VIEWER$FILE_DELETED`, `data-testid="file-deleted-message"`) instead of the view-mode toolbar / Monaco editor for that case.

- Onboarding modal: `src/components/features/onboarding/onboarding-modal.tsx` is a 4-step welcome flow rendered by `<OnboardingHost />` (mounted on the home route) and gated by the `openhands-onboarded` localStorage flag (`use-onboarding-completion.ts`). The four steps live under `steps/`: choose-agent (Step 0 – OpenHands selectable, Claude Code & Codex disabled with a "coming soon" note), check-backend (embeds the new `BackendForm` extracted from `backend-form-modal.tsx` plus a colored connection banner driven by `useBackendsHealth`), setup-llm (renders `<LlmSettingsScreen onSaveSuccess={onNext} />` so the existing settings UI keeps owning validation), and say-hello (text input pre-filled from `ONBOARDING$HELLO_DEFAULT_MESSAGE`, launches a no-workspace conversation via `useCreateConversation` and closes the modal). Animation: all four panels are mounted as siblings inside a horizontal rail; advancing/retreating just sets `currentStep`, which translates the rail by `-(step * 100)%` for the slide effect. Progress is rendered by `OnboardingProgressBar` with `data-state` per segment (`completed` | `current` | `upcoming`). When extending, refactor `BackendFormModal` carefully — the inner `BackendForm` is the public surface used both by the modal and by `CheckBackendStep`; the modal version still owns dirty/save tracking so it keeps "Save"/"Cancel" footer behavior.

- Worktree policy (this conversation): commits are made on the worktree branch and the user expects the worktree to stay attached to that branch. Do NOT run `git switch --detach` in the worktree and reattach the branch to the main workspace after each commit — only do that when the user explicitly asks. See `~/.openhands/skills/worktree-switch/SKILL.md` for the manual procedure the user invokes.

- Files tab diff-view default logic: keyed off `useHasAttachedSource()` (`src/hooks/use-has-attached-source.ts`), which is true when the user explicitly attached _either_ a repo (`conversation.selected_repository`) _or_ a local workspace (`getStoredConversationMetadata(id).selected_workspace`, persisted by `createConversation` when `workingDirOverride` is supplied). The agent-server pre-initialises every conversation workspace as a git worktree for its own change tracking, so do NOT use a filesystem probe (`git status` / `useUnifiedGetGitChanges`) as the attachment signal — that was tried in earlier iterations and made every fresh no-attachment conversation incorrectly default to diff view. The companion `useHasGitCommits` probe (`src/hooks/query/use-has-git-commits.ts`) then suppresses diff view for attached-but-empty cases (unborn HEAD, non-git workspace).

- Files tab diff-view default logic: keyed off `useHasAttachedSource()` (`src/hooks/use-has-attached-source.ts`), which is true when the user explicitly attached _either_ a repo (`conversation.selected_repository`) _or_ a local workspace (`getStoredConversationMetadata(id).selected_workspace`, persisted by `createConversation` when `workingDirOverride` is supplied). The agent-server pre-initialises every conversation workspace as a git worktree for its own change tracking, so do NOT use a filesystem probe (`git status` / `useUnifiedGetGitChanges`) as the attachment signal — that was tried in earlier iterations and made every fresh no-attachment conversation incorrectly default to diff view. The companion `useHasGitCommits` probe (`src/hooks/query/use-has-git-commits.ts`) then suppresses diff view for attached-but-empty cases (unborn HEAD, non-git workspace).

- Collapsible thinking: `ThinkAction` events and LLM extended reasoning (`reasoning_content` / `thinking_blocks` on `ActionEvent`) are rendered as collapsible sections via `CollapsibleThinking` (`src/components/conversation-events/chat/event-message-components/collapsible-thinking.tsx`). Collapsed by default to keep the chat compact — the thinking is often in English regardless of the user's conversation language. The `getReasoningContent()` helper in `event-thought-helpers.ts` extracts the content, preferring `reasoning_content` (plain string) and falling back to Anthropic `thinking_blocks`. i18n keys: `THINKING$TITLE`, `THINKING$EXPAND`, `THINKING$COLLAPSE`. Tests: `__tests__/components/conversation-events/chat/event-message-think-action.test.tsx`.

- Agent delegation settings: the `Settings > Agent` page (`src/routes/agent-settings.tsx`) is intentionally NOT a `SdkSectionPage` wrapper. It mirrors upstream OpenHands#14418 — it flatMaps every section of `agent_settings_schema` and finds the `enable_sub_agents` field by key, so it works regardless of which section the real backend exposes the field in. Don't refactor it back to `SdkSectionPage` unless you also know the real backend's section name and add a fallback for the live "SDK schema unavailable" path. The toggle persists via `agent_settings_diff`. Nav item lives in `OSS_NAV_ITEMS` (settings-nav.tsx) with the robot icon (`SETTINGS$NAV_AGENT`). The mock schema in `settings-handlers.ts` puts the field in a `general` section. **Client-side gate**: `getAgentTools()` in `agent-server-adapter.ts` only attaches `task_tool_set` to new conversations when `agent_settings.enable_sub_agents === true`. Without that gate the agent server would still receive the tool whenever it advertised it in `/api/server_info`, so the toggle had no effect on running conversations.

- Settings naming is backend-aware today: local `/settings` is profile-oriented (`use-settings-nav-items.ts` renames the first settings item/title/subtitle to `LLM Profiles` and `chat-input-model.tsx` / `chat-input-actions.tsx` link there as `LLM Profiles`), while cloud keeps the generic `LLM Settings` copy because cloud still edits raw settings rather than saved profiles. The local profile editor (`llm-settings-local-view.tsx`) should keep explicit create/edit profile headings plus helper text so users know they are saving a profile, not mutating the current conversation directly.

- ESLint config (flat, ESLint 9): the project uses `eslint.config.js` (not `.eslintrc`) and runs on `eslint@9.x`, not 10. The constraint pinning us below 10 is `eslint-plugin-react@7.37.x`, which still calls `context.getFilename()` at rule-load time — that API was removed in ESLint 10 and `@eslint/compat`'s `fixupPluginRules` does NOT shim it. Don't try to bump eslint past 9 until eslint-plugin-react ships a v10-compatible release. Import rules come from `eslint-plugin-import-x` (the maintained fork of `eslint-plugin-import`) but are registered under both `import-x/` and `import/` prefixes via `plugins: { import: importXPlugin, ... }` so existing `// eslint-disable-next-line import/...` directives keep working. `linterOptions.reportUnusedDisableDirectives` is set to `"warn"` (not "off") so stale airbnb-era disable comments still surface in lint output without failing CI. The TS-overrides block has an `ignores: ["src/hooks/query/query-keys.ts"]` so the `no-restricted-syntax` rule banning raw `["settings", ...]` query keys doesn't fire on the file that defines the helpers themselves. No `.npmrc` / `legacy-peer-deps` flag is needed — all our plugins declare ESLint 9 peer compatibility.

- **Centralized config**: `config/defaults.json` is the single source of truth for version pins (agent-server, automation, automation SDK), port defaults, persistence paths, and package names. All consumers read from this file:
  - JS scripts (`dev-safe.mjs`, `dev-with-automation.mjs`, `check-sdk-version-sync.mjs`) read it via `JSON.parse(readFileSync(...))`.
  - Docker: a `config-gen` build stage converts the JSON to `/opt/agent-canvas/defaults.env` (shell-sourceable); `entrypoint.sh` sources it at startup.
  - CI workflow: a `Read defaults from config/defaults.json` step uses `node -p` to extract values into `$GITHUB_OUTPUT`.
  - Dockerfile ARG defaults are kept as fallbacks for local `docker build` without the CI workflow; CI always passes `--build-arg` overrides from the JSON.
  - To bump a version, edit `config/defaults.json` only — the JS scripts, Docker build, and CI workflow all derive their values from it.
- Docker all-in-one image: `.github/workflows/docker.yml` builds and publishes `ghcr.io/openhands/agent-canvas` — a combined image that bundles the agent-server (from `ghcr.io/openhands/agent-server`), the automation server (`openhands-automation` via pip), and the agent-canvas frontend (static build). The Dockerfile lives at `docker/Dockerfile`, the entrypoint at `docker/entrypoint.sh`. The workflow structure mirrors the SDK repo's `server.yml`: a `build-and-push-image` matrix job (2 × arch: amd64 on `ubuntu-24.04`, arm64 on `ubuntu-24.04-arm`) pushes arch-suffixed tags, then `merge-manifests` creates multi-arch manifests via `docker buildx imagetools create`, then `consolidate-build-info` aggregates artifacts, and `update-pr-description` updates the PR body (using `<!-- AGENT_CANVAS_DOCKER_START -->` / `<!-- AGENT_CANVAS_DOCKER_END -->` markers). The workflow triggers on push to main, `v*` tags (releases), PRs, and `workflow_dispatch`. On release tags it also pushes semver tags (e.g. `1.2.3`, `1.2`, `1`, `latest`). Fork PRs are skipped (no GHCR auth). The image exposes port 8000 as a unified entry point: `/api/automation/*` → automation (:18001), `/api/*` → agent-server (:18000), `/*` → static frontend. The Dockerfile accepts a `VITE_APP_ENV` build arg (default empty → staging PostHog key); the CI workflow passes `VITE_APP_ENV=production` only for tagged releases (`refs/tags/v*`), so PR and main-branch images use the staging key while release images use the production key, matching the `build:lib` npm path. The entrypoint auto-generates **both** the session API key and `OH_SECRET_KEY` (persisted to `~/.openhands/agent-canvas/session-api-key.txt` and `secret-key.txt` respectively) when none is provided, so the image runs secure by default. Users can override either via env var (`OH_SECRET_KEY`, `SESSION_API_KEY` / `OH_SESSION_API_KEYS_0`). `scripts/dev-safe.mjs` uses the same `secret-key.txt` file, so dev mode and Docker share the same key when both use the same `~/.openhands` directory.

- Spec files live under `specs/`. Spec IDs are stable — never renumber. Mark deprecated specs with ~~strikethrough~~. Tag implementation code and tests with `// @spec BM-002 — Short title` comments so specs are grep-able across the codebase (`grep -rn '@spec BM-' src/ __tests__/`). Place the comment on the line immediately above the relevant code block or test. When multiple tests cover the same spec, use `it.each` if the test structure is identical.

- Release automation: releases use a **long-lived release branch** model — a `rel-X.Y.Z` branch is created from `main`, QA/fixes land there, and publishing is triggered by pushing a `v*` tag directly to that branch (the branch is never merged back to main). Tag format determines the npm dist-tag: `alpha` → `alpha`, `beta` → `beta`, `rc` → `rc`, no suffix → `latest`. Three workflows fire in parallel on every `v*` tag push: `create-release.yml` (creates the GitHub Release object with auto-generated notes and marks pre-release for hyphenated versions), `npm-publish.yml` (builds and publishes to npm with the correct dist-tag), and `docker.yml` (builds multi-arch Docker images). The release skill (`.agents/skills/release.md`, keyword trigger: `release`) guides agents through the full process.

- Cloud conversation resume gating: when a cloud conversation is closed from the UI (`pauseCloudSandbox` is called), the conversation's `conversation_url` is NOT cleared -- it still points to the old sandbox host. `WebSocketProviderWrapper` must suppress the URL (pass `null` to `ConversationWebSocketProvider`) while `sandbox_status === "PAUSED"`, otherwise the WebSocket immediately tries the stale URL before the sandbox wakes. Symmetrically, `useActiveConversation`'s refetch interval must fast-poll (3 s) on both `!conversation_url` AND `sandbox_status === "PAUSED"` -- checking only the missing URL would leave the hook on the 30 s interval while the sandbox is resuming. The resume sequence: navigate -> sandbox PAUSED detected -> `resumeCloudSandbox` called (in `conversation.tsx`) -> fast-poll detects RUNNING -> `conversationUrl` unblocked -> WebSocket connects.
