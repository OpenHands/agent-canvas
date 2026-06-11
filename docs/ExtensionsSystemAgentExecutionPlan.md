# Canvas Extensions PoC Agent Execution Plan

Status: executable handoff plan
Source RFC: [ExtensionsSystemRFC.md](./ExtensionsSystemRFC.md)
Source PoC plan: [ExtensionsSystemPoCPlan.md](./ExtensionsSystemPoCPlan.md)
Target: a working proof of concept that can be built by multiple agents without one agent holding all context
Current repo baseline: merged through `upstream/main` at `40844533`. This checklist assumes `agentServer` `1.27.0`, the current local/public auth modes, frontend-only/backend-only partial stacks, MCP catalog data from `@openhands/extensions/integrations`, the merged PR #1246 tool visualizer registry, draft PR #1277 as the current lead for extension-facing visualizer registration, and public skills defaulting on unless `VITE_LOAD_PUBLIC_SKILLS=false`.

## 1. How To Use This Plan

This is the checklist an implementation agent should follow. The RFC is the product and architecture contract; the PoC plan explains the shape of the proof. This file turns both into task-sized work.

Rules for every agent:

- Read this file, the RFC, the PoC plan, and `AGENTS.md` before editing.
- Run `git status --short` before starting and before handing off.
- Claim a task ID in the handoff notes or PR description before editing overlapping files.
- Keep each task scoped to its listed files unless implementation discovers a real dependency.
- End every task with: files changed, tests run, remaining risks, and the next task ID that is unblocked.
- Do not weaken repo rules: frontend Agent Server calls use typed clients; Extension Host routes use the dedicated wrapper exception; UI strings go through i18n; package dependencies stay exact-pinned.
- Install, update, and remove are CLI-only in every mode; never add browser controls for them. Enable, disable, and new-extension discovery are CLI + restart by default, but become live browser actions on the development source stack when the launcher reports `liveExtensionManagement` (the Vite-served `npm run dev` / `dev:minimal` stack). Gate the host's `enable`/`disable`/`rescan` routes and the Extensions page toggles/rescan behind that capability; the packaged/Docker/static page stays read-only. See RFC §15.2 and §27 Decision 16.

Suggested verification tiers:

```sh
npm run typecheck
npm test
npm run build
npm run build:lib
npm pack --dry-run
```

Run the narrowest useful command while iterating. Before declaring a gate complete, run the gate's listed verification.

## 2. Multi-Agent Work Model

Use gates to coordinate merge order. Tasks inside a gate can be split, but the gate should not be considered complete until all acceptance checks pass.

| Gate | Purpose | Parallelism | Blocks |
|---|---|---|---|
| G0 | Risk burners and contracts | Mostly serial | Everything else |
| G1 | Manager, CLI, install store, host routes | Manager/CLI and launcher work can split after shared contracts land | UI, view host, conversation merge |
| G2 | Example extension and package release path | Can run alongside G1 after contracts land | View host, acceptance demo |
| G3 | Frontend Extensions inventory page and CanvasExtensionService | Can run once Extension Host registry shape is stable | View host UX, dev mode UX |
| G4 | Browser-module view host, left navigation, settings panels, right panels, and visualizers | Can run after registry/assets exist; visualizers can split after shared types land | Acceptance demo |
| G5 | Conversation contribution merge | Can run after launch-contributions endpoint exists | Final proof |
| G6 | Dev mode watch/remount | Can run after manager, host, and view host exist | Final proof |
| G7 | Acceptance, release smoke, polish | Serial final pass | PoC complete |

Avoid these overlapping edits unless one agent owns the integration:

- `bin/agent-canvas.mjs`, `scripts/dev-safe.mjs`, `scripts/dev-with-automation.mjs`, `scripts/static-server.mjs`, and `vite.config.ts` should have one launcher/routing owner at a time.
- `src/api/agent-server-adapter.ts` and `src/api/conversation-service/agent-server-conversation-service.api.ts` should have one conversation-merge owner at a time.
- Sidebar route work should coordinate with Extensions page route work before editing `src/routes.ts`.
- `package.json` exports/files changes should coordinate with release-smoke work.

## 3. Gate G0: Risk Burners And Contract

### G0.1 SDK Plugin Source Smoke

- [ ] Owner:
- [ ] Depends on: none
- [ ] Files likely touched:
  - `examples/extensions/hello-canvas/agent/hello-plugin/.plugin/plugin.json`
  - `examples/extensions/hello-canvas/agent/hello-plugin/**`
  - optional smoke helper under `scripts/` or `__tests__/canvas-extensions/`
