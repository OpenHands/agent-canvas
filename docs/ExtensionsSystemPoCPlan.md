# Agent Canvas Extensions MVP / PoC Build Plan

Status: working build plan
Source RFC: [ExtensionsSystemRFC.md](./ExtensionsSystemRFC.md)
Agent execution checklist: [ExtensionsSystemAgentExecutionPlan.md](./ExtensionsSystemAgentExecutionPlan.md)
Target branch: `dv/extensions-poc-v1`
Current repo baseline: merged through `upstream/main` at `929e5afc` / `origin/main` at `62f5eae7`. The plan below has been refreshed for the current launcher/auth split, partial-stack modes, MCP integrations catalog, `agentServer` pin `1.24.0`, and public skills defaulting on.

## 1. Purpose

This document turns the Extensions RFC into a practical MVP / PoC build path. The RFC should stay clean and reviewable as the product/architecture proposal. This plan is the working artifact for agents and developers implementing the proof, testing risky assumptions, and tightening the design based on real code.

For multi-agent implementation, use [ExtensionsSystemAgentExecutionPlan.md](./ExtensionsSystemAgentExecutionPlan.md) as the task checklist. It breaks this plan into gates, parallel workstreams, task IDs, file ownership, verification commands, and handoff notes.

The MVP should be built as a vertical proof, not as isolated architecture layers. The first complete proof should demonstrate:

1. A local or npm-packed Agent Canvas extension installs into `~/.openhands/agent-canvas/installations`.
2. The Packages page shows the installed extension and its diagnostics.
3. A trusted `browser.module` view renders at `/extensions/:extensionId/:viewId/*`.
4. A view can contribute a primary Sidebar entry after Automations and before the conversation list, matching the current `SidebarRailBody` order (`New Chat`, `Customize`, `Automations`, then conversations).
5. A launch template can append extension context and include an SDK plugin when the runtime is filesystem-local.
6. Dev mode can register a local source folder, detect output changes, and remount the view without rebuilding Canvas.

## 1.1 Scope Locks From The RFC

These decisions should keep the build from spreading sideways:

- First-class install/enable support is for Agent Canvas extension manifests only. Standalone SDK plugins, `SKILL.md` folders, and future MCP-template artifacts can be detected, but they return an explicit unsupported-in-MVP diagnostic unless wrapped by an extension.
- CLI management commands must dispatch before stack startup, before the static `build/` existence check, and before importing `scripts/dev-with-automation.mjs`.
- CLI management commands must also dispatch before `--public`, `--frontend-only`, and `--backend-only` stack validation, because `install/list/doctor` should work even when no frontend/backend is being launched.
- Extension author types need a real package subpath: `@openhands/agent-canvas/extensions`, emitted under `dist/extensions/*` and included in npm release checks.
- Conversation contribution work targets the current start payload: top-level `agent_settings` plus optional top-level `plugins`. Do not reintroduce the legacy `agent` payload shape.
- Package-relative/local SDK plugin sources are MVP only when the launcher says `localInstallStoreReadable=true`. ACP runtimes skip extension SDK plugins unless a pinned-version smoke proves the exact plugin shape is compatible.

## 2. Risk-Burner Spikes

Do these first, before investing in polished UI.

### 2.1 SDK Plugin Source Smoke

Add a tiny fixture SDK plugin under:

```text
examples/extensions/hello-canvas/agent/hello-plugin
```

Start a local conversation with its resolved absolute path in top-level `plugins`. Confirm the current pinned Agent Server (`config/defaults.json` pins `agentServer` to `1.24.0`) accepts the SDK `PluginSource` shape (`source`, optional `ref`, optional `repo_path`) and can load a package-relative path when `localInstallStoreReadable` is true. The plugin root should contain `.plugin/plugin.json`; if a fixture uses a local path, resolve `source` directly to the plugin root and omit `repo_path`.

Also run the same contribution preflight with an ACP agent configuration. If ACP fails or the plugin injects MCP/hooks/tool/agent-definition state, keep ACP on context-only extension support and show disabled reasons for SDK plugin contributions. If the local-path smoke fails for the pinned server, keep context contributions in MVP and move SDK plugin merge behind a feature flag until the SDK team confirms the loading contract.

### 2.2 Static Dynamic-Import Smoke

Serve a tiny browser-ready ESM file from a local test host and dynamically import it from the static production build.

The extension module must use only bundled or relative imports. This proves the DOM-island `mount()` contract works without Vite, shared React, import maps, or module federation.

Add a negative fixture with a bare runtime import such as `react` and verify validation rejects it with an actionable diagnostic. Type-only imports from `@openhands/agent-canvas/extensions` are fine because the extension build erases them; runtime imports from that package are not MVP-supported.

