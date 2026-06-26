# Design Proposal: A VS Code–style UI Extension System for Agent-Canvas

Status: Draft / RFC
Audience: Agent-Canvas frontend maintainers
Author: OpenHands (on behalf of the requester)

---

## 1. Introduction

### 1.1 Problem Statement

Today there is **no supported way for a third party (a "customer") to add a new UI
element to Agent-Canvas** — for example, a new button on the left sidebar rail that
opens a custom panel.

Concretely, the current constraints are:

- The sidebar is **hardcoded JSX**. Items are literal `<SidebarNavLink>` elements in
  `src/components/features/sidebar/sidebar-rail-body.tsx` (lines ~159–213). There is
  no registry, no iteration over a contribution list, and no extension slot.
- Routes are a **static, compile-time table** in `src/routes.ts`
  (`@react-router/dev`).
- There is **no runtime loader** for customer-supplied JavaScript: no module
  federation, no import-maps/SystemJS, no web components, no sandboxed UI host. Every
  `import()` in the tree is build-time code-splitting of in-repo modules.
- The existing **"Plugins" feature is a backend agent-server concern**
  (`src/api/plugins-service.ts`, `plugins-management-service.ts`). A "plugin" is a
  git source for agent *skills/tools* installed onto the agent-server filesystem
  (`PluginSpec { source, ref, repo_path, parameters }`). It contributes **nothing**
  to the React UI.

The impact: any new sidebar button, panel, or page must be written into the
Agent-Canvas source, reviewed, and shipped in a release. Customers cannot extend the
product surface themselves, and there is no isolation/security boundary for
third-party UI code even if they could.

### 1.2 Proposed Solution

Adopt the **VS Code extension model**, adapted to a browser SPA. The model has three
load-bearing ideas that map cleanly onto what we need:

