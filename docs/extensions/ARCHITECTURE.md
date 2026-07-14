# UI Extensions: Architecture Reference

This document describes the **technical implementation** of the Agent Canvas UI extensions system.

**Audience:** Contributors, maintainers, and developers working on the extensions system.

**See also:**
- **[User Guide](./USER_GUIDE.md)** — For end users installing extensions
- **[Author Guide](./AUTHOR_GUIDE.md)** — For extension developers
- **[Security Model](./SECURITY.md)** — Security architecture details
- **[Extension Points Roadmap](../EXTENSION_POINTS.md)** — Adding new contribution points

---

## Design Rationale

The extension system adopts the **VS Code extension model** because its security properties match what "run customer-supplied code in a browser SPA" demands:

- **Extensions cannot touch the host DOM.** They run in isolated Web Workers and interact only through the `agentCanvas` API. UI is either *declarative* (contribution points) or *webview* (sandboxed iframe with postMessage bridge and strict CSP).
- **Contribution points are static JSON.** The vast majority of UI (menus, views, commands, sidebar items) is declared, not coded. The host renders trusted native components from untrusted *data* — safe by construction.
- **Activation events keep things lazy.** Extension code only runs when a relevant trigger fires.

### VS Code → Agent Canvas Mapping

| VS Code concept | Agent Canvas equivalent | Notes |
|---|---|---|
| `package.json` + `contributes` | `extension.json` manifest | Declarative, validated with Zod |
| Activity Bar | Sidebar rail (`sidebar-rail-body.tsx`) | `contributes.viewsContainers.activitybar` |
| View / View Container | Panel in main area or side panel | `contributes.views` |
| Webview (`createWebviewPanel`) | Sandboxed `<iframe>` + postMessage bridge | For arbitrary custom UI |
| Command (`contributes.commands`) | Entry in Command-K menu | Declarative registration |
| Menus (`contributes.menus`) | Contributed items in context/overflow menus | Bind to commands, placed into named slots |
| Activation events | Lazy activation (`onView:*`, `onCommand:*`, `onStartup`) | Worker spins up only when needed |
| Extension Host process | Web Worker per extension | Isolation boundary for extension logic |
| `vscode` module / API | `agentCanvas` API injected into worker | Versioned, capability-gated |
| Marketplace / OpenVSX | Marketplace catalog + URL/local install | `npm:`, `gh:`, direct URL sources |
| `engines.vscode` | `engines.agentCanvas` semver range | Host/extension API compatibility gate |

---

## Overview

The extension system follows the **VS Code extension model**, adapted for a browser SPA:

```
┌──────────────────────────────────────────────────────────────────────┐
│                        Agent Canvas (Host)                            │
│                                                                       │
│  Declarative Manifest (extension.json)                               │
│         │                                                             │
│         ▼                                                             │
│   manifest.ts (parse/validate)                                       │
│         │                                                             │
│         ▼                                                             │
│   loader.ts (resolve icons, build contributions)                     │
│         │                                                             │
│         ▼                                                             │
│   contribution-registry.ts (zustand store)                           │
│         │                                                             │
│         ├──▶ use-contributions.ts (React hooks)                      │
│         │         │                                                   │
│         │         ▼                                                   │
│         │   Host Components (Sidebar, Command Menu, Menus, etc.)     │
│         │                                                             │
│         └──▶ extension-host.ts (activate workers)                    │
│                   │                                                   │
│                   ├──▶ Web Worker (main.js)                          │
│                   │      ↕ RPC (capability-gated host API)           │
│                   │                                                   │
│                   └──▶ Sandboxed Iframe (webview)                    │
│                          ↕ postMessage (same capability-gated API)   │
│                          ↕ Asset Relay (for gh: sources)             │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

**Key properties:**
- **Declarative-first** — UI contributions are static JSON; rendering them runs no extension code
- **Isolated logic** — Extension code runs in Web Workers (no DOM access)
- **Sandboxed UI** — Webviews are `sandbox="allow-scripts"` iframes with opaque origins
- **Capability-gated** — Every privileged API call requires an explicit capability grant

---

## Architecture at a Glance

```
extension.json (declarative)      ──parse──▶  manifest.ts
       │                                            │
       ▼                                            ▼
  loader.ts  ──register──▶  contribution-registry.ts  ──▶  Sidebar / Commands / Menus
       │                                            ▲
       │ (on select)                                │ useContributions()
       ▼