### 2.3 Launcher Route Smoke

Start a toy Extension Host and route `/api/canvas/installations/*` plus `/canvas-extensions/*` through the existing ingress/static-server/Vite proxy paths.

Cover:

- `scripts/dev-with-automation.mjs` ingress routes.
- `scripts/dev-safe.mjs` / `dev:minimal`, where direct Vite proxying must handle Extension Host routes without the automation ingress.
- `scripts/static-server.mjs` routes used by the packaged CLI/static mode.
- `vite.config.ts` proxy support for direct Vite access, especially `/canvas-extensions/*`.
- `--frontend-only` and `--backend-only` partial-stack behavior: frontend-only can expose Packages/extension views but should show backend-dependent diagnostics, while backend-only should not start the Extension Host view/assets path unless a future CLI-only host mode explicitly needs it.

Exit criteria: a browser opened through either the ingress port or direct Vite/static port can fetch registry JSON and import a browser module from `/canvas-extensions/...`.

### 2.4 Npm Package / CLI Smoke

Before any UI work, prove the upcoming release path:

```sh
npm run build
npm run build:lib
npm pack --dry-run
node bin/agent-canvas.mjs list extensions
node bin/agent-canvas.mjs doctor
```

Then install from a packed tarball into a temp npm prefix and verify `agent-canvas list` and `agent-canvas doctor` work without a source checkout. This catches missing `scripts`, `build`, `dist/extensions`, schema files, and command-dispatch regressions before the feature depends on them.

## 3. Walking Skeleton

Build the thinnest end-to-end slice next.

### 3.1 Shared Contract

Add:

- `src/extensions/types.ts`
- manifest constants
- artifact detection
- storage-path helpers
- path normalization
- manifest validation
- public package export wiring for `@openhands/agent-canvas/extensions`

Keep validation deliberately boring:

- manifest v1 required fields
- ID rules
- relative-path containment
- mutually exclusive `browser.module` / `browser.entry`
- `reserved-not-yet-supported` diagnostic for `browser.entry`

Avoid a large JSON Schema dependency unless configuration forms force it.

PR 0 should also update `package.json#exports` for `./extensions` and make sure the library build emits `dist/extensions/*`. Keep the actual Extension Host and CLI behavior out of PR 0.

### 3.2 Manager Library

Add `scripts/extension-manager.mjs` as the single source of truth for install-store reads/writes. Both CLI and HTTP host call this module.

It owns:

- Store bootstrap: `package.json`, `package-lock.json`, `config.json`, `artifacts.json`, `logs/`.
- Artifact detection.
- Install Agent Canvas extension manifests from local path, tarball, npm spec.
- Typed unsupported diagnostics for detected standalone SDK plugins, standalone skills, and placeholder MCP templates.
- Enable/disable/remove/update.
- Registry and launch-contribution projection.
- Dev registration reads/writes.

### 3.3 CLI Dispatch

Update `bin/agent-canvas.mjs` so install/manage commands dispatch before stack startup:

```sh
agent-canvas install ./examples/extensions/hello-canvas --yes
agent-canvas list extensions
agent-canvas enable hello.canvas
agent-canvas disable hello.canvas
agent-canvas doctor
agent-canvas --disable-extensions
```

This dispatch must happen before public/partial-stack validation, before checking for `build/`, and before importing launcher scripts. MVP install can support local extension paths first, then npm specs. Npm installs must run in the private install store with install scripts denied by default. Standalone SDK plugin/skill/MCP-template inputs should return clear unsupported diagnostics rather than mutating user runtime state.

### 3.4 Extension Host

Add `scripts/extension-host.mjs`, a local Node HTTP service backed by `extension-manager`.

It should expose:

- registry
- diagnostics
- launch contributions
- settings
- enable/disable/remove
- install
- static asset routes

Mutating routes require the same session API key model the frontend already uses.

### 3.5 Launcher Integration

Add an `extensionHostPort` to launcher config, start the host before the frontend, and route it before `/api/*`:

- `/api/canvas/installations/*` -> Extension Host.
- `/canvas-extensions/*` -> Extension Host.
- `/api/automation/*` -> automation.
- `/api/*`, `/sockets`, server metadata -> Agent Server.

The launcher also emits frontend env/runtime metadata for:

- `VITE_EXTENSIONS_ENABLED` or equivalent kill-switch state.
- `VITE_LOCAL_INSTALL_STORE_READABLE=true` only when this `agent-canvas` process started the local Agent Server.
- Extension Host route/base metadata if direct Vite/static access needs it.
- Extension Host URL for dev tooling if needed.

Do not expose a write-capable Extension Host key in agent prompts.