- [ ] Implement:
  - Create the smallest SDK plugin fixture with a visible skill/context marker.
  - Start a local conversation with top-level `plugins: [{ source: absolutePluginPath }]`.
  - Confirm pinned Agent Server `1.27.0` accepts `PluginSource` and loads from a local path.
  - Run the same preflight against an ACP configuration or document that ACP remains context-only.
- [ ] Tests:
  - Add a repeatable smoke or unit fixture where possible.
  - If fully automated live smoke is too expensive, document exact manual command and observed payload/server response.
- [ ] Done when:
  - Local-path plugin support is proven or SDK plugin merge is explicitly feature-flagged/deferred.
  - ACP behavior is decided for MVP.
- [ ] Handoff notes:

### G0.2 Static Dynamic Import Smoke

- [ ] Owner:
- [ ] Depends on: none
- [ ] Files likely touched:
  - `examples/extensions/hello-canvas/dist/index.js`
  - `__tests__/canvas-extensions/` or a small script fixture
- [ ] Implement:
  - Create a browser-ready ESM fixture exporting `mount({ root, context })`.
  - Verify static production build can dynamically import it from `/canvas-extension-assets/...`.
  - Add a negative fixture that uses a bare runtime import such as `react`.
- [ ] Tests:
  - Validation rejects bare runtime imports with an actionable diagnostic.
  - Valid module imports with only bundled/relative imports.
- [ ] Done when:
  - DOM-island runtime works without Vite resolving shared dependencies.
- [ ] Handoff notes:

### G0.3 Shared Types And Manifest Validation

- [ ] Owner:
- [ ] Depends on: none
- [ ] Files likely touched:
  - `src/canvas-extensions/types.ts`
  - `src/canvas-extensions/manifest-schema.ts`
  - `src/canvas-extensions/manifest-validation.ts`
  - `src/canvas-extensions/artifact-detection.ts`
  - `src/canvas-extensions/storage-paths.ts`
  - `src/themes/color-themes.ts`
  - `__tests__/canvas-extensions/manifest-validation.test.ts`
  - `package.json`
  - `tsconfig.lib.json` if needed for emitted type paths
  - keep new public types under `src/canvas-extensions/`; do not recreate the old `src/addons/` namespace
- [ ] Implement:
  - Manifest v1 types, contribution types, registry entry types, diagnostics, installable artifact kinds.
  - Contribution types for left navigation, `colorThemes`, `settingsPanels`, `conversationRightPanels`, and `toolVisualizers`.
  - `AgentCanvasColorThemeDefinition` aligned with the current app theme model: `label`, `scale`, `heroui`, and optional semantic `tokens`.
  - Validation for required fields, ID regex, duplicate/mutually exclusive `browser.module` and `browser.entry`, path containment, reserved `browser.entry`.
  - Validation for color theme IDs and allowed theme token keys.
  - Artifact detection order: Canvas Extension, SDK plugin, skill, MCP placeholder.
  - Storage helpers for `~/.openhands/agent-canvas/installations`.
  - Public package exports `@openhands/agent-canvas/canvas-extensions` and the OpenHands agent-team-approved visualizer export, with emitted `dist/extensions/*` and matching visualizer output.
- [ ] Tests:
  - Valid extension manifest.
  - Missing required fields.
  - Bad ID.
  - Traversal in manifest/browser/icon/plugin paths.
  - Both `browser.module` and `browser.entry`.
  - Reserved `browser.entry` diagnostic.
  - Theme-only extension manifest is valid.
  - Invalid color theme token key is rejected.
  - Standalone SDK plugin / `SKILL.md` detection returns unsupported-in-MVP kind.
- [ ] Verification:

```sh
npm run typecheck
npm test -- __tests__/canvas-extensions/manifest-validation.test.ts
npm run build:lib
```

- [ ] Done when:
  - Type consumers can import from `@openhands/agent-canvas/canvas-extensions` and the final visualizer authoring export.
  - No runtime host, CLI store, or UI behavior is introduced in this gate.
- [ ] Handoff notes:

## 4. Gate G1: Manager, CLI, Host, And Routing

### G1.1 Extension Manager Library

- [ ] Owner:
- [ ] Depends on: G0.3
- [ ] Files likely touched:
  - `scripts/extension-manager.mjs`
  - `__tests__/canvas-extensions/extension-manager.test.ts`
  - `__tests__/canvas-extensions/fixtures/**`
