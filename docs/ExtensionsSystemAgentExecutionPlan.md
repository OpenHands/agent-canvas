# Agent Canvas Extensions PoC Agent Execution Plan

Status: executable handoff plan
Source RFC: [ExtensionsSystemRFC.md](./ExtensionsSystemRFC.md)
Source PoC plan: [ExtensionsSystemPoCPlan.md](./ExtensionsSystemPoCPlan.md)
Target: a working proof of concept that can be built by multiple agents without one agent holding all context

## 1. How To Use This Plan

This is the checklist an implementation agent should follow. The RFC is the product and architecture contract; the PoC plan explains the shape of the proof. This file turns both into task-sized work.

Rules for every agent:

- Read this file, the RFC, the PoC plan, and `AGENTS.md` before editing.
- Run `git status --short` before starting and before handing off.
- Claim a task ID in the handoff notes or PR description before editing overlapping files.
- Keep each task scoped to its listed files unless implementation discovers a real dependency.
- End every task with: files changed, tests run, remaining risks, and the next task ID that is unblocked.
- Do not weaken repo rules: frontend Agent Server calls use typed clients; Extension Host routes use the dedicated wrapper exception; UI strings go through i18n; package dependencies stay exact-pinned.

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
| G3 | Frontend Packages page and ExtensionService | Can run once Extension Host registry shape is stable | View host UX, dev mode UX |
| G4 | Browser-module view host and sidebar entries | Can run after registry/assets exist | Acceptance demo |
| G5 | Conversation contribution merge | Can run after launch-contributions endpoint exists | Final proof |
| G6 | Dev mode watch/remount | Can run after manager, host, and view host exist | Final proof |
| G7 | Acceptance, release smoke, polish | Serial final pass | PoC complete |

Avoid these overlapping edits unless one agent owns the integration:

- `bin/agent-canvas.mjs`, `scripts/dev-safe.mjs`, `scripts/dev-with-automation.mjs`, `scripts/static-server.mjs`, and `vite.config.ts` should have one launcher/routing owner at a time.
- `src/api/agent-server-adapter.ts` and `src/api/conversation-service/agent-server-conversation-service.api.ts` should have one conversation-merge owner at a time.
- Sidebar route work should coordinate with Packages page route work before editing `src/routes.ts`.
- `package.json` exports/files changes should coordinate with release-smoke work.

## 3. Gate G0: Risk Burners And Contract

### G0.1 SDK Plugin Source Smoke

- [ ] Owner:
- [ ] Depends on: none
- [ ] Files likely touched:
  - `examples/extensions/hello-canvas/agent/hello-plugin/.plugin/plugin.json`
  - `examples/extensions/hello-canvas/agent/hello-plugin/**`
  - optional smoke helper under `scripts/` or `__tests__/extensions/`
- [ ] Implement:
  - Create the smallest SDK plugin fixture with a visible skill/context marker.
  - Start a local conversation with top-level `plugins: [{ source: absolutePluginPath }]`.
  - Confirm pinned Agent Server `1.23.0` accepts `PluginSource` and loads from a local path.
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
  - `__tests__/extensions/` or a small script fixture
- [ ] Implement:
  - Create a browser-ready ESM fixture exporting `mount({ root, context })`.
  - Verify static production build can dynamically import it from `/canvas-extensions/...`.
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
  - `src/extensions/types.ts`
  - `src/extensions/manifest-schema.ts`
  - `src/extensions/manifest-validation.ts`
  - `src/extensions/artifact-detection.ts`
  - `src/extensions/storage-paths.ts`
  - `__tests__/extensions/manifest-validation.test.ts`
  - `package.json`
  - `tsconfig.lib.json` if needed for emitted type paths
  - remove empty `src/addons/`
- [ ] Implement:
  - Manifest v1 types, contribution types, registry entry types, diagnostics, installable artifact kinds.
  - Validation for required fields, ID regex, duplicate/mutually exclusive `browser.module` and `browser.entry`, path containment, reserved `browser.entry`.
  - Artifact detection order: Agent Canvas extension, SDK plugin, skill, MCP placeholder.
  - Storage helpers for `~/.openhands/agent-canvas/installations`.
  - Public package export `@openhands/agent-canvas/extensions` and emitted `dist/extensions/*`.