Route precedence is the failure-prone part: `/api/canvas/installations/*` and `/canvas-extensions/*` must match before `/api/*` and static SPA fallback in every launcher path.

Partial-stack mode rule: frontend-only may start enough Extension Host surface to render local Packages and extension browser assets, but must mark agent-runtime contributions unavailable because no Agent Server is running. Backend-only should skip frontend asset hosting and extension browser routes by default; CLI management still works because it dispatches before stack startup.

## 4. Frontend Proof

### 4.1 API Wrapper

Add `src/api/extensions-service.ts` for every `/api/canvas/installations/*` call.

Update `src/api/no-direct-agent-server-calls.test.ts` with one narrow allowlist entry for this wrapper, mirroring automation but covering the current blanket `fetch('/api/...')` rule as well as axios. The exception should allow only `/api/canvas/installations/*` from the wrapper; it must not weaken the Agent Server rule for arbitrary `/api/*` calls.

### 4.2 Packages Page

Replace `/plugins` with a Packages view, while preserving redirects/bookmarks. Use the existing Extensions layout and navigation: `/customize` is the primary-sidebar hub entry, desktop redirects to `/skills`, mobile renders `ExtensionsMobileHub`, and `ExtensionsNavigation` currently contains Skills, MCP Servers, and a coming-soon Plugins item.

The page should:

- Add a Packages nav item in `ExtensionsNavigation`.
- Show Enabled, Installed, Disabled, Invalid, and Dev sections.
- Show install source, version, contribution badges, required secrets, diagnostics, enable/disable/remove actions.
- Stay dense and operational; no marketplace browsing in MVP.
- Route all visible strings, tooltips, and action labels through i18n keys.

### 4.3 View Host

Add `/extensions/:extensionId/:viewId/*` and a route component that:

- Fetches registry data.
- Resolves `assetBaseUrl + browser.module`.
- Dynamically imports the module with a cache-busting version.
- Calls `mount({ root, context })`.
- Calls `dispose()` on unmount/remount.
- Provides minimal context: extension metadata/settings, `navigation.navigate`, `navigation.openExternal`, `ui.toast`, `settings.readExtensionSettings`, and `settings.patchExtensionSettings`.

The extension view should be visibly extension-owned but render in a Canvas-owned route container. Errors stay local to the extension view.

### 4.4 Primary Sidebar Entries

Support view navigation contributions that render in the main Canvas Sidebar:

```json
{
  "navigation": {
    "location": "primarySidebar",
    "slot": "afterAutomations",
    "order": 300,
    "icon": "./dist/cost-dashboard.svg"
  }
}
```

MVP scope:

- Only `primarySidebar` + `afterAutomations` is required.
- Entries render after Automations and before `SidebarConversationList`.
- Entries navigate to `/extensions/:extensionId/:viewId/*`.
- Disabled/invalid extensions do not render entries.
- Sorting is deterministic: `order`, extension display name, view ID.
- Expanded sidebar shows icon + title.
- Collapsed sidebar shows icon with a tooltip.
- Mobile drawer shows the same entry in the same relative position.

This is the path that proves the original addons-style PoC works. Example: `hello.canvas` can include a Cost Dashboard view that appears immediately after Automations.

## 5. Conversation Contributions

Add contribution merge late enough that the install/store/view path already works.

### 5.1 Launch Contributions Endpoint

`ExtensionsService.getLaunchContributions()` fetches enabled extension contributions and returns a frontend-ready, compatibility-filtered shape.

### 5.2 Runtime Compatibility

Compute disabled reasons before launch:

- Context blocks: allowed anywhere `system_message_suffix` is accepted.
- Remote SDK plugin sources: allowed where `plugins` are accepted.
- Package-relative/local SDK plugin paths: allowed only when `localInstallStoreReadable` is true.
- ACP runtimes: context-only unless the SDK plugin smoke proves the exact plugin shape is ACP-compatible.
- MCP templates: visible as setup requirements, never silently installed.
- Public skills: do not assume public marketplace skills are loaded; current frontend defaults to loading them unless `VITE_LOAD_PUBLIC_SKILLS=false`, but users and deployments can opt out.

### 5.3 Create-Conversation Merge

Extend the create-conversation path with an `extensionSystemSuffix` option:

- `useCreateConversation()` can receive extension launch selections.
- `AgentServerConversationService.createConversation()` asks the extensions service for enabled/selected contributions.
- Plugin specs merge with existing `/launch` plugin selections and dedupe by `source/ref/repo_path`.
- `agent-server-adapter.ts` appends `<AGENT_CANVAS_RUNTIME>` and `<AGENT_CANVAS_EXTENSIONS>` after `<RUNTIME_SERVICES>`.
- The adapter continues to preserve the current top-level payload shape: `agent_settings`, `workspace`, `confirmation_policy`, `tool_module_qualnames`, optional `initial_message`, optional `plugins`, and runtime fields such as `hook_config`, `agent_definitions`, `security_analyzer`, `tags`, and `secrets`. No `agent` payload field is added.
- `conversationInstructions` remains user-message content and never receives extension context.