- [ ] Implement:
  - Store bootstrap: private `package.json`, `package-lock.json`, `artifacts.json`, `config.json`, `logs/`, `dev/`, `node_modules/`.
  - Read/write registry state with atomic-ish writes where practical.
  - Install Canvas Extension manifests from local paths first; tarball/npm spec can follow in the same gate if scoped.
  - Run npm installs in the private store with `--ignore-scripts` by default.
  - Enable/disable/remove/update state transitions exposed as manager functions; the CLI calls them directly and the host calls enable/disable/rescan only when live management is enabled. The manager itself is mode-agnostic.
  - Disabled wins over enabled if config is manually inconsistent.
  - Typed unsupported diagnostics for standalone SDK plugin, `SKILL.md`, and MCP-template artifacts.
  - Registry projection with `assetBaseUrl`, diagnostics, state, version, package name.
  - Launch contribution projection from extensions enabled at process startup.
- [ ] Tests:
  - Store bootstrap.
  - Local extension install and enable.
  - `--no-enable` leaves disabled/installed.
  - Unsupported standalone artifacts.
  - Duplicate ID collision.
  - Invalid manifest state.
  - Remove preserves settings by default.
  - Path traversal rejection.
- [ ] Verification:

```sh
npm test -- __tests__/canvas-extensions/extension-manager.test.ts
```

- [ ] Done when:
  - CLI and host can share the manager without duplicating store logic.
- [ ] Handoff notes:

### G1.2 CLI Dispatch And Commands

- [ ] Owner:
- [ ] Depends on: G1.1
- [ ] Files likely touched:
  - `bin/agent-canvas.mjs`
  - optional `scripts/extension-cli.mjs`
  - `__tests__/canvas-extensions/extension-cli.test.ts`
- [ ] Implement:
  - Dispatch `install`, `list`, `enable`, `disable`, `remove`, `update`, `doctor`, and `dev-extension` before stack startup.
  - Dispatch before `--public`, `--frontend-only`, and `--backend-only` stack validation.
  - Dispatch before checking for `build/`.
  - Dispatch before importing `scripts/dev-with-automation.mjs`.
  - `--disable-extensions` remains a process-local stack-start flag.
  - Help text includes management commands and global install happy path.
  - `doctor` reports invalid manifests, unsupported standalone artifacts, missing assets, package/export issues where detectable.
- [ ] Tests:
  - `agent-canvas list canvas-extensions` works with no `build/`.
  - `agent-canvas doctor` works with no `build/`.
  - Unknown command produces useful help.
  - `install --install-scripts=deny` is default.
- [ ] Verification:

```sh
node bin/agent-canvas.mjs list canvas-extensions
node bin/agent-canvas.mjs doctor
npm test -- __tests__/canvas-extensions/extension-cli.test.ts
```

- [ ] Done when:
  - Management commands are usable from source checkout and packed global install without launching services.
- [ ] Handoff notes:

### G1.3 Extension Host HTTP Service

- [ ] Owner:
- [ ] Depends on: G1.1
- [ ] Files likely touched:
  - `scripts/extension-host.mjs`
  - `__tests__/canvas-extensions/extension-host.test.ts`
- [ ] Implement:
  - `GET /api/canvas/canvas-extensions/registry`
  - `GET /api/canvas/canvas-extensions/diagnostics`
  - `GET /api/canvas/canvas-extensions/:id/settings`
  - `PATCH /api/canvas/canvas-extensions/:id/settings`
  - `GET /api/canvas/canvas-extensions/launch-contributions`
  - `GET /canvas-extension-assets/:id/*assetPath`
  - `POST /api/canvas/canvas-extensions/:id/enable`, `POST /api/canvas/canvas-extensions/:id/disable`, and `POST /api/canvas/canvas-extensions/rescan` — registered only when the launcher reports `liveExtensionManagement`.
  - Session API key guard for settings mutation and for the gated enable/disable/rescan routes.
  - Static asset path containment and content types.
- [ ] Tests:
  - Registry and diagnostics read.
  - Settings mutation rejects missing/bad API key.
  - Install/update/remove browser routes are absent in every mode.
  - `enable`/`disable`/`rescan` routes are absent when `liveExtensionManagement` is false and present + API-key-guarded when true.
  - Live enable/disable mutates `config.json`; rescan surfaces a newly installed extension.
  - Asset serving works and traversal fails.
  - Launch-contributions filters disabled/invalid extensions.
- [ ] Verification:

```sh
npm test -- __tests__/canvas-extensions/extension-host.test.ts
```

- [ ] Done when:
  - A toy registry and browser module can be fetched through the host directly.
- [ ] Handoff notes:

### G1.4 Launcher And Proxy Integration

- [ ] Owner:
- [ ] Depends on: G1.3
- [ ] Files likely touched:
  - `scripts/dev-safe.mjs`
  - `scripts/dev-with-automation.mjs`
  - `scripts/static-server.mjs`
  - `vite.config.ts`
  - `config/defaults.json` if adding default extension host port
  - launcher/proxy tests under `__tests__/`
