# UI Extensions: Author Guide

This guide explains how to **create, test, and publish UI extensions** for Agent Canvas.

---

## Quick Start

An extension is a folder containing:
- `extension.json` — Declarative manifest describing what your extension contributes
- `main.js` (optional) — Background logic running in a Web Worker
- `*.html` (optional) — Webview UI pages running in sandboxed iframes
- Icons and other assets

**Minimal example structure:**

```
my-extension/
├── extension.json      # Required manifest
├── main.js            # Optional worker logic
├── panel.html         # Optional webview UI
└── icon.svg           # Optional icon
```

See [hello-sidebar](https://github.com/jpshackelford/agent-canvas-experimental-extensions/tree/main/hello-sidebar) for a complete working example.

---

## The Extension Manifest

The `extension.json` manifest is a JSON file that declares:
- Extension metadata (id, name, version)
- UI contributions (sidebar buttons, panels, commands, menu items)
- Required capabilities (permissions)
- Host compatibility

### Basic Structure

```json
{
  "id": "publisher.extension-name",
  "name": "My Extension",
  "version": "1.0.0",
  "engines": {
    "agentCanvas": "^1.0.0"
  },
  "main": "main.js",
  "activationEvents": ["*"],
  "capabilities": ["conversation:read", "storage"],
  "contributes": {
    "viewsContainers": {
      "activitybar": [
        {
          "id": "myext.container",
          "title": "My Extension",
          "icon": "icon.svg"
        }
      ]
    },
    "views": {
      "myext.container": [
        {
          "id": "myext.panel",
          "name": "My Panel",
          "type": "webview",
          "page": "panel.html"
        }
      ]
    },
    "commands": [
      {
        "command": "myext.hello",
        "title": "My Extension: Say Hello"
      }
    ],
    "menus": {
      "conversationTabs/context": [
        {
          "command": "myext.hello",
          "when": "backend == cloud"
        }
      ]
    },
    "settingsPages": [
      {
        "id": "general",
        "title": "My Extension",
        "page": "settings.html"
      }
    ]
  }
}
```

### Manifest Fields

#### Required Fields

| Field | Description | Example |
|-------|-------------|---------|
| `id` | Unique identifier (reverse domain notation) | `"com.acme.my-extension"` |
| `name` | Display name | `"My Extension"` |
| `version` | Semantic version | `"1.0.0"` |

#### Optional Fields

| Field | Description | Example |
|-------|-------------|---------|
| `engines.agentCanvas` | Required Agent Canvas version (semver range) | `"^1.0.0"` |
| `main` | Entry point for worker logic | `"main.js"` |
| `activationEvents` | When to activate the extension | `["onCommand:myext.hello"]` |
| `capabilities` | Requested permissions | `["conversation:read"]` |
| `contributes` | UI contributions (see below) | See examples |

---

## Contribution Points

### Sidebar Buttons (Activity Bar)

Add a button to the sidebar rail:

```json
{
  "contributes": {
    "viewsContainers": {
      "activitybar": [
        {
          "id": "myext.container",
          "title": "My Extension",
          "icon": "icon.svg"
        }
      ]
    }
  }
}
```

- `id`: Unique container identifier
- `title`: Tooltip text
- `icon`: Path to SVG icon (relative to manifest)

### Panels (Views)

Add a panel that opens when the sidebar button is clicked:

```json
{
  "contributes": {
    "views": {
      "myext.container": [
        {
          "id": "myext.panel",
          "name": "My Panel",
          "type": "webview",
          "page": "panel.html"
        }
      ]
    }
  }
}
```

- `id`: Unique view identifier
- `name`: Display name in the panel title
- `type`: Must be `"webview"` (only supported type)
- `page`: Path to HTML file (relative to manifest)

### Commands

Register commands that can be triggered from menus or the command palette:

```json
{
  "contributes": {
    "commands": [
      {
        "command": "myext.hello",
        "title": "My Extension: Say Hello"
      }
    ]
  }
}
```

Commands must be implemented in your `main.js` worker:

```javascript
export function activate(ctx) {
  ctx.agentCanvas.commands.register("myext.hello", async () => {
    await ctx.agentCanvas.window.showInformationMessage("Hello!");
  });
}
```

### Menu Items

Add items to context menus throughout Agent Canvas:

```json
{
  "contributes": {
    "menus": {
      "conversationTabs/context": [
        {
          "command": "myext.hello",
          "when": "backend == cloud"
        }
      ],
      "chatInput/actions": [
        {
          "command": "myext.another",
          "when": "emailVerified"
        }
      ]
    }
  }
}
```

**Available menu slots:**
- `conversationTabs/context` — Right-click menu on conversation tabs
- `chatInput/actions` — Chat input "add" menu (⋮)

**`when` clause (optional):** Show/hide the menu item based on host UI state:
- `backend == cloud` or `backend == local`
- `emailVerified` / `!emailVerified`
- `repoConnected` / `!repoConnected`
- `agentState == idle` (or `running`, `paused`, etc.)
- `flag.hide_llm_settings` (feature flags)
- Combine with `&&`: `"emailVerified && backend == cloud"`

### Settings Pages

Add a settings page accessible from Settings → Extensions:

```json
{
  "contributes": {
    "settingsPages": [
      {
        "id": "general",
        "title": "My Extension",
        "page": "settings.html",
        "when": "backend == cloud"
      }
    ]
  }
}
```

Settings pages use the same `when` clause grammar as menu items.

### Conversation Panel Tabs

Add a tab to the conversation panel (right-side drawer alongside Files, Terminal, Browser):

```json
{
  "contributes": {
    "conversationPanelTabs": [
      {
        "id": "details",
        "title": "Details",
        "icon": "icon.svg",
        "page": "panel.html",
        "when": "backend == cloud"
      }
    ]
  }
}
```

**Features:**
- Tab appears in both the **tab bar** and the **kebab menu** automatically
- Supports **pin/unpin functionality** like built-in tabs
- Receives **theme CSS variables** (`--oh-background`, `--oh-foreground`, etc.)
- **Icon rendering** uses CSS `mask-image` so SVG icons inherit the current text color

The tab's webview receives the extension's granted capabilities (e.g., `conversation:read`
to access conversation context).

### Full-Width Pages

Add a full-width page as a sidebar nav entry (below Skills, alongside Customize and Automate):

```json
{
  "contributes": {
    "pages": [
      {
        "id": "main",
        "title": "My Page",
        "icon": "icon.svg",
        "page": "page.html",
        "when": "backend == cloud"
      }
    ]
  }
}
```

Pages render at `/x/:extensionId/:pageId` and support the same `when` clause grammar.

---

## Worker Logic (main.js)

If your extension needs to respond to commands or interact with the host, create a `main.js` file:

```javascript
// main.js - Runs in a Web Worker (no DOM access)

/**
 * Called when the extension is activated.
 * @param {ExtensionContext} ctx
 */
export function activate(ctx) {
  // Register a command
  ctx.agentCanvas.commands.register("myext.hello", async () => {
    const convo = await ctx.agentCanvas.conversation.getActive();
    await ctx.agentCanvas.window.showInformationMessage(
      `Active conversation: ${convo?.title || 'none'}`
    );
  });

  // Store some data
  await ctx.agentCanvas.storage.set("lastActivated", Date.now());
}

/**
 * Called when the extension is deactivated (optional).
 */
export function deactivate() {
  // Cleanup if needed
}
```

### Extension API (ctx.agentCanvas)

Your worker has access to a capability-gated API:

#### Commands API

```javascript
// Register a command handler
ctx.agentCanvas.commands.register(commandId, handler);

// Execute a command
await ctx.agentCanvas.commands.execute(commandId, ...args);
```

#### Conversation API (requires `conversation:read` capability)

```javascript
// Get active conversation summary
const convo = await ctx.agentCanvas.conversation.getActive();
// Returns: { id, title, created_at, updated_at, backend, sandboxId, sandboxStatus } or null

// Get aggregate event statistics for a conversation (defaults to the active one).
// Computed host-side via the event stream, so it works on both cloud and local
// backends without the webview touching runtime credentials.
const stats = await ctx.agentCanvas.conversation.getEventStats(convo?.id);
// Returns: {
//   total,                 // number of events scanned
//   byKind,                // { [eventKind]: count }
//   bySource,              // { [source]: count }
//   firstTimestamp,        // ISO string | null
//   lastTimestamp,         // ISO string | null
//   durationMs,            // last - first, in ms | null
//   truncated,             // true if the scan hit the max-events cap
// }
```

#### Storage API (requires `storage` capability)

```javascript
// Store data (namespaced to your extension)
await ctx.agentCanvas.storage.set(key, value);

// Retrieve data
const value = await ctx.agentCanvas.storage.get(key);
// Returns: stored value or undefined
```

#### Window API (no capability required)

```javascript
// Show an info message to the user
await ctx.agentCanvas.window.showInformationMessage(message);
```

---

## Webview UI (panel.html, settings.html)

Webview pages are sandboxed HTML files that provide custom UI:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <!-- Defense-in-depth CSP (host header is authoritative) -->
  <meta http-equiv="Content-Security-Policy" 
        content="default-src 'none'; script-src 'nonce-{NONCE}'; style-src 'unsafe-inline'; img-src blob: data:;">
  <style>
    /* Use Agent Canvas theme variables */
    body {
      background-color: var(--oh-background);
      color: var(--oh-foreground);
      font-family: var(--oh-font-family);
    }
    .card {
      background: var(--oh-surface);
      border: 1px solid var(--oh-border-subtle);
      padding: 1rem;
    }
  </style>
</head>
<body>
  <h1>My Extension Panel</h1>
  <div class="card" id="info"></div>

  <script nonce="{NONCE}">
    // Import the webview client SDK
    import('/.agent-canvas/extensions-sdk/webview-client.js').then(async ({ getAgentCanvasAPI, enableHostTheme }) => {
      // Enable theme variable injection
      enableHostTheme();

      // Get the capability-gated API
      const agentCanvas = await getAgentCanvasAPI();

      // Use the API (respects granted capabilities)
      const convo = await agentCanvas.conversation.getActive();
      document.getElementById('info').textContent = 
        `Active: ${convo?.title || 'none'}`;
    });
  </script>
</body>
</html>
```

### Webview Security

Webviews run in a **strict sandbox**:
- No direct network access (CSP: `connect-src 'none'`)
- No same-origin access to host DOM or storage
- Can only communicate with host via `postMessage` RPC

### Theme Integration

Agent Canvas injects theme variables into webviews via a `agentCanvas:theme` message. You can
either use the SDK's `enableHostTheme()` helper or handle it manually:

**Using the SDK:**
```javascript
import { enableHostTheme } from '/.agent-canvas/extensions-sdk/webview-client.js';
enableHostTheme();  // Automatically applies CSS variables
```

**Manual handling:**
```javascript
window.addEventListener("message", function(event) {
  if (event.data && event.data.type === "agentCanvas:theme") {
    Object.keys(event.data.variables).forEach(function(name) {
      document.documentElement.style.setProperty(name, event.data.variables[name]);
    });
  }
});
```

**Important:** Variable names arrive with their full CSS names (e.g., `--oh-background`).
Use them as-is — do not add another `--oh-` prefix.

### Available Theme Variables

| Variable | Description | Default (dark) |
|----------|-------------|----------------|
| `--oh-background` | Page background | `#0B0E14` |
| `--oh-surface` | Panel/card background | `#21252F` |
| `--oh-surface-raised` | Elevated elements | `#2C313F` |
| `--oh-foreground` | Primary text | `#EEF2F7` |
| `--oh-text-secondary` | Secondary text | `#C3CDDC` |
| `--oh-muted` | Placeholder text | `#A3B0C4` |
| `--oh-border` | Standard borders | `#4B5468` |
| `--oh-border-subtle` | Subtle dividers | `#383F50` |
| `--oh-color-primary` | Gold accent | `#c9b974` |
| `--oh-color-success` | Green | `#a5e75e` |
| `--oh-color-danger` | Red | `#e76a5e` |
| `--oh-radius` | Border radius | `8px` |

### Critical: Set Explicit Background Color

Sandboxed iframes have a **white background by default**. You **must** set an explicit
background color on both `html` and `body`:

```css
html, body {
  background: var(--oh-background);
}

body {
  color: var(--oh-foreground);
}
```

### Ready Signal: Wait Before Making API Calls

The host sets up the RPC listener **after** your scripts execute. Wait for `agentCanvas:ready`
before calling any `agentCanvas.*` APIs:

```javascript
window.addEventListener("message", function(event) {
  if (event.data && event.data.type === "agentCanvas:ready") {
    init();  // Now safe to call APIs
  }
});

// Fallback for older hosts
setTimeout(function() { init(); }, 100);
```

### Webview SDK

```javascript
import { 
  getAgentCanvasAPI,      // Get the host API
  enableHostTheme,        // Enable theme variable injection
  enableAutoResize,       // Enable content-based iframe resizing
  reportContentHeight     // Manually report height for auto-resize
} from '/.agent-canvas/extensions-sdk/webview-client.js';

// Get the API (same interface as worker ctx.agentCanvas)
const agentCanvas = await getAgentCanvasAPI();

// Use it
await agentCanvas.window.showInformationMessage("Hello from webview!");
```

---

## Capabilities (Permissions)

Declare required capabilities in your manifest:

```json
{
  "capabilities": ["conversation:read", "storage"]
}
```

### Available Capabilities

| Capability | Grants access to | Use case |
|------------|------------------|----------|
| `conversation:read` | `agentCanvas.conversation.getActive()`, `agentCanvas.conversation.getEventStats()` | Read conversation metadata and aggregate event statistics |
| `storage` | `agentCanvas.storage.get/set()` | Persist extension data |
| `backend:cloud:read` | `agentCanvas.backend.cloudFetch()` (GET) | Read from cloud backend API |
| `backend:cloud:write` | `agentCanvas.backend.cloudFetch()` (POST/PUT/PATCH/DELETE) | Write to cloud backend API |

### Backend Cloud API

The `backend:cloud:read` and `backend:cloud:write` capabilities allow extensions to make
authenticated API calls to the user's active cloud backend (e.g., `app.all-hands.dev` for SaaS,
or a custom enterprise URL).