extension-manager.ts ──▶ host/extension-host.ts ──RPC──▶ Web Worker (sdk/runtime.ts)
       │                          │                          runs extension main()
       │                          │ createHostMethods() (capability-gated)
       ▼                          ▼
host/webview-transport.ts ──▶ sandboxed <iframe> (ExtensionWebview)
                                   ↕ same host API
                                   ↕ Asset Relay (gh: sources only)
                             AssetLoader / WebviewBridge
```

---

## Source Resolution Pipeline

Extensions can be installed from multiple sources. The resolution pipeline normalizes them into a unified `BundleSource`:

```
source string ──parse──▶ ExtensionSourceRef ──resolve──▶ ArtifactDescriptor ──acquire──▶ BundleSource ──▶ loadExtension
```

### Source Types

| Source | Format | Example | Resolution |
|--------|--------|---------|------------|
| **npm** | `npm:<package>[@<range>]` | `npm:@acme/ext@^1.0.0` | jsDelivr API → CDN URL |
| **GitHub** | `github:<owner>/<repo>[/<path>][@<ref>]` | `github:acme/repo/ext@v1.0.0` | GitHub API → SHA → Asset Relay |
| **URL** | `https://...` | `https://cdn.example.com/ext` | Pass-through |

`github:` is the canonical GitHub scheme. `gh:` and `github://` are accepted as **parser-only aliases** and normalized to `github:` (the scheme token is matched case-insensitively; owner/repo/ref/subpath are case-sensitive). All parsing — single installs, marketplaces, and the asset relay — funnels through the one `parseGithubRef` helper in `src/extensions/sources/ref.ts`. Note that the GitHub `<ref>` is a **branch, tag, or SHA only**; semver ranges are rejected by the resolver (`github-api.ts`), so GitHub installs are not range-versioned the way npm sources are.

### Resolution Details

#### npm Sources

**File:** `src/extensions/sources/jsdelivr.ts`, `src/extensions/sources/resolve.ts`

1. Parse source ref: `npm:@acme/hello@^1.0.0`
2. Resolve version via jsDelivr API:
   ```
   GET https://data.jsdelivr.com/v1/packages/npm/@acme/hello/resolved?specifier=^1.0.0
   ```
3. Get pinned version (e.g., `1.2.3`)
4. Build base URL: `https://cdn.jsdelivr.net/npm/@acme/hello@1.2.3/`
5. Create HTTP bundle source (direct fetch)

**Why jsDelivr?**
- Serves npm packages with CORS enabled
- Correct MIME types for all file types
- Immutable (version pinned to SHA)
- Free CDN

#### GitHub Sources

**File:** `src/extensions/sources/github-api.ts`, `src/extensions/sources/resolve.ts`

1. Parse source ref: `github:acme/repo/path@feature/my-branch`
2. Resolve ref via **GitHub REST API**:
   ```
   GET https://api.github.com/repos/acme/repo/git/ref/heads/feature/my-branch
   ```
3. Get commit SHA (e.g., `abc123...`)
4. Build source ref: `github:acme/repo/path@abc123`
5. Create **relay bundle source** (parent-window asset loader)

**Why GitHub API instead of jsDelivr?**
- jsDelivr fails for branches with slashes (e.g., `feature/my-branch`)
- GitHub API handles branches, tags, and SHAs uniformly
- Returns commit SHA (immutable reference)
- Supports private repos (with token)

**Why Asset Relay instead of direct fetch?**
- Webview CSP blocks external origins (`connect-src 'none'`)
- Direct fetch from raw.githubusercontent.com would fail
- Parent window has no CSP restrictions → can fetch on behalf of webview

#### URL Sources

**File:** `src/extensions/sources/resolve.ts`

1. Parse source ref: `https://cdn.example.com/my-ext`
2. Pass through (no resolution)
3. Create HTTP bundle source (direct fetch)

**Limitations:**
- No version management
- No update detection
- User responsible for CORS and CSP