- [ ] Implement:
  - Allocate/start Extension Host in `npm run dev`, `dev:minimal`, `dev:static`, and packaged `agent-canvas`.
  - Route `/api/canvas/canvas-extensions/*` and `/canvas-extension-assets/*` before `/api/*` and before SPA fallback.
  - Add Vite proxy support for direct Vite access.
  - Add static server route support for direct static-port access.
  - Cover `--frontend-only` and `--backend-only`: frontend-only may expose local Extensions/browser assets with agent-runtime diagnostics; backend-only should skip browser asset hosting unless a future CLI-only host mode explicitly needs it.
  - Emit frontend env/runtime metadata: extension enabled flag, `localInstallStoreReadable`, `liveExtensionManagement`, route/base if needed.
  - Derive `liveExtensionManagement` from the existing `services.frontend.kind` in `scripts/runtime-services-info.mjs`: true for the Vite dev server (`npm run dev` / `dev:minimal`), false for the static server (packaged CLI, Docker, `dev:static`). Use it to register/skip the host enable/disable/rescan routes.
  - Do not expose a write-capable Extension Host key in `<RUNTIME_SERVICES>`.
- [ ] Tests:
  - Route precedence unit tests for `scripts/static-server.mjs` and ingress route ordering.
  - Launcher config test for `localInstallStoreReadable=true` only when this launcher starts the local Agent Server.
  - Launcher config test for `liveExtensionManagement=true` only on the Vite dev stack and false for static/packaged/Docker.
  - Partial-stack route tests for frontend-only/backend-only behavior.
  - Vite config contains extension routes before generic `/api` where applicable.
- [ ] Verification:

```sh
npm test -- __tests__/vite-config.test.ts
npm test -- __tests__/canvas-extensions
```

- [ ] Done when:
  - Registry JSON and browser module assets can be fetched through ingress and through the direct frontend/static port.
- [ ] Handoff notes:

## 5. Gate G2: Example Extension And Release Path

### G2.1 Hello Canvas Extension Fixture

- [ ] Owner:
- [ ] Depends on: G0.3
- [ ] Files likely touched:
  - `examples/extensions/hello-canvas/package.json`
  - `examples/extensions/hello-canvas/agent-canvas.extension.json`
  - `examples/extensions/hello-canvas/dist/index.js`
  - `examples/extensions/hello-canvas/dist/*.svg`
  - `examples/extensions/hello-canvas/agent/hello-plugin/**`
  - optional README under the fixture
- [ ] Implement:
  - Manifest with `id: "hello.canvas"`.
  - One `browser.module` view.
  - One primary sidebar contribution after Automations.
  - One launch template.
  - One context block with a recognizable marker.
  - One local SDK plugin contribution rooted at `agent/hello-plugin`.
  - Minimal settings schema.
  - No bare runtime imports in the shipped module.
- [ ] Tests:
  - Manifest validation fixture.
  - Asset route fixture.
  - Launch contribution fixture.
- [ ] Done when:
  - This one fixture can drive the full acceptance demo.
- [ ] Handoff notes:

### G2.2 Release Packaging Smoke

- [ ] Owner:
- [ ] Depends on: G0.3, G1.2
- [ ] Files likely touched:
  - `package.json`
  - optional `scripts/package-smoke.mjs`
  - `__tests__/canvas-extensions/package-smoke.test.ts` if automated
- [ ] Implement:
  - Ensure `files` includes every runtime script/build artifact needed by the global CLI and Extension Host.
  - Ensure `./canvas-extensions` and the final visualizer export resolve from the packed package.
  - Add a repeatable smoke for packed tarball install into a temp npm prefix if practical.
- [ ] Verification:

```sh
npm run build
npm run build:lib
npm pack --dry-run
```

- [ ] Done when:
  - Packed package contains `bin`, `scripts`, `build`, `dist/extensions`, `dist/visualizers`, and any advertised schema files.
  - `agent-canvas list canvas-extensions` and `agent-canvas doctor` work from packed/global install.
- [ ] Handoff notes:

## 6. Gate G3: Frontend Extensions Inventory

### G3.1 CanvasExtensionService API Wrapper

- [ ] Owner:
- [ ] Depends on: G1.3
- [ ] Files likely touched:
  - `src/api/canvas-extensions-service.ts`
  - `src/api/no-direct-agent-server-calls.test.ts`
  - `src/hooks/query/use-extensions.ts`
- [ ] Implement:
  - Dedicated wrapper for every `/api/canvas/canvas-extensions/*` call.
  - Narrow test exception for this wrapper, including the current `fetch('/api/...')` guard.
  - React Query hooks for registry, diagnostics, settings read/patch, and launch contributions.
  - Capability-gated enable/disable/rescan mutation methods that call the host routes only when `liveExtensionManagement` is true and invalidate the registry query on success; never expose install/update/remove mutations.