1. **A declarative manifest with contribution points.** An extension ships a
   manifest (`extension.json`, mirroring VS Code's `package.json#contributes`) that
   *declares* what it adds — a sidebar (Activity Bar) item, a view, commands, menu
   items — without running any code. The Agent-Canvas shell renders these natively,
   so the common case (a sidebar button that opens a panel) requires **zero
   third-party DOM access**.

2. **An isolated extension host.** Extension *logic* runs in a sandboxed **Web
   Worker** (our analog of VS Code's separate Extension Host process). It never
   touches the Agent-Canvas DOM directly. It talks to the shell through a typed,
   versioned RPC — the `agentCanvas` API object, analogous to VS Code's `vscode`
   module.

3. **Webviews for custom UI.** When an extension needs fully custom UI, it renders
   into a **sandboxed `<iframe>` webview** (exactly VS Code's Webview API), again
   communicating with the host over `postMessage` RPC. This is the security boundary
   for arbitrary customer HTML/JS.

The result: a customer ships a bundle (manifest + worker JS + optional webview
assets); Agent-Canvas loads it, renders its declared sidebar button natively, and —
when clicked — opens either a native-rendered view or a sandboxed webview, all
without the customer's code ever having direct access to the host DOM, cookies, or
network credentials.

We deliberately **reuse the existing plugins catalog/management pipeline shape**
(catalog service + install/enable/disable lifecycle + React Query hooks + a
management page) for *distribution*, while adding the genuinely new piece: a
**frontend runtime that loads and sandboxes UI bundles**.

---

## 2. New Concepts (VS Code → Agent-Canvas mapping)

| VS Code concept | Agent-Canvas equivalent (proposed) | Notes |
|---|---|---|
| `package.json` + `contributes` | `extension.json` manifest | Declarative, validated with Zod. |
| Activity Bar | The left **sidebar rail** (`sidebar-rail-body.tsx`) | `contributes.viewsContainers.activitybar` adds a rail button. |
| View / View Container | A **panel** rendered in the main area or a side panel | `contributes.views`. |
| Webview (`vscode.window.createWebviewPanel`) | Sandboxed `<iframe>` panel + `postMessage` bridge | For arbitrary customer UI. |
| Command (`contributes.commands`) | Entry in the existing **Command-K menu** | We already ship a command menu (`CommandMenuTrigger`). |
| Menus (`contributes.menus`) | Contributed items in context/overflow menus | Phase 2. |
| Activation events | Lazy activation (`onView:*`, `onCommand:*`, `onStartup`) | Worker spins up only when needed. |
| Extension Host process | **Web Worker** per extension (or shared pool) | Isolation boundary for extension logic. |
| `vscode` module / API | `agentCanvas` API object injected into the worker | Versioned, capability-gated. |
| Marketplace / `vsce`/OpenVSX | Reuse the **plugins catalog** pattern | Catalog + install/enable store + management page. |
| `engines.vscode` | `engines.agentCanvas` semver range | Host/extension API compatibility gate. |

### 2.1 User scenario (the canonical case)

> A customer wants a **"Compliance" button** on the sidebar that opens a panel showing
> their internal policy checks for the current conversation.

1. They author an extension: an `extension.json` declaring an activity-bar item
   `compliance.open` with an icon and a view `compliance.panel`, plus a small worker
   `main.js` and a `panel.html`.
2. They publish it to a catalog (or install by URL/local path on a self-hosted
   backend, mirroring how plugins install today).
3. In Agent-Canvas, the customer opens **Customize → Extensions**, finds it, clicks
   **Install**, then **Enable**.
4. A **Compliance icon appears on the sidebar rail** immediately (declarative — no
   code ran yet).
5. Clicking it fires the `onView:compliance.panel` activation event; the worker
   starts, the webview iframe loads `panel.html`, and the panel calls
   `agentCanvas.conversation.getActive()` over RPC to render policy results.

No Agent-Canvas source code changed. The customer's JS ran only inside a Worker and a
sandboxed iframe.

---

## 3. Other Context

This proposal mirrors VS Code's real architecture, which is worth internalizing
because its security properties are exactly what "run a customer-supplied bundle"
demands:

- **Extensions cannot touch the editor DOM.** They run in a separate process
  (Extension Host) and interact only through the `vscode` API. UI is either
  *declarative* (contribution points) or *webview* (sandboxed iframe with a
  `postMessage` bridge and a strict CSP). We adopt the same split.
- **Contribution points are static JSON.** The vast majority of UI (menus, views,
  commands, activity-bar items) is declared, not coded. This means the *common* case
  is safe-by-construction: the host renders trusted native components from untrusted
  *data*.
- **Activation events** keep things lazy and cheap: extension code only runs when a
  relevant trigger fires.

Relevant host facts (already in the repo) that make this feasible:

- Build tooling: **Vite 8**, **React 19**, **React Router 7**, **TanStack Query 5**.
- An existing **Command-K menu** (`CommandMenuTrigger`) to host contributed commands.
- A working **catalog + install/enable/disable lifecycle** to clone for distribution
  (`src/api/plugins-service.ts`, `plugins-management-service.ts`, and the
  `use-*-plugin` hooks).
- A config-array nav precedent: `EXTENSIONS_NAV_ITEMS` in
  `src/components/features/skills/extensions-navigation.tsx` already maps a data array
  to navigation links — the exact shape we want for a registry-driven sidebar.

---

## 4. Technical Design

### 4.1 The extension manifest (`extension.json`)

A static, declarative manifest, validated at load time with **Zod**. Modeled on
`package.json#contributes`.

```json
{
  "id": "acme.compliance",
  "name": "Compliance",
  "version": "1.2.0",
  "publisher": "acme",
  "engines": { "agentCanvas": "^1.0.0" },
  "main": "main.js",
  "activationEvents": ["onView:compliance.panel", "onCommand:compliance.scan"],
  "capabilities": ["conversation:read"],
  "contributes": {
    "viewsContainers": {
      "activitybar": [
        { "id": "compliance.container", "title": "Compliance", "icon": "icon.svg" }
      ]
    },
    "views": {
      "compliance.container": [
        { "id": "compliance.panel", "name": "Policy Checks", "type": "webview" }
      ]
    },
    "commands": [
      { "command": "compliance.scan", "title": "Compliance: Scan Conversation" }
    ]
  }
}
```

Key points:

- `engines.agentCanvas` gates host/extension API compatibility (semver).
- `capabilities` is an **explicit, user-consented permission list** (see §4.7). The
  host refuses RPC calls outside declared capabilities.
- `contributes` is pure data: the host renders it; no extension code runs to show the
  sidebar button.
- `type: "webview"` views render in a sandboxed iframe; `type: "tree"`/native view
  types can be added later for purely declarative content.

### 4.2 Frontend contribution registry

A new in-memory **`ContributionRegistry`** is the heart of the system. Enabled
extensions register their (validated) contributions; host UI subscribes.

```ts
// src/extensions/registry.ts
export interface ActivityBarContribution {
  extensionId: string;
  containerId: string;
  title: string;
  iconUrl: string;          // resolved blob: URL from the bundle
  onActivate: ActivationTrigger;
}

export interface CommandContribution {
  extensionId: string;
  command: string;          // e.g. "compliance.scan"
  title: string;
}

class ContributionRegistry {
  private activityBar = new Map<string, ActivityBarContribution>();
  private commands = new Map<string, CommandContribution>();
  // ...views, menus...

  register(extensionId: string, contributes: ContributesManifest): void { /* ... */ }
  unregister(extensionId: string): void { /* ... */ }

  getActivityBarItems(): ActivityBarContribution[] { /* ... */ }
  subscribe(listener: () => void): () => void { /* ... */ }
}

export const contributionRegistry = new ContributionRegistry();
```

A React hook exposes it with `useSyncExternalStore`:

```ts
// src/extensions/use-contributions.ts
export function useActivityBarContributions(): ActivityBarContribution[] {
  return useSyncExternalStore(
    contributionRegistry.subscribe,
    contributionRegistry.getActivityBarItems,
  );
}
```

### 4.3 Sidebar refactor (the minimal host change)

Refactor `sidebar-rail-body.tsx` so built-in items and contributed items share one
render path. Built-ins stay first-class; contributions are appended.

```tsx
// src/components/features/sidebar/sidebar-rail-body.tsx (sketch)
const contributed = useActivityBarContributions();

return (
  <nav className={sidebarNavListClassName(collapsed)}>
    <CommandMenuTrigger collapsed={collapsed} />
    {/* ...existing built-in SidebarNavLinks... */}
    {contributed.map((item) => (
      <SidebarContributionButton
        key={`${item.extensionId}:${item.containerId}`}
        item={item}
        collapsed={collapsed}
        disabled={linkDisabled}
      />
    ))}
  </nav>
);
```

`SidebarContributionButton` renders the bundle-provided icon (sanitized SVG rendered
as a `blob:`/data URL, never `dangerouslySetInnerHTML`) and, on click, dispatches the
item's activation trigger to the extension host. This is the **only** structural
change to existing host UI required for the canonical sidebar-button scenario.

### 4.4 The extension host (Web Worker isolation)

Each enabled extension's `main.js` runs in a **Web Worker** — our Extension Host. The
worker:

- has **no DOM access**, no `window`, no host cookies;
- receives a single injected global, `agentCanvas`, which is a **proxy** that
  serializes calls over `postMessage` to the host;
- is created lazily on first matching **activation event**.

```ts
// src/extensions/host/extension-host.ts
class ExtensionHost {
  private workers = new Map<string, Worker>();

  async activate(ext: LoadedExtension, reason: ActivationTrigger): Promise<void> {
    if (this.workers.has(ext.id)) return;
    const worker = new Worker(ext.workerUrl, { type: "module", name: ext.id });
    this.bridge.attach(ext.id, worker, ext.capabilities); // typed RPC + cap-gating
    this.workers.set(ext.id, worker);
    this.bridge.call(ext.id, "activate", { reason });
  }

  deactivate(extId: string): void {
    this.workers.get(extId)?.terminate();
    this.workers.delete(extId);
    contributionRegistry.unregister(extId);
  }
}
```

Why a Worker and not just an iframe for logic: it gives us a clean, DOM-free
execution context with structured-clone messaging and easy teardown
(`worker.terminate()`), matching VS Code's "host code can't reach the UI" guarantee.

### 4.5 The `agentCanvas` API surface (the `vscode` analog)

Inside the worker, extensions import a thin SDK that proxies to the host. Everything
is async (RPC) and capability-gated.

```ts
// @agent-canvas/extension-api  (shipped as a tiny package; runs inside the worker)
export interface AgentCanvasApi {
  commands: {
    register(command: string, handler: () => void | Promise<void>): Disposable;
    execute(command: string, ...args: unknown[]): Promise<unknown>;
  };
  window: {
    showInformationMessage(message: string): Promise<void>;
    createWebviewPanel(viewId: string, options?: WebviewOptions): WebviewPanel;
  };
  conversation: {                       // gated by "conversation:read"
    getActive(): Promise<ConversationSummary | null>;
    onDidChange(listener: (c: ConversationSummary | null) => void): Disposable;
  };
  storage: {                            // per-extension, namespaced
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T): Promise<void>;
  };
}

export function activate(ctx: ExtensionContext): void { /* extension entrypoint */ }
```

The host implements the other side of each method against existing Agent-Canvas
services (e.g. `conversation.getActive()` reads the active conversation via the
current conversation-service). **No raw fetch/credentials are exposed**; network
access, if ever allowed, is mediated by host-side, capability-checked endpoints.

### 4.6 Webviews (custom UI in a sandboxed iframe)

For arbitrary customer UI, a contributed view of `type: "webview"` renders an
`<iframe sandbox="allow-scripts">` (no `allow-same-origin`, so it is origin-null and
cannot reach host cookies/storage) with a strict CSP. The iframe loads bundle assets
via `blob:`/served-from-extension-origin URLs and communicates over a `postMessage`
bridge identical in spirit to VS Code's webview messaging:

```ts
// inside the webview (customer code)
const api = acquireAgentCanvasApi();
api.postMessage({ type: "ready" });
window.addEventListener("message", (e) => { /* host -> webview */ });
```

```tsx
// host side: src/components/features/extensions/extension-webview.tsx
<iframe
  ref={frameRef}
  sandbox="allow-scripts"
  csp="default-src 'none'; script-src 'self' 'unsafe-inline'; ..."
  src={webviewHtmlBlobUrl}
  title={view.name}
/>
```

The host relays messages between the webview iframe and the extension's worker, so the
customer's panel UI and panel logic stay isolated from the shell and merely exchange
structured messages.

### 4.7 Capabilities & security model

- **Declared, consented permissions.** `capabilities` in the manifest are surfaced at
  install time ("This extension can: read the active conversation"). The host's RPC
  bridge rejects any call outside the granted set.
- **No ambient authority.** Workers/iframes get no host cookies, no `fetch` to host
  APIs, no `localStorage` of the shell. All host interaction is through the gated RPC.
- **Strict sandboxing.** Webviews: `sandbox="allow-scripts"` (origin-null) + CSP.
  Logic: Worker (no DOM). Icons/SVG are sanitized before rendering.
- **Supply-chain alignment.** Installing a UI bundle is a privileged action; on a
  cloud backend it stays disabled initially (exactly as plugins do today), and
  self-hosted installs from arbitrary URLs require explicit user action. This matches
  the repo's existing security posture for plugins.
- **Kill switch.** Disabling an extension calls `host.deactivate()` →
  `worker.terminate()` + `registry.unregister()`, removing its UI immediately.

### 4.8 Distribution — reuse the plugins pipeline shape

We mirror, not reuse-in-place, the plugins lifecycle so UI extensions feel native:

| Plugins (existing) | UI Extensions (new, same shape) |
|---|---|
| `src/api/plugins-service.ts` (catalog) | `src/api/ui-extensions-service.ts` (catalog) |
| `plugins-management-service.ts` (install/enable/...) | `ui-extensions-management-service.ts` |
| `use-plugins-marketplace`, `use-install-plugin`, ... | `use-ui-extensions-*` hooks |
| `routes/skills-plugins.tsx` (`/plugins`) | `routes/ui-extensions.tsx` (`/extensions`) |
| `EXTENSIONS_NAV_ITEMS` entry | new "Extensions" entry under Customize |

The crucial new component beyond this shape is the **loader** (§4.4–4.6): fetching a
bundle, validating its manifest, minting `blob:` URLs for worker + webview assets, and
registering contributions. Distribution answers "where does the bundle come from";
the loader answers "how does it safely become UI".

### 4.9 End-to-end flow

```
Install (catalog/URL) ──▶ store bundle (mgmt service)
Enable ──▶ loader: fetch + Zod-validate manifest
        └─▶ registry.register(contributes)   ← sidebar button appears (declarative)
Click sidebar button ──▶ activation event "onView:compliance.panel"
        └─▶ extensionHost.activate() spins up Worker (runs main.js)
        └─▶ host opens webview iframe (panel.html)
Panel calls agentCanvas.conversation.getActive() ──RPC──▶ host service ──▶ result
Disable ──▶ worker.terminate() + registry.unregister()  ← button + panel vanish
```

---

## 5. Implementation Plan

Each milestone is independently reviewable and demoable.

### Milestone 1 — Registry-driven sidebar (foundation, no third-party code)
- Add `src/extensions/registry.ts` (`ContributionRegistry`) and
  `src/extensions/use-contributions.ts`.
- Refactor `sidebar-rail-body.tsx` to append `useActivityBarContributions()` items via
  a new `SidebarContributionButton`.
- Seed the registry from a **static, in-repo** fixture to prove the render path.
- **Demo:** a contributed button appears on the rail from registry data.
- **Acceptance:** unit tests for registry + hook; `vitest`/`eslint` green; no behavior
  change for built-in items (existing sidebar tests pass).

### Milestone 2 — Manifest schema + loader (no execution yet)
- Define the `extension.json` Zod schema in `src/extensions/manifest.ts`.
- Build the loader: fetch a bundle (local fixture dir first), validate, mint `blob:`
  URLs for icons, register `contributes`.
- **Demo:** load a fixture extension from disk → its declared sidebar button renders;
  invalid manifests are rejected with a clear error.
- **Acceptance:** schema unit tests (valid/invalid manifests); loader tests with
  fixtures.

### Milestone 3 — Extension host + `agentCanvas` API (logic isolation)
- Implement `ExtensionHost` (Web Worker per extension), the `postMessage` RPC bridge,
  capability gating, and a first API slice: `commands.*`, `window.showInformationMessage`,
  `conversation.getActive`.
- Wire **activation events** (`onCommand:*`, `onView:*`, `onStartup`).
- Publish the `@agent-canvas/extension-api` worker SDK + `ExtensionContext`.
- **Demo:** clicking the contributed button activates the worker, which calls
  `showInformationMessage`; a contributed command appears in the Command-K menu and runs.
- **Acceptance:** RPC bridge tests; capability-denial tests; worker lifecycle
  (activate/terminate) tests.

### Milestone 4 — Webview panels (custom UI)
- Add `extension-webview.tsx` (sandboxed iframe + CSP), the host↔webview↔worker
  message relay, and `window.createWebviewPanel`.
- Route contributed `type: "webview"` views into the main/side panel area (extend
  `src/routes.ts` or render in-place within a host-owned panel container).
- **Demo:** the canonical "Compliance panel" scenario end-to-end from a fixture bundle.
- **Acceptance:** sandbox/CSP assertions; message-relay tests; e2e (Playwright) for the
  click→panel flow.

### Milestone 5 — Distribution + management UI
- Add `ui-extensions-service.ts` + `ui-extensions-management-service.ts` and the
  `use-ui-extensions-*` hooks (mirroring the plugins pipeline).
- Add `routes/ui-extensions.tsx` (`/extensions`) and a Customize nav entry; install /
  enable / disable / uninstall, with cloud-backend gating identical to plugins.
- Surface **capabilities consent** at install time.
- **Demo:** browse → install → enable a bundle from the catalog; button appears; disable
  removes it live.
- **Acceptance:** management-service tests; route/page tests; e2e install→enable→use→disable.

### Milestone 6 — Hardening & docs
- Permission prompts polish, error/telemetry surfaces, extension API versioning
  (`engines.agentCanvas`), authoring docs + a sample extension repo.
- **Acceptance:** security review of sandbox/CSP/capability gating; docs published;
  sample extension installs cleanly.

---

## 5b. Implementation status (this branch)

A working foundation for milestones **M1–M4** is implemented on
`feature/ui-extensions` under `src/extensions/` (plus `ExtensionWebview` in
`src/components/features/extensions/`), with 53 unit/integration tests. The full
existing suite (3462 tests) still passes, and `npm run lint` / `typecheck` are clean.

Built and tested:

- **M1 – Registry-driven sidebar:** `contribution-registry.ts` (zustand, stable
  derived selectors), `use-contributions.ts`, and `SidebarContributionButton` wired
  into `sidebar-rail-body.tsx`. Contributed rail items render natively; built-ins
  unchanged.
- **M2 – Manifest + loader:** `manifest.ts` (dependency-free `extension.json`
  validator with precise error paths) and `loader.ts` (validate → resolve icons →
  build resolved contributions → register; host-bridge injectable).
- **M3 – Isolated extension host:** `host/rpc.ts` (transport-agnostic JSON-RPC),
  `host/host-api.ts` (capability-gated `agentCanvas` surface), `host/extension-host.ts`
  (lazy per-extension Web Worker lifecycle), `sdk/runtime.ts` + `sdk/worker-bootstrap.ts`
  (off-thread runtime, no DOM), `sdk/api-proxy.ts`.
- **M4 – Webviews:** `host/webview-transport.ts` + `components/.../extension-webview.tsx`
  (sandboxed `allow-scripts`, no `allow-same-origin`) reusing the same capability-gated
  host API; `sdk/webview-client.ts` for the iframe side.
- **Wiring:** `extension-manager.ts` ties loader + host + worker factory into one
  `install()` / `uninstall()` entry point (the production seam), demonstrated
  end-to-end in tests (declarative button appears on install → selecting it activates
  the worker → worker calls a host API).

Not yet done (remaining work):

- **App mounting:** instantiate a single `ExtensionManager` at app start with *real*
  `HostApiDeps` (active conversation from the conversation store, `showInformationMessage`
  via the toast system, `executeCommand` via the command registry), mount opened
  webview panels into a host-owned panel container, and surface contributed commands in
  the Command-K menu.
- **M5 – Distribution + management UI:** `ui-extensions-service` /
  `ui-extensions-management-service`, `use-ui-extensions-*` hooks, a `/extensions` route,
  install-time capability consent, and cloud-backend gating (mirroring the plugins
  pipeline).
- **CSP/origin hardening:** serve webview assets from an isolated origin (or finalize
  the `blob:` + CSP approach) and add the security review.
- **Real `BundleSource` implementations:** installed-folder source (agent-server) and a
  default `Worker` factory verified in a browser (the unit tests use an in-memory fake
  worker).

## 6. Explicitly out of scope (initial)

- Extension-to-extension APIs / dependency graph.
- Native (non-webview) rich tree views beyond simple declarative items.
- A hosted public marketplace with ratings/signing (start with catalog + URL/local
  install, like plugins today).
- Theming/keybinding contribution points (natural Phase 2 once commands land).

## 7. Open questions

1. **Bundle origin for webviews:** serve extension assets from a dedicated origin
   (best isolation) vs. `blob:` URLs (simplest)? Affects CSP and `allow-same-origin`.
2. **Cloud backend story:** where do installed UI bundles live for cloud (no per-user
   filesystem)? Likely a new storage endpoint — same gap plugins have today.
3. **API surface scope for v1:** how much of `conversation.*` / `storage.*` to expose
   before we have real consumers driving requirements.
4. **Worker vs. iframe for logic:** Worker is cleaner for isolation, but a same-bundle
   webview+worker split means two contexts to relay between; confirm the relay cost is
   acceptable, or allow "webview-only" extensions with no worker.