---

## Asset Relay System (GitHub Sources)

GitHub extensions require special handling because webview CSP blocks external origins.

### Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                      Parent Window (Host)                      │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │              AssetLoader (asset-loader.ts)              │  │
│  │  • Fetches from GitHub (no CSP restrictions)            │  │
│  │  • Parses gh: source refs                               │  │
│  │  • Builds raw.githubusercontent.com URLs                │  │
│  │  • Caches SHA-pinned assets (immutable)                 │  │
│  │  • Creates blob URLs for iframe loading                 │  │
│  └──────────────────┬──────────────────────────────────────┘  │
│                     │                                          │
│               postMessage                                      │
│                     │                                          │
│  ┌──────────────────▼──────────────────────────────────────┐  │
│  │           WebviewBridge (webview-bridge.ts)             │  │
│  │  • Receives asset requests from webview                 │  │
│  │  • Routes to AssetLoader                                │  │
│  │  • Validates requests against extension source          │  │
│  │  • Returns blob URL or raw content                      │  │
│  └─────────────────────────────────────────────────────────┘  │
│                     │                                          │
└─────────────────────┼──────────────────────────────────────────┘
                      │
                postMessage
                      │
┌─────────────────────▼──────────────────────────────────────────┐
│                  Webview (sandboxed iframe)                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  sdk/asset-relay.ts (client SDK)                        │   │
│  │  • Sends asset request via postMessage                  │   │
│  │  • Receives blob URL or content                         │   │
│  │  • Imports JS modules from blob URLs                    │   │
│  └─────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
```

### Components

#### AssetLoader (asset-loader.ts)

Runs in the parent window. Responsibilities:
- Parse `gh:owner/repo/path@sha` source refs
- Build raw.githubusercontent.com URLs
- Fetch assets (no CSP restrictions in parent window)
- Cache SHA-pinned assets indefinitely (immutable)
- Create blob URLs for initial webview load
- Handle runtime asset requests via WebviewBridge

**Example:**
```typescript
const loader = new AssetLoader({ githubToken: 'ghp_...' });
const asset = await loader.loadAsset('gh:acme/repo/ext@abc123', 'panel.html');
// Returns: { content: ArrayBuffer, mimeType: 'text/html', blobUrl: 'blob:...' }
```

#### WebviewBridge (webview-bridge.ts)

Bridges postMessage communication between parent and webview. Responsibilities:
- Listen for asset requests from webview
- Validate requests against extension source (prevent path traversal)
- Route to AssetLoader
- Send blob URL or content back to webview
- Handle fetch relay for external services (future)

**Message protocol:**
```typescript
// Webview → Parent
{ type: 'asset:request', id: '123', file: 'panel.html' }