```javascript
// Requires backend:cloud:read capability
const response = await agentCanvas.backend.cloudFetch({
  path: "/api/v1/app-conversations/search?limit=50",
  method: "GET"
});

if (response && response.ok) {
  const conversations = response.data;
}

// Requires backend:cloud:write capability  
await agentCanvas.backend.cloudFetch({
  path: `/api/v1/sandboxes/${sandboxId}/pause`,
  method: "POST"
});
```

**Key points:**
- The host handles authentication automatically — extensions never see bearer tokens
- Returns `null` if no cloud backend is active (local-only deployment)
- Use `backend == cloud` in `when` clauses to hide UI on local backends

**Important:**
- Users must approve all requested capabilities before installation
- Extensions without capabilities can still contribute UI (panels, commands, menus)
- Request only the capabilities you actually need

### Capability Inheritance

Capabilities requested in the manifest are inherited by:
- The worker (`main.js`)
- All webview pages (`*.html`)
- Menu items and commands

You don't need to re-declare capabilities for each contribution point.

---

## Activation Events

Control when your extension's worker activates:

```json
{
  "activationEvents": ["*"]
}
```

### Available Activation Events

| Event | When it fires |
|-------|---------------|
| `"*"` | Always (extension activates on startup) |
| `"onStartup"` | On startup (alias for `"*"`) |
| `"onCommand:myext.hello"` | When command `myext.hello` is executed |
| `"onView:myext.panel"` | When view `myext.panel` is opened |