- [ ] Tests:
  - Valid extension manifest.
  - Missing required fields.
  - Bad ID.
  - Traversal in manifest/browser/icon/plugin paths.
  - Both `browser.module` and `browser.entry`.
  - Reserved `browser.entry` diagnostic.
  - Standalone SDK plugin / `SKILL.md` detection returns unsupported-in-MVP kind.
- [ ] Verification:

```sh
npm run typecheck
npm test -- __tests__/extensions/manifest-validation.test.ts
npm run build:lib
```

- [ ] Done when:
  - Type consumers can import from `@openhands/agent-canvas/extensions`.
  - No runtime host, CLI store, or UI behavior is introduced in this gate.
- [ ] Handoff notes:

## 4. Gate G1: Manager, CLI, Host, And Routing

### G1.1 Extension Manager Library

- [ ] Owner:
- [ ] Depends on: G0.3
- [ ] Files likely touched:
  - `scripts/extension-manager.mjs`
  - `__tests__/extensions/extension-manager.test.ts`
  - `__tests__/extensions/fixtures/**`
- [ ] Implement:
  - Store bootstrap: private `package.json`, `package-lock.json`, `artifacts.json`, `config.json`, `logs/`, `dev/`, `node_modules/`.
  - Read/write registry state with atomic-ish writes where practical.
  - Install Agent Canvas extension manifests from local paths first; tarball/npm spec can follow in the same gate if scoped.
  - Run npm installs in the private store with `--ignore-scripts` by default.
  - Enable/disable/remove/update state transitions.
  - Disabled wins over enabled if config is manually inconsistent.
  - Typed unsupported diagnostics for standalone SDK plugin, `SKILL.md`, and MCP-template artifacts.
  - Registry projection with `assetBaseUrl`, diagnostics, state, version, package name.
  - Launch contribution projection from enabled extensions.
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
npm test -- __tests__/extensions/extension-manager.test.ts
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
  - `__tests__/extensions/extension-cli.test.ts`
- [ ] Implement:
  - Dispatch `install`, `list`, `enable`, `disable`, `remove`, `update`, `doctor`, and `dev-extension` before stack startup.
  - Dispatch before checking for `build/`.
  - Dispatch before importing `scripts/dev-with-automation.mjs`.
  - `--disable-extensions` remains a process-local stack-start flag.
  - Help text includes management commands and global install happy path.
  - `doctor` reports invalid manifests, unsupported standalone artifacts, missing assets, package/export issues where detectable.
- [ ] Tests:
  - `agent-canvas list extensions` works with no `build/`.
  - `agent-canvas doctor` works with no `build/`.
  - Unknown command produces useful help.
  - `install --install-scripts=deny` is default.
- [ ] Verification:

```sh
node bin/agent-canvas.mjs list extensions
node bin/agent-canvas.mjs doctor
npm test -- __tests__/extensions/extension-cli.test.ts
```

- [ ] Done when:
  - Management commands are usable from source checkout and packed global install without launching services.
- [ ] Handoff notes:

### G1.3 Extension Host HTTP Service

- [ ] Owner:
- [ ] Depends on: G1.1
- [ ] Files likely touched:
  - `scripts/extension-host.mjs`
  - `__tests__/extensions/extension-host.test.ts`
- [ ] Implement:
  - `GET /api/canvas/installations/registry`
  - `GET /api/canvas/installations/diagnostics`
  - `POST /api/canvas/installations/install`
  - `POST /api/canvas/installations/:id/enable`
  - `POST /api/canvas/installations/:id/disable`
  - `DELETE /api/canvas/installations/:id`
  - `PATCH /api/canvas/installations/:id/settings`
  - `GET /api/canvas/installations/launch-contributions`
  - `GET /canvas-extensions/:id/*assetPath`
  - Session API key guard for mutating routes.
  - Static asset path containment and content types.
- [ ] Tests:
  - Registry and diagnostics read.
  - Mutating routes reject missing/bad API key.
  - Asset serving works and traversal fails.
  - Launch-contributions filters disabled/invalid extensions.