// Parent → Webview
{ type: 'asset:response', id: '123', ok: true, content: ArrayBuffer, mimeType: 'text/html' }
```

#### RelayBundleSource (relay-bundle-source.ts)

Implements the `BundleSource` interface for GitHub sources. Responsibilities:
- Load manifest via AssetLoader
- Generate blob URLs for webviews
- Inject CSP nonce into HTML
- Inject base tag for relative asset resolution

**Used by:** `resolve.ts` for `gh:` sources with `requiresProxy: true`

#### Asset Relay Client SDK (sdk/asset-relay.ts)

Runs in the webview. Responsibilities:
- Send asset requests to parent via postMessage
- Receive blob URLs or content
- Promise-based API for webview code

**Example:**
```typescript
// In webview
import { requestAsset } from '/.agent-canvas/extensions-sdk/asset-relay.js';
const asset = await requestAsset('icon.svg');
// Returns: { content: ArrayBuffer, mimeType: 'image/svg+xml', blobUrl: 'blob:...' }
```

### Why Asset Relay (Not Backend Proxy)?

Initially, we considered adding a `/api/extensions/proxy` endpoint to agent-server. We chose asset relay instead because:

| Consideration | Backend Proxy | Asset Relay |
|---------------|---------------|-------------|
| Backend changes | Required | ✅ None (frontend-only) |
| Deployment | Must deploy backend first | ✅ Ships with agent-canvas |
| Security model | Global HTTP endpoint | ✅ Per-iframe scoped |
| Parent visibility | ❌ No | ✅ Yes (every request visible) |
| VS Code alignment | Different | ✅ Same pattern |

---

## File Map

| Area | Files |
|------|-------|
| **Types & Schemas** | `types.ts`, `sdk/types.ts`, `manifest.ts` |
| **Parsing & Validation** | `manifest.ts` (Zod schema + custom validator) |
| **Registry & Hooks** | `contribution-registry.ts`, `use-contributions.ts`, `menu-slots.ts` |
| **Visibility (when clauses)** | `when.ts` (evaluator), `ui-context.tsx` (host state provider) |
| **Loading & Management** | `loader.ts`, `extension-manager.ts` |
| **Host Runtime** | `host/rpc.ts`, `host/host-api.ts`, `host/extension-host.ts`, `host/webview-transport.ts`, `host/create-app-host-deps.ts` |
| **Worker/Webview SDK** | `sdk/runtime.ts`, `sdk/worker-bootstrap.ts`, `sdk/api-proxy.ts`, `sdk/webview-client.ts`, `sdk/asset-relay.ts` |
| **Security** | `webview-security.ts` (CSP, sandbox, origin constants) |
| **Compatibility** | `engines.ts` (engines.agentCanvas host-range check) |
| **App Mounting** | `feature-flag.ts`, `panel-store.ts`, `dev-bundle-source.ts`, `../components/providers/extension-manager-provider.tsx`, `../components/features/extensions/extension-panel.tsx` |
| **Management UI** | `installed-store.ts`, `installed-persistence.ts`, `../routes/extensions.tsx`, `../components/features/extensions/{installed-extension-card,add-extension-modal,capability-labels}.tsx` |
| **Source Resolution** | `sources/ref.ts` (parse), `sources/resolve.ts` (resolve), `sources/jsdelivr.ts` (npm), `sources/github-api.ts` (gh) |
| **Asset Relay** | `asset-loader.ts`, `webview-bridge.ts`, `sources/relay-bundle-source.ts`, `sdk/asset-relay.ts` |
| **Distribution** | `marketplace/{source,catalog,client}.ts` (marketplace loading) |
| **UI Components** | `../components/features/sidebar/sidebar-contribution-button.tsx`, `../components/features/extensions/extension-webview.tsx`, `../components/features/extensions/extension-menu-items.tsx` |

---

## Manifest Schema

The `extension.json` manifest is validated by `manifest.ts` using a **hand-rolled validator** (not Zod) for zero runtime dependencies.

### Schema

```typescript
interface ExtensionManifest {
  id: string;                           // Reverse domain notation
  name: string;                         // Display name
  version: string;                      // Semver
  engines?: {
    agentCanvas?: string;               // Semver range
  };
  main?: string;                        // Worker entry point
  activationEvents?: string[];          // When to activate
  capabilities?: Capability[];          // Requested permissions
  contributes?: {
    viewsContainers?: {
      activitybar?: ViewContainerManifest[];
    };
    views?: Record<string, ViewManifest[]>;
    commands?: CommandManifest[];
    menus?: Record<string, MenuItemManifest[]>;
    settingsPages?: SettingsPageManifest[];
    pages?: PageManifest[];
    conversationPanelTabs?: ConversationPanelTabManifest[];
  };
}
```

### Validation

`manifest.ts` exports:
- `validateExtensionManifest(obj: unknown): ValidationResult`
- `parseExtensionManifest(obj: unknown): ExtensionManifest` (throws on invalid)

Validation checks:
- Required fields (`id`, `name`, `version`)
- Field types (string, array, object)
- Enum values (`type: "webview"`, capability names)
- Nested structures (viewsContainers, views, commands, menus, settingsPages, pages, conversationPanelTabs)
- Semver format (`version`, `engines.agentCanvas`)
- Activation event format (`"*"`, `"onCommand:..."`, `"onView:..."`)

---

## Contribution Registry

**File:** `src/extensions/contribution-registry.ts`

A **Zustand store** that holds all loaded extensions and their contributions.

### Store Shape

```typescript
interface ContributionRegistryStore {
  extensions: Map<string, LoadedExtension>;
  