**Best practice:** Use specific activation events (`onCommand`, `onView`) to avoid activating unnecessarily.

**No activationEvents:** If omitted and you have a `main.js`, defaults to `["*"]`.

---

## Testing Your Extension

### Local Development

1. **Create your extension folder** in a known location (e.g., `~/my-extensions/my-ext/`)

2. **Add to Agent Canvas dev config:**

   ```bash
   # .env
   VITE_ENABLE_EXTENSIONS=true
   DEV_EXTENSION_BUNDLE_URLS=http://localhost:8080/my-ext
   ```

3. **Serve your extension** via HTTP:

   ```bash
   # Simple HTTP server in the parent directory
   cd ~/my-extensions
   python3 -m http.server 8080
   ```

4. **Restart Agent Canvas** — Your extension appears with a "Dev" badge on `/extensions`

### Debugging

**Worker (`main.js`):**
- Open browser DevTools → Sources → Web Workers
- Set breakpoints in your worker code
- View `console.log()` output in the DevTools console

**Webview (`*.html`):**
- Right-click the webview iframe → Inspect Element
- Opens a separate DevTools instance for the sandboxed iframe
- View console logs and errors specific to the webview

---

## Publishing Your Extension

### Option 1: Publish to npm (Recommended)

Best for per-package versioning and monorepos.