- [ ] Verification:

```sh
npm test -- __tests__/extensions/extension-host.test.ts
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
  - Route `/api/canvas/installations/*` and `/canvas-extensions/*` before `/api/*` and before SPA fallback.
  - Add Vite proxy support for direct Vite access.
  - Add static server route support for direct static-port access.
  - Emit frontend env/runtime metadata: extension enabled flag, `localInstallStoreReadable`, route/base if needed.
  - Do not expose a write-capable Extension Host key in `<RUNTIME_SERVICES>`.
- [ ] Tests:
  - Route precedence unit tests for `scripts/static-server.mjs` and ingress route ordering.
  - Launcher config test for `localInstallStoreReadable=true` only when this launcher starts the local Agent Server.
  - Vite config contains extension routes before generic `/api` where applicable.
- [ ] Verification:

```sh
npm test -- __tests__/vite-config.test.ts
npm test -- __tests__/extensions
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
  - `__tests__/extensions/package-smoke.test.ts` if automated
- [ ] Implement:
  - Ensure `files` includes every runtime script/build artifact needed by the global CLI and Extension Host.
  - Ensure `./extensions` export resolves from packed package.
  - Add a repeatable smoke for packed tarball install into a temp npm prefix if practical.
- [ ] Verification:

```sh
npm run build
npm run build:lib
npm pack --dry-run
```

- [ ] Done when:
  - Packed package contains `bin`, `scripts`, `build`, `dist/extensions`, and any advertised schema files.
  - `agent-canvas list extensions` and `agent-canvas doctor` work from packed/global install.
- [ ] Handoff notes:

## 6. Gate G3: Frontend Packages Management

### G3.1 ExtensionService API Wrapper

- [ ] Owner:
- [ ] Depends on: G1.3
- [ ] Files likely touched:
  - `src/api/extensions-service.ts`
  - `src/api/no-direct-agent-server-calls.test.ts`
  - `src/hooks/query/use-extensions.ts`
- [ ] Implement:
  - Dedicated wrapper for every `/api/canvas/installations/*` call.
  - Narrow test exception for this wrapper, including the current `fetch('/api/...')` guard.
  - React Query hooks for registry, diagnostics, install, enable, disable, remove, settings patch, launch contributions.
- [ ] Tests:
  - No-direct-Agent-Server guard still fails arbitrary `/api/*` fetches outside the wrapper.
  - Wrapper builds the expected routes and auth headers.
- [ ] Verification:

```sh
npm test -- src/api/no-direct-agent-server-calls.test.ts
npm run typecheck
```

- [ ] Done when:
  - Frontend consumers never hand-roll Extension Host fetches.
- [ ] Handoff notes:

### G3.2 Packages Page

- [ ] Owner:
- [ ] Depends on: G3.1
- [ ] Files likely touched:
  - `src/routes.ts`
  - `src/routes/extensions-packages.tsx`
  - `src/components/features/skills/extensions-navigation.tsx`
  - `src/i18n/translation.json`
  - generated i18n files via `npm run make-i18n`
  - `tests/e2e/snapshots/**`
- [ ] Implement:
  - Replace or redirect `/plugins` to Packages while preserving bookmarks.
  - Packages nav item in the Extensions hub.
  - Sections for Enabled, Installed/Disabled, Invalid, Dev.
  - Cards show display name, package, version, state, contribution badges, required secrets, diagnostics, source path for dev entries.
  - Actions for install, enable, disable, remove.
  - User-facing copy goes through i18n keys.
- [ ] Tests:
  - Component tests for empty/enabled/invalid/dev states.
  - Snapshot tests for key states if scope allows in the PR.
- [ ] Verification:

```sh
npm run make-i18n
npm run typecheck
npm test
```

- [ ] Done when:
  - A user can see and manage `hello.canvas` from the UI.
- [ ] Handoff notes:

## 7. Gate G4: Browser Module View Host And Sidebar

### G4.1 Extension Runtime Host

- [ ] Owner:
- [ ] Depends on: G1.3, G2.1, G3.1
- [ ] Files likely touched:
  - `src/routes.ts`
  - `src/routes/extension-view-host.tsx`
  - `src/extensions/runtime/*`
  - `src/i18n/translation.json`
- [ ] Implement:
  - Route `/extensions/:extensionId/:viewId/*`.
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

### G4.2 Primary Sidebar Entries

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

## 8. Gate G5: Conversation Contributions

### G5.1 Launch Contributions And Runtime Compatibility

- [ ] Owner:
- [ ] Depends on: G1.3, G3.1
- [ ] Files likely touched:
  - `src/api/extensions-service.ts`
  - `src/extensions/runtime-compatibility.ts`
  - `__tests__/extensions/runtime-compatibility.test.ts`
- [ ] Implement:
  - `ExtensionsService.getLaunchContributions()`.
  - Runtime classes: `canvas-local`, `agent-server-local`, `agent-server-remote`, `cloud-runtime`, `acp-runtime`.
  - Use launcher-issued `localInstallStoreReadable`.
  - Disable package-relative/local SDK plugin paths unless filesystem-local.
  - Disable extension SDK plugins for ACP unless the G0 smoke proves allowed.
  - Do not assume public marketplace skills are loaded.
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
  - `__tests__/extensions/conversation-contributions.test.ts`
- [ ] Implement:
  - `extensionSystemSuffix` adapter option.
  - Append `<AGENT_CANVAS_RUNTIME>` and `<AGENT_CANVAS_EXTENSIONS>` after `<RUNTIME_SERVICES>`.
  - Merge extension plugin specs with existing `/launch` plugin selections.
  - Dedupe by `source/ref/repo_path`.
  - Preserve current top-level `agent_settings` and top-level `plugins` payload shape.
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
  - `src/api/extensions-service.ts`
  - `src/routes/extensions-packages.tsx`
  - tests under `__tests__/extensions/`
- [ ] Implement:
  - `agent-canvas install <path> --dev`.
  - `agent-canvas dev-extension register/list/unregister`.
  - Store registrations in `~/.openhands/agent-canvas/installations/dev/dev-extensions.json`.
  - No repo auto-discovery.
  - Serve assets directly from registered source folder.
  - Watch manifest and declared output files.
  - Manifest changes revalidate and update diagnostics.
  - Browser module changes bump version token and remount affected views.
  - Agent-side changes require new conversation.
- [ ] Tests:
  - Registration/unregistration.
  - Absolute path storage.
  - Traversal rejection.
  - Invalid manifest update transitions to invalid diagnostics.
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
node bin/agent-canvas.mjs list extensions
node bin/agent-canvas.mjs doctor
node bin/agent-canvas.mjs
```

- [ ] Browser checks:
  - Packages shows `hello.canvas` enabled with no diagnostics.
  - Sidebar entry appears after Automations and before conversations.
  - Extension view renders.
  - Extension settings patch persists.
  - Launch template shows context/plugin contribution preflight.
  - Conversation payload includes extension suffix.
  - Remote/cloud compatibility path shows disabled reason for local plugin path.
  - Dev registration and remount path works in `npm run dev`.
- [ ] Done when:
  - The PoC works from a clean checkout.
- [ ] Handoff notes:

### G7.2 Packed Global Install Acceptance

- [ ] Owner:
- [ ] Depends on: G7.1
- [ ] Run from a temp directory/prefix:
  - Install the packed `@openhands/agent-canvas` tarball.
  - Verify `agent-canvas list extensions`.
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
- [ ] `/api/canvas/installations/*` traffic is isolated behind `src/api/extensions-service.ts`.
- [ ] Ordinary Agent Server API calls still use `@openhands/typescript-client`.
- [ ] Browser modules are trusted same-origin DOM islands and documented/consented as such.
- [ ] Bare runtime imports in extension browser modules are rejected for MVP.
- [ ] Local SDK plugin paths are sent only when `localInstallStoreReadable=true`.
- [ ] ACP runtimes do not receive incompatible extension plugin/MCP contributions.
- [ ] `conversationInstructions` never receives extension system context.
- [ ] Extension context composes with existing `<RUNTIME_SERVICES>` suffix.
- [ ] `hello.canvas` proves install, registry, UI, sidebar, view, settings, launch context, SDK plugin preflight, and dev remount.
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