  // Derived selectors (stable references)
  activityBarItems: ActivityBarItem[];
  commands: ExtensionCommand[];
  views: Map<string, ViewItem[]>;
  menuItems: MenuItem[];
  menuItemsBySlot: Map<string, MenuItem[]>;
  settingsPages: SettingsPageItem[];
  pages: PageItem[];
  conversationPanelTabs: ConversationPanelTabItem[];
}
```

### Derived Selectors

Contributions are **derived from the extensions map**, ensuring consistency:
- `activityBarItems` — Flat list of sidebar buttons
- `commands` — Flat list of commands
- `views` — Map of container ID → views
- `menuItems` — Flat list of all menu items
- `menuItemsBySlot` — Map of slot ID → menu items
- `settingsPages` — Flat list of settings pages
- `pages` — Flat list of full-width sidebar pages
- `conversationPanelTabs` — Flat list of conversation panel tabs

**Why derived?** Registering/unregistering an extension automatically updates all selectors.

### Non-Reactive Accessors

For non-React code, the registry exports:
- `getActivityBarItems()` — Get current activity bar items
- `getExtensionCommands()` — Get current commands
- `getMenuItemsBySlot(slot)` — Get menu items for a specific slot

---

## React Hooks (use-contributions.ts)

Host components consume contributions via hooks:

```typescript
// Get activity bar items (sidebar buttons)
const activityBarItems = useActivityBarItems();

// Get extension commands (for Command Palette)
const commands = useExtensionCommands();

// Get views for a container
const views = useExtensionViews(containerId);

// Get menu items for a slot (with when-filtering)
const items = useMenuItems(slotId);