1. **Make your extension folder an npm package:**

```json
// package.json
{
  "name": "@yourorg/my-extension",
  "version": "1.0.0",
  "files": [
    "extension.json",
    "main.js",
    "panel.html",
    "icon.svg"
  ],
  "keywords": ["agent-canvas-extension"]
}
```

2. **Keep versions in sync:** `package.json` version and `extension.json` version should match

3. **Publish:**

```bash
npm publish --access public
```

4. **Users install via:**

```
npm:@yourorg/my-extension@^1.0.0
```

### Option 2: Publish to GitHub

Best for extensions that already live in a Git repository.

1. **Commit your extension folder** to a GitHub repository

2. **Tag a release:**

```bash
git tag v1.0.0
git push --tags
```

3. **Users install via:**

```
github:yourorg/yourrepo@v1.0.0
```

`github:` is the canonical scheme (`gh:` and `github://` are accepted aliases).

**For monorepos:** Include the subpath to your extension folder:
```
github:yourorg/mono/packages/my-extension@v1.0.0
```

**For single-extension repos:** Omit the subpath:
```
github:yourorg/my-extension@v1.0.0
```

### Version Management

npm sources support **semantic versioning**:
- `@latest` — Latest version
- `@^1.0.0` — Compatible with 1.x (>= 1.0.0, < 2.0.0)
- `@~1.2.0` — Patch updates only (>= 1.2.0, < 1.3.0)
- `@1.0.0` — Exact version