- [ ] Tests:
  - No-direct-Agent-Server guard still fails arbitrary `/api/*` fetches outside the wrapper.
  - Wrapper builds the expected routes and auth headers.
  - Enable/disable/rescan mutations invalidate the registry query and are not exposed (or no-op) when `liveExtensionManagement` is false.
- [ ] Verification:

```sh
npm test -- src/api/no-direct-agent-server-calls.test.ts
npm run typecheck
```

- [ ] Done when:
  - Frontend consumers never hand-roll Extension Host fetches.
- [ ] Handoff notes:

### G3.2 Extensions Page

- [ ] Owner:
- [ ] Depends on: G3.1
- [ ] Files likely touched:
  - `src/routes.ts`
  - `src/routes/canvas-extensions-page.tsx`
  - `src/components/features/skills/extensions-navigation.tsx`
  - `src/routes/extensions-hub.tsx` if the existing Customize hub needs route/link updates
  - `src/i18n/translation.json`
  - generated i18n files via `npm run make-i18n`
  - `tests/e2e/snapshots/**`
- [ ] Implement:
  - Replace or redirect `/plugins` to Extensions while preserving bookmarks.
  - Extensions nav item in the existing Customize area (`/customize` primary entry, desktop redirect to `/skills`, mobile Customize hub).
  - Treat legacy "extensions" file/component names as existing Customize implementation details; do not use them as new product vocabulary.
  - Simple stacked view of installed Canvas Extensions and their status.
  - Status grouping/filtering only as needed for scanability: Enabled, Disabled, Invalid, Dev.
  - Rows/cards show display name, package, version, state, contribution badges, required secrets, diagnostics, source path for dev entries.
  - Read `liveExtensionManagement` from launcher metadata. When false: read-only with CLI guidance for enable/disable plus a restart note. When true: per-row enable/disable toggles and a rescan action wired to the gated service methods, with registry-query invalidation on success.
  - CLI guidance for install, update, and remove in every mode; never render browser install/update/remove actions.
  - User-facing copy goes through i18n keys.
- [ ] Tests:
  - Component tests for empty/enabled/invalid/dev/needs-review states.
  - Read-only CLI guidance when `liveExtensionManagement` is false; no toggles rendered.
  - Enable/disable toggles and rescan rendered and functional when `liveExtensionManagement` is true, including registry invalidation on a successful toggle.
  - Snapshot tests for key states if scope allows in the PR.
- [ ] Verification:

```sh
npm run make-i18n
npm run typecheck
npm test
```

- [ ] Done when:
  - A user can inspect `hello.canvas` status and diagnostics from the UI, with management handled by CLI and restart.
- [ ] Handoff notes:

## 7. Gate G4: Browser Module View Host And UI Surfaces

### G4.1 Extension Runtime Host

- [ ] Owner:
- [ ] Depends on: G1.3, G2.1, G3.1
- [ ] Files likely touched:
  - `src/routes.ts`
  - `src/routes/extension-view-host.tsx`
  - `src/canvas-extensions/runtime/*`
  - `src/i18n/translation.json`
- [ ] Implement:
  - Route `/canvas-extensions/:extensionId/:viewId/*`.
  - Fetch registry, resolve enabled view, import `assetBaseUrl + browser.module`.
  - Use `import(/* @vite-ignore */ url)` or equivalent for served extension modules.
  - Add cache-busting version token.
  - Call `mount({ root, context })`; call `dispose()` on unmount/remount.
  - Provide minimal async context: metadata/settings, `navigation.navigate`, `navigation.openExternal`, `ui.toast`, settings read/patch.
  - Local error boundary and diagnostics link.
- [ ] Tests:
  - Mount success.
  - Mount failure shows local error and does not crash Canvas.
  - Dispose called on unmount/remount.
  - Settings read/patch calls wrapper.
- [ ] Verification:

```sh
npm run typecheck
npm test
```

- [ ] Done when:
  - `hello.canvas` view renders from served browser module.
- [ ] Handoff notes:

### G4.2 Left Navigation Entries

- [ ] Owner:
- [ ] Depends on: G4.1
- [ ] Files likely touched:
  - `src/components/features/sidebar/sidebar.tsx`
  - `src/components/features/sidebar/sidebar-rail-body.tsx`
  - related mobile/sidebar components
  - `src/i18n/translation.json`
  - snapshot tests
- [ ] Implement:
  - Render enabled `primarySidebar` / `afterAutomations` view contributions after Automations and before conversation list.
  - Deterministic sort: `order`, extension display name, view ID.
  - Expanded sidebar shows icon + title.
  - Collapsed sidebar shows icon with tooltip.
  - Mobile drawer shows same relative position.
  - Disabled/invalid extensions do not render entries.