// Get settings pages (with when-filtering)
const pages = useSettingsPages();
```

### when-Filtering

Hooks like `useMenuItems()` and `useSettingsPages()` apply **when-clause filtering** based on host UI state:

```typescript
const context = useUiContext();  // { backend: 'cloud', emailVerified: true, ... }
const items = useMenuItems('conversationTabs/context');
// Only returns items where evaluateWhen(item.when, context) === true
```

---

## Extension Host

**File:** `src/extensions/host/extension-host.ts`

Manages the lifecycle of extension workers (one per extension).

### Lifecycle

1. **Activate** — Create Web Worker, initialize RPC, run `activate()` function
2. **Running** — Handle RPC calls from worker
3. **Terminate** — Call `deactivate()`, terminate worker

### Activation Events

Workers activate lazily based on `activationEvents`:
- `"*"` or `"onStartup"` — Activate immediately
- `"onCommand:myext.hello"` — Activate when command is executed
- `"onView:myext.panel"` — Activate when view is opened

**Activation is one-way** — Once activated, workers stay running until the extension is disabled or uninstalled.

---

## RPC System

**File:** `src/extensions/host/rpc.ts`

Transport-agnostic JSON-RPC 2.0 implementation.

### Endpoints

An `Endpoint` sends/receives messages:
```typescript
interface Endpoint {
  send(message: JsonRpcMessage): void;
  onReceive(handler: (message: JsonRpcMessage) => void): void;
}
```

Implementations:
- **Worker RPC** — postMessage to/from Web Worker
- **Webview RPC** — postMessage to/from iframe
- **In-memory pair** — For testing

### Methods

Host exposes methods to workers/webviews:

```typescript
const methods = {
  'window.showInformationMessage': async (message: string) => { /* ... */ },
  'conversation.getActive': async () => { /* requires conversation:read */ },
  'storage.get': async (key: string) => { /* requires storage */ },
  'storage.set': async (key: string, value: any) => { /* requires storage */ },
  'commands.execute': async (commandId: string, ...args: any[]) => { /* ... */ },
};
```

### Capability Gating

Every method is wrapped with capability checks:

```typescript
if (method === 'conversation.getActive' && !caps.includes('conversation:read')) {
  throw new Error('Permission denied: conversation:read');
}
```

---

## Webview Security

**File:** `src/extensions/webview-security.ts`

Single source of truth for webview sandbox and CSP.

### Sandbox Attribute

```typescript
export const WEBVIEW_SANDBOX = 'allow-scripts';
```

**What's allowed:**
- `allow-scripts` — Execute JavaScript

**What's blocked:**
- Same-origin access (iframe has opaque origin `null`)
- Form submission
- Modals (alert, confirm)
- Downloads
- Pointer lock

### Content Security Policy

```typescript
export function buildWebviewCsp({ nonce, frameAncestors = "'self'" }): string {
  return `
    default-src 'none';
    script-src 'nonce-${nonce}';
    style-src 'unsafe-inline';
    img-src blob: data:;
    connect-src 'none';
    frame-ancestors ${frameAncestors};
  `.replace(/\s+/g, ' ').trim();
}
```

**Key directives:**
- `default-src 'none'` — Block everything by default
- `script-src 'nonce-{random}'` — Only scripts with correct nonce
- `connect-src 'none'` — **No fetch/XHR/WebSocket** (critical security measure)
- `frame-ancestors 'self'` — Prevent embedding in external sites

### CSP Nonce

Each webview load generates a **random nonce** that is:
1. Stamped onto `<script>` tags in the HTML
2. Included in the CSP header
3. Validated by the browser

```typescript
const nonce = generateCspNonce();  // Random hex
const html = stampCspNonce(originalHtml, nonce);  // Add nonce="..." to <script>
const csp = buildWebviewCsp({ nonce });  // CSP: script-src 'nonce-...'
```

This prevents injected inline scripts from executing.

---

## Host API

**File:** `src/extensions/host/host-api.ts`

Creates capability-gated RPC methods for workers/webviews.

```typescript
export function createHostMethods(
  deps: HostApiDeps,
  caps: Capability[],
  extensionId: string
): Record<string, (...args: any[]) => Promise<any>> {
  // ...
}
```

### Methods

| Method | Capability | Implementation |
|--------|------------|----------------|
| `window.showInformationMessage` | None | `deps.showInformationMessage(msg)` |
| `commands.execute` | None | `deps.executeCommand(cmd, args)` |
| `conversation.getActive` | `conversation:read` | `deps.getCurrentConversation()` |
| `conversation.getEventStats` | `conversation:read` | `deps.getEventStats(conversationId)` — aggregates the event stream host-side (cloud + local) |
| `storage.get` | `storage` | `deps.storage.get(key)` |
| `storage.set` | `storage` | `deps.storage.set(key, value)` |
| `backend.cloudFetch` | `backend:cloud:read` (GET) or `backend:cloud:write` (POST/PUT/PATCH/DELETE) | `deps.cloudFetch(params)` |

### Backend Cloud API

The `backend.cloudFetch` method allows extensions to make authenticated API calls to the user's
active cloud backend (e.g., `app.all-hands.dev` for SaaS, or a custom enterprise URL).

**Capabilities:**
- `backend:cloud:read` — Required for GET requests
- `backend:cloud:write` — Required for POST, PUT, PATCH, DELETE requests

**Security:** The host handles authentication automatically. Extensions never see bearer tokens.
Returns `null` if no cloud backend is active.

```typescript
// Example: List conversations from cloud backend
const response = await agentCanvas.backend.cloudFetch({
  path: "/api/v1/app-conversations/search?limit=50",
  method: "GET"
});
if (response && response.ok) {
  const conversations = response.data;
}

// Example: Pause a sandbox (requires backend:cloud:write)
await agentCanvas.backend.cloudFetch({
  path: `/api/v1/sandboxes/${sandboxId}/pause`,
  method: "POST"
});
```

### Host API Dependencies

**File:** `src/extensions/host/create-app-host-deps.ts`

Bridges the extension system to the running app:

```typescript
export function createAppHostDeps(): HostApiDeps {
  return {
    // Conversation service
    getCurrentConversation: () => ConversationService.getCurrentConversation(),
    
    // Toast notifications
    showInformationMessage: (msg) => toast.info(msg),
    
    // Command dispatch
    executeCommand: (cmd, args) => commandRegistry.execute(cmd, args),
    
    // Namespaced storage
    storage: createNamespacedStorage(extensionId, localStorage),
  };
}
```

---

## Extension Manager

**File:** `src/extensions/extension-manager.ts`

Coordinates loading, installing, updating, and uninstalling extensions.

### Responsibilities

- Load manifests from bundle sources
- Validate manifests and check host compatibility
- Register contributions in the registry
- Create extension hosts (workers)
- Handle installs, updates, and uninstalls
- Persist installed extensions to localStorage

### Key Methods

```typescript
class ExtensionManager {
  // Load and register an extension
  async loadExtension(source: BundleSource, capabilities: Capability[]): Promise<void>
  