For the first proof, a `hello.canvas` launch template should append a recognizable context block so the payload/unit test can prove the suffix path works without depending on LLM behavior.

## 6. Dev Mode

Dev mode should prove contributor ergonomics without turning Canvas into a build runner:

```sh
agent-canvas install ../my-extension --dev
agent-canvas dev-extension register ../my-extension
agent-canvas dev-extension list
agent-canvas dev-extension unregister hello.canvas
```

Rules:

- Dev registration stores absolute paths in `~/.openhands/agent-canvas/installations/dev/dev-extensions.json`.
- Canvas never auto-discovers repo folders.
- The extension project owns its build/watch command.
- Canvas watches the manifest and declared output files.
- Manifest changes revalidate and update diagnostics.
- Browser module changes bump a version token and remount only affected views.
- Agent-side contribution changes require a new conversation.

The example extension should include a minimal `npm run build -- --watch` authoring flow in docs, but Canvas should not run that command automatically.

## 7. Acceptance Demo

The MVP is proven when this scriptable path works from a clean checkout:

```sh
npm run build
npm run build:lib
npm pack --dry-run
node bin/agent-canvas.mjs install ./examples/extensions/hello-canvas --yes
node bin/agent-canvas.mjs list extensions
node bin/agent-canvas.mjs doctor
node bin/agent-canvas.mjs
```

Then in the browser:

1. Open Packages and see `hello.canvas` enabled with no diagnostics.
2. See its primary Sidebar entry after Automations and before the conversation list.
3. Open its extension view from the Sidebar and see browser-module UI render.
4. Change a setting in the extension view and see it persist.
5. Start its launch template and verify the conversation payload includes the extension context suffix.
6. In `npm run dev`, register the same extension with `--dev`, rebuild the extension output, and see the view remount with the new code.

Release-path acceptance should also install the packed `@openhands/agent-canvas` tarball into a temp npm prefix and repeat `agent-canvas list`, `agent-canvas doctor`, and one packed/local extension install without relying on repo-local files outside the package.

## 8. Testing Strategy

**Unit:** manifest validation; reserved `browser.entry` diagnostics; path traversal rejection; artifact detection; unsupported standalone artifact diagnostics; install-store bootstrap; enable/disable/remove/update state transitions; duplicate ID handling; asset route path validation; CLI arg parsing before build checks; no-install-scripts default; launch contribution projection; context suffix rendering; plugin merge/dedupe; runtime compatibility classification; dev registration and manifest revalidation.

**Node integration:** run the Extension Host against a temp install store; install the `hello.canvas` fixture from local path and npm-packed tarball; fetch registry and asset URLs; verify route precedence before `/api/*` in Vite, ingress, static server, and packaged CLI paths; verify mutating routes require the session API key; verify `doctor` reports invalid manifests, unsupported standalone artifacts, and missing assets.

**Release packaging:** `npm pack --dry-run`; packed-tarball install into a temp npm prefix; verify `agent-canvas list`, `agent-canvas doctor`, and an extension install work without a source checkout; verify `@openhands/agent-canvas/extensions` resolves for type consumers.

**Component:** Packages page empty/installed/enabled/invalid/dev states; install/enable/disable/remove action wiring; primary Sidebar extension entries in expanded/collapsed/mobile states; extension view loading/error/remount; extension settings read/patch; launch template preflight for incompatible SDK plugin paths.

**E2E snapshots:** Packages page with enabled extension; invalid extension diagnostics; primary Sidebar entry after Automations; extension view rendered from browser module; launch template showing context/plugin contribution; remote-backend disabled reason for local plugin path; dev extension view remount after output change.

**Live E2E:** optional after the walking skeleton. If added, keep one cheap local live test that starts a conversation from `hello.canvas` and verifies the created payload/events show the context suffix or plugin load marker. Follow existing live E2E rules under `tests/e2e/live/`.

**Verification:**

```sh
npm run typecheck && npm test && npm run build
```

## 9. Defer Until After Proof

- Marketplace/catalog discovery.
- Sandboxed iframe runtime.
- Standalone SDK plugin / standalone skill / standalone MCP-template management.
- Package signing/provenance UI.
- Rich command palette integration.
- Agent-mediated installation.
- Automatic MCP installation.
- Per-run exact extension enablement.
- Shared React/design-system runtime imports for extensions.
- Remote/cloud delivery of local extension package contents.