GitHub sources resolve a **branch, tag, or commit SHA** (semver ranges are not supported for `github:` sources); the install is then pinned to that commit SHA. Publish releases as tags (e.g. `@v1.0.0`) so users get stable, immutable installs.

**Update discipline:**
- **Patch version (1.0.x):** Bug fixes only, no new capabilities
- **Minor version (1.x.0):** New features, may request new capabilities (users must re-consent)
- **Major version (x.0.0):** Breaking changes, wider host version requirement

Users get automatic update notifications when a new version matches their installed range.

---

## Creating a Marketplace

Share multiple extensions via a marketplace catalog:

```json
// .plugin/marketplace.json
{
  "name": "My Extensions",
  "owner": {
    "name": "Your Organization"
  },
  "plugins": [],
  "uiExtensions": [
    {
      "name": "my-extension",
      "description": "A useful extension",
      "source": "npm:@yourorg/my-extension@^1.0.0"
    },
    {
      "name": "another-extension",
      "description": "Another extension",
      "source": "./extensions/another"
    }
  ]
}
```

**Source options:**
- `"npm:<package>[@range]"` — npm package
- `"github:<owner>/<repo>[/<path>][@ref]"` — GitHub repository (`ref` is a branch, tag, or SHA)
- `"./relative/path"` — Relative to marketplace catalog
- `"https://..."` — Absolute URL

**Users install from your marketplace:**
```
github:yourorg/yourrepo
```

Agent Canvas fetches your catalog and displays available extensions.

---

## Best Practices

### Security
- **Request minimal capabilities** — Only ask for what you need
- **Validate user input** — Sanitize data in webviews
- **No secrets in code** — Don't embed API keys or credentials

### Performance
- **Lazy activation** — Use `onCommand` or `onView` instead of `"*"`
- **Minimize worker logic** — Offload heavy work to webviews
- **Cache data** — Use the storage API to avoid redundant API calls

### User Experience
- **Clear naming** — Use descriptive command titles and manifest names
- **Consistent theming** — Use Agent Canvas CSS variables
- **Error handling** — Show friendly messages when things go wrong

### Compatibility
- **Set `engines.agentCanvas`** — Specify your minimum required version
- **Test updates** — Verify new versions work before publishing
- **Document breaking changes** — Update your changelog for major versions

---

## Example: Complete Extension

See [hello-sidebar](https://github.com/jpshackelford/agent-canvas-experimental-extensions/tree/main/hello-sidebar) for a complete, working extension that demonstrates:
- Sidebar button with icon
- Webview panel
- Command registration
- Menu items with `when` clauses
- Settings page with storage
- Conversation panel tabs
- All capabilities in use

---

## Further Reading

- **[Extension Security Model](./SECURITY.md)** — How sandboxing and capabilities work
- **[Extension Architecture](./ARCHITECTURE.md)** — Technical implementation details
- **[Extension Points Roadmap](../EXTENSION_POINTS.md)** — Future contribution points