  // Install from source ref
  async installFromUrl(url: string): Promise<void>
  
  // Check for updates
  async checkForUpdate(id: string): Promise<ExtensionUpdate | null>
  
  // Apply update
  async updateExtension(id: string): Promise<void>
  
  // Uninstall
  async uninstallExtension(id: string): Promise<void>
  
  // Enable/disable
  enableExtension(id: string): void
  disableExtension(id: string): void
}
```

---

## Update Detection

**File:** `src/extensions/extension-manager.ts`

For versioned installs (`npm:`, `gh:`), the manager can detect updates.

### Algorithm

1. Read the installed extension's **source ref** and **recorded range**
   - Example: `npm:@acme/ext@^1.0.0`, installed version `1.2.3`

2. **Re-resolve** the source ref within the same range
   - Example: Query jsDelivr for `^1.0.0`, get `1.3.0`

3. **Compare** resolved base URL against installed base URL
   - `npm:@acme/ext@1.2.3` vs `npm:@acme/ext@1.3.0` → Update available

4. Return `ExtensionUpdate` with new version

### Update Safety

Before applying an update:
- **Check host compatibility** — If new version requires newer Agent Canvas, refuse update
- **Check capabilities** — If new version requests additional capabilities, refuse update (user must re-consent)

**Result:** Updates are **non-destructive**. If refused, the installed version keeps running.

---

## Theme Integration

**File:** `src/extensions/extension-webview.tsx`

Agent Canvas injects **CSS custom properties** into extension webviews for automatic theming.

### Mechanism

1. Parent window reads CSS variables from `:root`
2. Sends theme message to webview via postMessage:
   ```typescript
   { type: 'theme:update', theme: { '--oh-background': '#fff', ... } }
   ```
3. Webview SDK listens for theme messages and injects variables:
   ```typescript
   document.documentElement.style.setProperty('--oh-background', '#fff');
   ```

### Webview Usage

```typescript
import { enableHostTheme } from '/.agent-canvas/extensions-sdk/webview-client.js';
enableHostTheme();  // Listen for theme messages and inject variables
```

Then in CSS:
```css
body {
  background: var(--oh-background);
  color: var(--oh-foreground);
}
```

---

## Marketplace Distribution

**Files:** `src/extensions/marketplace/{source,catalog,client}.ts`

Extensions can be distributed via a **marketplace catalog** (compatible with OpenHands plugin marketplace format).

### Catalog Format

```json
{
  "name": "My Extensions",
  "owner": { "name": "Acme" },
  "plugins": [],
  "uiExtensions": [
    {
      "name": "my-extension",
      "description": "A useful extension",
      "source": "npm:@acme/my-extension@^1.0.0"
    }
  ]
}
```

### Discovery

Marketplace locations can be:
- `github://owner/repo` (shorthand)
- `owner/repo` (shorthand)
- `https://github.com/owner/repo`
- `https://raw.githubusercontent.com/.../marketplace.json` (direct)

### Loading

1. Parse marketplace location (`marketplace/source.ts`)
2. Fetch catalog from `.plugin/marketplace.json` or `.claude-plugin/marketplace.json`
3. Validate catalog schema (`marketplace/catalog.ts`)
4. Extract `uiExtensions` array
5. Resolve each entry's source to a bundle URL
6. Display in UI for user selection

---

## Testing

Extensions are tested at multiple levels:

### Unit Tests

- `__tests__/extensions/manifest.test.ts` — Manifest validation
- `__tests__/extensions/engines.test.ts` — Host compatibility
- `__tests__/extensions/when.test.ts` — when-clause evaluator
- `__tests__/extensions/sources/*.test.ts` — Source resolution
- `__tests__/extensions/host/rpc.test.ts` — RPC system
- `__tests__/extensions/host/host-api.test.ts` — Capability gating
- `__tests__/extensions/asset-loader.test.ts` — Asset loading
- `__tests__/extensions/webview-bridge.test.ts` — Asset relay