- [ ] Tests:
  - Expanded/collapsed/mobile render positions.
  - Disabled/invalid entries absent.
  - Sorting deterministic.
- [ ] Verification:

```sh
npm run typecheck
npm run test:e2e:snapshots -- --grep "sidebar"
```

- [ ] Done when:
  - `hello.canvas` sidebar item appears immediately after Automations.
- [ ] Handoff notes:

### G4.3 Extension Tool Visualizers

- [ ] Owner:
- [ ] Depends on: G0.3, G1.3, G3.1
- [ ] Coordination required: OpenHands agent team decision on PR #1277 or its successor
- [ ] Files likely touched:
  - `src/components/features/chat/tool-visualizers/*`
  - `src/canvas-extensions/visualizers/*`
  - `src/api/canvas-extensions-service.ts`
  - `package.json`
  - `tsconfig.lib.json`
  - visualizer tests under `__tests__/components/features/chat/tool-visualizers/`
  - extension tests under `__tests__/canvas-extensions/`
- [ ] Implement:
  - Public visualizer authoring export matched to the OpenHands agent team's approved API; use PR #1277 as the current starting point.
  - Extension visualizer registry layer that composes before built-in visualizers and markdown/default fallback.
  - `matches()` support for narrowing one event variant.
  - No Canvas-only `priority` field unless the agent team approves it.
  - Manifest projection for `contributes.toolVisualizers`.
  - Error boundary/fallback behavior: thrown extension renderer records a diagnostic and falls through to the next renderer/default.
  - Fixture extension visualizer for one MCP/tool variant.
- [ ] Tests:
  - Extension visualizer wins over built-in when matching.
  - Multiple matching extension visualizers follow the approved registry order. For PR #1277 this means latest registration first.
  - `matches()` narrows one action/observation variant without replacing the whole kind.
  - Built-in visualizer still handles unmatched events.
  - Markdown fallback still handles unregistered events.
  - Throwing extension renderer falls through.
- [ ] Verification:

```sh
npm test -- __tests__/components/features/chat/tool-visualizers
npm run build:lib
npm run typecheck
```

- [ ] Done when:
  - A local extension can change how one event/tool renders without forking Agent Canvas.
- [ ] Handoff notes:

### G4.4 Color Themes, Settings Panels, And Conversation Right Panels

- [ ] Owner:
- [ ] Depends on: G4.1
- [ ] Files likely touched:
  - `src/themes/color-themes.ts`
  - `src/components/features/settings/app-settings/theme-input.tsx`
  - settings route/components
  - conversation right-panel/tab components
  - `src/canvas-extensions/panels/*`
  - `src/i18n/translation.json`
  - tests under `__tests__/canvas-extensions/`
  - focused component tests near settings and conversation panel hosts
- [ ] Implement:
  - Color theme registry for `contributes.colorThemes`.
  - Project enabled extension color themes into Settings > Application > Color Theme.
  - Support theme-only extensions with no view/panel/visualizer contribution.
  - Fall back to the default built-in theme if the selected extension theme is disabled, removed, or invalid.
  - Settings panel registry for `contributes.settingsPanels`.
  - Settings panel manifests declare metadata only; browser modules register implementations by contribution ID.
  - Render settings panels only under a visible Extensions header after built-in settings sections.
  - Conversation right-panel registry for `contributes.conversationRightPanels`.
  - Conversation right-panel manifests declare metadata only; browser modules register implementations by contribution ID.
  - Render conversation right panels alongside Files, Browser, and Terminal.
  - Stable panel props: conversation ID/status where relevant, active backend summary, workspace summary, extension settings helpers, navigation/toast helpers.
  - Deterministic ordering by `order`, extension display name, and panel contribution ID.
  - Per-panel error boundaries.
  - No raw store, React Query client, or Canvas-internal component API in the public contract.
- [ ] Tests:
  - Extension color theme appears in the Color Theme dropdown.
  - Theme-only extension contributes no other UI and remains valid.
  - Selected extension theme falls back when disabled/invalid.
  - Settings panels render only under the Extensions header after built-in settings.
  - Missing settings panel implementations produce diagnostics instead of breaking Settings.
  - Conversation right panels render beside Files, Browser, and Terminal.
  - Missing right-panel implementations produce diagnostics instead of breaking the conversation UI.
  - Ordering is deterministic.
  - Disabled/invalid extensions do not render panel content.
  - Panel errors are localized and do not break settings or conversation pages.
- [ ] Done when:
  - A local Canvas Extension can add a color theme, a settings panel, and a conversation right panel without a full app route.
