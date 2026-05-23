# Agent Canvas Extensions MVP / PoC Build Plan

Status: working build plan
Source RFC: [ExtensionsSystemRFC.md](./ExtensionsSystemRFC.md)
Target branch: `dv/extensions-poc-v1`

## 1. Purpose

This document turns the Extensions RFC into a practical MVP / PoC build path. The RFC should stay clean and reviewable as the product/architecture proposal. This plan is the working artifact for agents and developers implementing the proof, testing risky assumptions, and tightening the design based on real code.

The MVP should be built as a vertical proof, not as isolated architecture layers. The first complete proof should demonstrate:

1. A local or npm-packed extension installs into `~/.openhands/agent-canvas/installations`.
2. The Packages page shows the installed extension and its diagnostics.
3. A trusted `browser.module` view renders at `/extensions/:extensionId/:viewId/*`.
4. A view can contribute a primary Sidebar entry after Automations and before the conversation list.
5. A launch template can append extension context and include an SDK plugin when the runtime is filesystem-local.
6. Dev mode can register a local source folder, detect output changes, and remount the view without rebuilding Canvas.

## 2. Risk-Burner Spikes

Do these first, before investing in polished UI.

### 2.1 SDK Plugin Source Smoke

Add a tiny fixture SDK plugin under:

```text
examples/extensions/hello-canvas/agent/hello-plugin
```

Start a local conversation with its resolved absolute path in `plugins`. Confirm the current pinned Agent Server accepts the `PluginSource` shape and can load a package-relative path when `localInstallStoreReadable` is true.

If this fails, keep context contributions in MVP and move SDK plugin merge behind a feature flag until the SDK team confirms the loading contract.

### 2.2 Static Dynamic-Import Smoke

Serve a tiny browser-ready ESM file from a local test host and dynamically import it from the static production build.

The extension module must use only bundled or relative imports. This proves the DOM-island `mount()` contract works without Vite, shared React, import maps, or module federation.

### 2.3 Launcher Route Smoke

Start a toy Extension Host and route `/api/canvas/installations/*` plus `/canvas-extensions/*` through the existing ingress/static-server/Vite proxy paths.

Cover:

- `scripts/dev-with-automation.mjs` ingress routes.
- `scripts/static-server.mjs` routes used by the packaged CLI/static mode.
- `vite.config.ts` proxy support for direct Vite access, especially `/canvas-extensions/*`.

Exit criteria: a browser opened through either the ingress port or direct Vite/static port can fetch registry JSON and import a browser module from `/canvas-extensions/...`.

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

Keep validation deliberately boring:

- manifest v1 required fields
- ID rules
- relative-path containment
- mutually exclusive `browser.module` / `browser.entry`
- `reserved-not-yet-supported` diagnostic for `browser.entry`

Avoid a large JSON Schema dependency unless configuration forms force it.

### 3.2 Manager Library

Add `scripts/extension-manager.mjs` as the single source of truth for install-store reads/writes. Both CLI and HTTP host call this module.

It owns:

- Store bootstrap: `package.json`, `package-lock.json`, `config.json`, `artifacts.json`, `logs/`.
- Artifact detection.
- Install from local path, tarball, npm spec.
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

MVP install can support local paths first, then npm specs. Npm installs must run in the private install store with install scripts denied by default.

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
- Extension Host URL for dev tooling if needed.

Do not expose a write-capable Extension Host key in agent prompts.

## 4. Frontend Proof

### 4.1 API Wrapper

Add `src/api/extensions-service.ts` for every `/api/canvas/installations/*` call.

Update `src/api/no-direct-agent-server-calls.test.ts` with one narrow allowlist entry for this wrapper, mirroring automation.

### 4.2 Packages Page

Replace `/plugins` with a Packages view, while preserving redirects/bookmarks. Use the existing Extensions layout and navigation.

The page should:

- Add a Packages nav item in `ExtensionsNavigation`.
- Show Enabled, Installed, Disabled, Invalid, and Dev sections.
- Show install source, version, contribution badges, required secrets, diagnostics, enable/disable/remove actions.
- Stay dense and operational; no marketplace browsing in MVP.

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
- MCP templates: visible as setup requirements, never silently installed.

### 5.3 Create-Conversation Merge

Extend the create-conversation path with an `extensionSystemSuffix` option:

- `useCreateConversation()` can receive extension launch selections.
- `AgentServerConversationService.createConversation()` asks the extensions service for enabled/selected contributions.
- Plugin specs merge with existing `/launch` plugin selections and dedupe by `source/ref/repo_path`.
- `agent-server-adapter.ts` appends `<AGENT_CANVAS_RUNTIME>` and `<AGENT_CANVAS_EXTENSIONS>` after `<RUNTIME_SERVICES>`.
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
node bin/agent-canvas.mjs install ./examples/extensions/hello-canvas --yes
node bin/agent-canvas.mjs list extensions
node bin/agent-canvas.mjs
```

Then in the browser:

1. Open Packages and see `hello.canvas` enabled with no diagnostics.
2. See its primary Sidebar entry after Automations and before the conversation list.
3. Open its extension view from the Sidebar and see browser-module UI render.
4. Change a setting in the extension view and see it persist.
5. Start its launch template and verify the conversation payload includes the extension context suffix.
6. In `npm run dev`, register the same extension with `--dev`, rebuild the extension output, and see the view remount with the new code.

## 8. Testing Strategy

**Unit:** manifest validation; reserved `browser.entry` diagnostics; path traversal rejection; artifact detection; install-store bootstrap; enable/disable/remove/update state transitions; duplicate ID handling; asset route path validation; CLI arg parsing; no-install-scripts default; launch contribution projection; context suffix rendering; plugin merge/dedupe; runtime compatibility classification; dev registration and manifest revalidation.

**Node integration:** run the Extension Host against a temp install store; install the `hello.canvas` fixture from local path and npm-packed tarball; fetch registry and asset URLs; verify mutating routes require the session API key; verify `doctor` reports invalid manifests and missing assets.

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
- Package signing/provenance UI.
- Rich command palette integration.
- Agent-mediated installation.
- Automatic MCP installation.
- Per-run exact extension enablement.
- Shared React/design-system runtime imports for extensions.
- Remote/cloud delivery of local extension package contents.