### Integration Tests

- `__tests__/components/providers/extension-manager-provider.test.ts` — Install/update flows
- `__tests__/routes/extensions.test.tsx` — Management UI

### Example Extension Tests

- `__tests__/extensions/example-hello.test.ts` — Validates hello-sidebar example against schema

---

## Production Requirements

### CSP Headers

The dev server (Vite) sends CSP headers for webview HTML. **Production must do the same:**

```
Content-Security-Policy: default-src 'none'; script-src 'nonce-{random}'; style-src 'unsafe-inline'; img-src blob: data:; connect-src 'none'; frame-ancestors 'self';
X-Content-Type-Options: nosniff
```

### Asset Serving

For development, Vite can serve extension assets from a local directory at `/__extensions/*` (configure via `DEV_EXTENSION_BUNDLE_URLS` in feature flags). Example extensions are available at [jpshackelford/agent-canvas-experimental-extensions](https://github.com/jpshackelford/agent-canvas-experimental-extensions).

**Production options:**
1. **Serve from same origin** — Host extension assets on your CDN, send proper CSP headers
2. **Use npm/GitHub sources** — Let users install from npm or GitHub (recommended)

### Optional: Isolated Origin

For additional defense-in-depth, extension assets can be served from a **dedicated isolated origin**:

```
Main app:       https://agent-canvas.example.com
Extension CDN:  https://ext-cdn.example.com
```

See `docs/SELF_HOSTING.md` § 6 for the nginx recipe.

**Note:** This is **optional**. Client-side isolation (sandbox + CSP) is the primary security boundary.

---

## Status

**Implemented:**
- ✅ M1-M4 (declarative manifest, loader, registry, host runtime)
- ✅ App mounting (flag-gated via `VITE_ENABLE_EXTENSIONS`)
- ✅ CSP/origin hardening (sandbox, opaque origin, `connect-src 'none'`, nonce, `frame-ancestors`)
- ✅ Management UI (`/extensions` with install-time capability consent)
- ✅ Git/marketplace distribution (loading UI extensions from plugin marketplace)
- ✅ Versioned `npm:`/`gh:` source refs (resolved via jsDelivr/GitHub API)
- ✅ `engines.agentCanvas` host-compatibility enforcement
- ✅ In-place update detection/application (`checkForUpdate`/`updateExtension`)
- ✅ GitHub API resolver for `gh:` sources (handles slashed branches)
- ✅ Asset relay system for webview loading (parent-window fetch + postMessage)
- ✅ `contributes.menus` declarative contribution point
- ✅ `when` / UI-context visibility primitive
- ✅ `contributes.settingsPages` declarative contribution point
- ✅ `contributes.pages` declarative contribution point (full-width sidebar pages)
- ✅ `contributes.conversationPanelTabs` declarative contribution point
- ✅ Theme variable injection for webviews
- ✅ `backend:cloud:read` and `backend:cloud:write` capabilities
- ✅ `backend.cloudFetch` host API method

**Remaining Work:**
- 🔜 Permission model for external service access
- 🔜 Private GitHub repository support (token management UI)
- 🔜 First-party registry service + hosted marketplace
- 🔜 Formal security review

---

## Future Extension Points

See **[Extension Points Roadmap](../EXTENSION_POINTS.md)** for planned contribution points and the recipe for adding new ones.

### Out of Scope (Current Implementation)

The following are explicitly **not** in the current implementation but may be considered for future versions:

- **Extension-to-extension APIs / dependency graph** — Extensions cannot import or call each other
- **Native rich tree views** — Beyond simple declarative items; complex custom tree rendering requires a webview
- **Hosted public marketplace with ratings/signing** — Current model is catalog + URL/local install
- **Theming/keybinding contribution points** — Natural follow-on once commands are fully integrated

---

## Further Reading

- **[Extension Points Roadmap](../EXTENSION_POINTS.md)** — How to add new contribution points
- **[Example Extensions](https://github.com/jpshackelford/agent-canvas-experimental-extensions)** — Reference implementations