- [ ] Handoff notes:

## 8. Gate G5: Conversation Contributions

### G5.1 Launch Contributions And Runtime Compatibility

- [ ] Owner:
- [ ] Depends on: G1.3, G3.1
- [ ] Files likely touched:
  - `src/api/canvas-extensions-service.ts`
  - `src/canvas-extensions/runtime-compatibility.ts`
  - `__tests__/canvas-extensions/runtime-compatibility.test.ts`
- [ ] Implement:
  - `CanvasExtensionsService.getLaunchContributions()`.
  - Runtime classes: `canvas-local`, `agent-server-local`, `agent-server-remote`, `cloud-runtime`, `acp-runtime`.
  - Use launcher-issued `localInstallStoreReadable`.
  - Disable package-relative/local SDK plugin paths unless filesystem-local.
  - Disable extension SDK plugins for ACP unless the G0 smoke proves allowed.
  - Do not assume public marketplace skills are loaded; they now default on but remain opt-out via `VITE_LOAD_PUBLIC_SKILLS=false`.
- [ ] Tests:
  - Compatibility matrix across all runtime classes.
  - Disabled reasons are stable and UI-ready.
  - Remote/cloud never receive local absolute paths.
- [ ] Done when:
  - Launch templates can show why each contribution will or will not be included.
- [ ] Handoff notes:

### G5.2 Create Conversation Merge

- [ ] Owner:
- [ ] Depends on: G5.1
- [ ] Files likely touched:
  - `src/api/conversation-service/agent-server-conversation-service.api.ts`
  - `src/api/agent-server-adapter.ts`
  - `src/hooks/mutation/use-create-conversation.ts`
  - launch/home components
  - `__tests__/api/agent-server-adapter.test.ts`
  - `__tests__/canvas-extensions/conversation-contributions.test.ts`
- [ ] Implement:
  - `extensionSystemSuffix` adapter option.
  - Append `<AGENT_CANVAS_RUNTIME>` and `<AGENT_CANVAS_EXTENSIONS>` after `<RUNTIME_SERVICES>`.
  - Merge extension plugin specs with existing `/launch` plugin selections.
  - Dedupe by `source/ref/repo_path`.
  - Preserve current top-level start payload shape: `agent_settings`, `workspace`, `confirmation_policy`, `tool_module_qualnames`, optional `initial_message`, optional `plugins`, and runtime fields such as `hook_config`, `agent_definitions`, `security_analyzer`, `tags`, and `secrets`.
  - Keep `conversationInstructions` as user-message content only.
- [ ] Tests:
  - Payload includes extension suffix when selected/enabled.
  - Payload omits extension context when disabled.
  - Existing runtime services suffix still appears first.
  - Plugin merge order and dedupe.
  - Local-path plugin skipped on remote/cloud.
- [ ] Verification:

```sh
npm test -- __tests__/api/agent-server-adapter.test.ts
npm run typecheck
```

- [ ] Done when:
  - Starting `hello.canvas` launch template produces the expected payload without depending on LLM behavior.
- [ ] Handoff notes:

## 9. Gate G6: Dev Mode

### G6.1 Dev Registration And Watch

- [ ] Owner:
- [ ] Depends on: G1.1, G1.3, G4.1
- [ ] Files likely touched:
  - `scripts/extension-manager.mjs`
  - `scripts/extension-host.mjs`
  - `bin/agent-canvas.mjs`
  - `src/api/canvas-extensions-service.ts`
  - `src/routes/canvas-extensions-page.tsx`
  - tests under `__tests__/canvas-extensions/`
- [ ] Implement:
  - `agent-canvas install <path> --dev`.
  - `agent-canvas dev-extension register/list/unregister`.
  - Store registrations in `~/.openhands/agent-canvas/installations/dev/dev-extensions.json`.
  - No repo auto-discovery.
  - Serve assets directly from registered source folder.
  - Watch manifest and declared output files.
  - Manifest changes revalidate and update diagnostics.
  - Permission, network, secret, or agent-affecting contribution expansion moves the dev extension to needs-review/disabled-for-next-run until CLI re-approval and restart.
  - Browser module changes bump version token and remount affected views.
  - Agent-side changes require new conversation.
- [ ] Tests:
  - Registration/unregistration.
  - Absolute path storage.
  - Traversal rejection.
  - Invalid manifest update transitions to invalid diagnostics.
  - Permission-expanding manifest update transitions to needs-review/disabled-for-next-run.
  - Asset change emits remount/cache-bust signal.
- [ ] Done when:
  - A developer can rebuild `hello.canvas` and see the view remount without rebuilding Canvas.
- [ ] Handoff notes:

## 10. Gate G7: Acceptance And Polish

### G7.1 End-To-End Acceptance Demo

- [ ] Owner:
- [ ] Depends on: G1 through G6
- [ ] Run:

```sh
npm run build
npm run build:lib
npm pack --dry-run
node bin/agent-canvas.mjs install ./examples/extensions/hello-canvas --yes
node bin/agent-canvas.mjs list canvas-extensions
node bin/agent-canvas.mjs doctor
node bin/agent-canvas.mjs
```

- [ ] Browser checks:
  - Extensions shows `hello.canvas` enabled with no diagnostics in the read-only inventory.
  - Extensions shows CLI/restart guidance rather than browser management actions.
  - Left navigation entry appears after Automations and before conversations.
  - Extension view renders.
  - Extension color theme appears in Settings > Application > Color Theme and can be selected.
  - Settings panel appears under a visible Extensions header after built-in settings.
  - Conversation right panel appears beside Files, Browser, and Terminal.
  - Extension settings patch persists.
  - Launch template shows context/plugin contribution preflight.
  - Conversation payload includes extension suffix.
  - Remote/cloud compatibility path shows disabled reason for local plugin path.
  - Dev registration and remount path works in `npm run dev`.
  - In `npm run dev`, the Extensions page enable/disable toggle reconciles UI contributions without a restart, and rescan surfaces a newly installed extension; the same build served via the static/packaged path shows the page read-only with no toggles.
- [ ] Done when:
  - The PoC works from a clean checkout.
- [ ] Handoff notes:

### G7.2 Packed Global Install Acceptance

- [ ] Owner:
- [ ] Depends on: G7.1
- [ ] Run from a temp directory/prefix:
  - Install the packed `@openhands/agent-canvas` tarball.
  - Verify `agent-canvas list canvas-extensions`.
  - Verify `agent-canvas doctor`.
  - Install a packed or local `hello.canvas` extension.
  - Launch `agent-canvas` and repeat the browser acceptance checks.
- [ ] Done when:
  - The happy path matches the upcoming npm release story: global install, then `agent-canvas`.
- [ ] Handoff notes:

### G7.3 Final Verification

- [ ] Owner:
- [ ] Depends on: G7.1, G7.2
- [ ] Run:

```sh
npm run typecheck && npm test && npm run build
```

- [ ] Also run targeted snapshot/live checks if the PR touched those surfaces:

```sh
npm run test:e2e:snapshots
npm run test:e2e:live -- --check
```

- [ ] Done when:
  - Full repo verification passes or failures are documented as unrelated/pre-existing.
  - The final handoff lists exact commands, output summary, known risks, and follow-up tasks.
- [ ] Handoff notes:

## 11. Cross-Cutting Acceptance Criteria

The PoC is not complete unless all of these are true:

- [ ] Management CLI commands work without starting services.
- [ ] Management CLI commands work when no `build/` directory exists.
- [ ] Global npm package contains every runtime artifact it needs.
- [ ] Extension Host routes work through Vite, ingress, static server, and packaged CLI.
- [ ] `/api/canvas/canvas-extensions/*` traffic is isolated behind `src/api/canvas-extensions-service.ts`.
- [ ] Ordinary Agent Server API calls still use `@openhands/typescript-client`.
- [ ] Browser modules are trusted same-origin DOM islands and documented/consented as such.
- [ ] Bare runtime imports in extension browser modules are rejected for MVP.
- [ ] Local SDK plugin paths are sent only when `localInstallStoreReadable=true`.
- [ ] Install, update, and remove are CLI-only with no browser routes or controls in any mode.
- [ ] Enable/disable/rescan host routes and Extensions page controls exist only when `liveExtensionManagement=true` (the Vite dev stack); the packaged/Docker/static page is read-only and restart-bounded.
- [ ] Live enable/disable reconciles UI contributions without a restart; SDK plugin and context changes still apply only to conversations created after the change.
- [ ] ACP runtimes do not receive incompatible extension plugin/MCP contributions.
- [ ] `conversationInstructions` never receives extension system context.
- [ ] Extension context composes with existing `<RUNTIME_SERVICES>` suffix.
- [ ] `hello.canvas` proves install, registry, UI, left navigation, view, color theme, settings panel, conversation right panel, tool visualizer, launch context, SDK plugin preflight, and dev remount.
- [ ] Tests cover the risk surfaces listed in the PoC plan.

## 12. Handoff Template

Use this at the end of every agent task:

```md
Task ID:
Status: complete | blocked | partial
Files changed:
Tests run:
Result:
Known risks:
Next unblocked tasks:
Notes for next agent:
```

Blocked tasks should include the exact command, error, and the smallest proposed next step. Avoid broad "needs investigation" handoffs; name the file, route, command, or test that failed.
