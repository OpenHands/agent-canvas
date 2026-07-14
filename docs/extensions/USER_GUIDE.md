# UI Extensions: User Guide

This guide explains how to **install, use, and manage UI extensions** in Agent Canvas.

> **What are UI extensions?** Small, third-party add-ons that enhance Agent Canvas with custom UI (sidebar buttons, panels, settings pages, menu items) without requiring you to modify the source code. Every extension runs in a security sandbox and requires your permission to access any privileged features.

---

## Prerequisites

### Enabling Extensions

UI extensions are an **experimental, opt-in feature** controlled by the `VITE_ENABLE_EXTENSIONS` build flag. Extensions are **disabled by default**.

**If you're running from source (development):**

```bash
# Add to your .env file
echo 'VITE_ENABLE_EXTENSIONS=true' >> .env

# Restart the development server
npm run dev
```

**If you're using Docker or a pre-built image:**

The flag is baked in at build time. You must rebuild the frontend with the flag enabled:

```bash
docker build --build-arg VITE_ENABLE_EXTENSIONS=true -t agent-canvas .
```

**How to tell if extensions are enabled:**

Navigate to `/extensions` in Agent Canvas. If extensions are disabled, you'll see:
> "The extensions feature is turned off. Set VITE_ENABLE_EXTENSIONS=true to enable it."

---

## Installing Extensions

### From the Extensions Page

1. **Navigate to Extensions:** Click **Extensions** in the left sidebar (below Skills) or go to `/extensions`
2. **Click "Add extension"** to open the installation dialog

### Add an extension

There is a single **Add extension** button. Paste one source; Agent Canvas auto-detects whether it points at a single extension or a whole marketplace, then routes you to the permission-consent card before anything is installed.

| Format | Example | Use Case |
|--------|---------|----------|
| **npm package** | `npm:@acme/hello-extension@^1.0.0` | Extensions published to npm (recommended) |
| **GitHub repository** | `github:owner/repo` | Extensions or marketplaces hosted on GitHub |
| **Direct URL** | `https://cdn.example.com/my-extension` | Self-hosted or development extensions |

**Examples:**

```
npm:@openhands/example-extension@latest
github:acme/extensions
github:myorg/tools
https://example.com/extensions/my-custom-tool
```

`github:` is the canonical scheme. `gh:` and `github://` are still accepted as silent aliases, so older links keep working, but the UI only ever shows `github:`.

**What happens on submit:**
1. Agent Canvas probes the source for a single extension manifest (`extension.json`) and for a marketplace catalog (`.plugin/marketplace.json`, then `.claude-plugin/marketplace.json`).
2. A single extension goes straight to the consent card. A marketplace shows a picker of its UI extensions (a one-entry marketplace skips the picker). A source that is both is treated as a marketplace.
3. You review the requested permissions and confirm — that is the only point at which anything is installed.

**Version Resolution:**
- `npm:` sources support **semantic versioning** (e.g., `^1.0.0`, `~2.1.0`, `latest`)
- `github:` sources resolve a **branch, tag, or commit SHA** (semver ranges are not supported for GitHub); the install is then pinned to that commit SHA
- Versions resolve to **pinned releases** served from CDNs (jsDelivr for npm, the parent-window asset relay for GitHub)
- `https://` URLs have **no version management** and always load the current content

---

## Reviewing and Approving Permissions

Extension installation uses **two-step, all-or-nothing consent** (like VS Code):

1. **Preview:** Agent Canvas fetches the extension manifest and shows you exactly what permissions it requests
2. **Approve:** Nothing is installed until you click "Install" to grant the requested permissions

### Available Permissions

| Permission | What it means | Example use case |
|------------|---------------|------------------|
| `conversation:read` | Read the active conversation's title and metadata, and compute event statistics | Show conversation info or trajectory stats in a panel |
| `storage` | Store data in your browser's local storage | Save extension settings or state |
| `backend:cloud:read` | Read data from the cloud backend API | List sandboxes, fetch conversations |
| `backend:cloud:write` | Write data to the cloud backend API | Pause/resume sandboxes, create conversations |
| *(none)* | Extension can only contribute UI, no privileged access | Simple sidebar panels with static content |

**Note:** Extensions with `backend:cloud:*` permissions can make API calls to your cloud backend
(e.g., `app.all-hands.dev`). They never see your authentication tokens — the host handles auth
automatically.

**Important:**
- Permissions are shown **before** you install
- You must **approve all** requested permissions (you cannot grant some and deny others)
- If you don't trust an extension's permission requests, **don't install it**

---

## Managing Installed Extensions

### Viewing Installed Extensions

The `/extensions` page shows all installed extensions with:
- Extension name and version
- Install source (npm, gh, or URL)
- Enable/disable toggle
- Update availability (for versioned installs)
- Uninstall button

### Enabling and Disabling

Click the toggle switch on any extension card to enable or disable it:
- **Disabled:** The extension's UI contributions are hidden, and its background logic doesn't run
- **Enabled:** The extension is fully active

### Updating Extensions

For **versioned installs** (npm and gh sources), Agent Canvas periodically checks for updates within your installed version range.

**When an update is available:**
1. An **"Update available"** badge appears on the extension card
2. Click the **"Update"** button to install the newer version

**Update Safety:**
- If the new version requires **additional permissions**, the update is **blocked**
  - You'll see an error message
  - Re-install through the normal flow to review and approve the new permissions
- If the new version requires a **newer Agent Canvas version** than you have, the update is **blocked**
  - Your current version continues to work
  - Upgrade Agent Canvas to use the newer extension version

### Uninstalling Extensions

Click **"Uninstall"** on any extension card to remove it:
- The extension's UI contributions disappear immediately
- Any data stored by the extension remains in your browser's local storage (you may need to clear it manually)
- The extension can be re-installed later

**Dev Extensions:**
Extensions marked with a **"Dev"** badge are managed by your operator/administrator and cannot be uninstalled through the UI.

---

## Using Extensions

Once installed and enabled, extensions contribute various UI elements:

### Sidebar Panels

Extensions can add **buttons to the sidebar rail** (left side). Click an extension's button to:
- Open its panel in the main area
- The panel may be a static HTML page or an interactive app

### Menu Items

Extensions can add **items to context menus** throughout Agent Canvas:
- Right-click conversation tabs to see extension menu items
- Open the chat input "add" menu (⋮) for extension actions

### Settings Pages

Extensions can add **settings pages** accessible from:
- Settings → Extensions → [Extension Name]
- The extension uses these pages to let you configure its behavior

### Commands

Extensions can register **commands** accessible via:
- The Command Palette (Cmd+K or Ctrl+K)
- Menu items that trigger the command
- Keyboard shortcuts (if configured)

---

## Security and Privacy

### How Extensions Are Sandboxed

Extensions run in a **strict security sandbox**:

1. **No direct DOM access:** Extension code runs in a Web Worker (background thread) with no access to your page's DOM
2. **No network access:** Extension webviews cannot make HTTP requests directly (CSP: `connect-src 'none'`)
3. **Capability-gated API:** Extensions can only access host features you've approved via permissions
4. **Isolated storage:** Extensions can only access their own namespaced storage, not your cookies or credentials

### What Extensions Can and Cannot Do

**Extensions CAN:**
- Display UI in sandboxed iframes
- Access approved capabilities (conversation data, storage) via the host API
- Receive messages from the host about UI events

**Extensions CANNOT:**
- Access your cookies, auth tokens, or credentials
- Make arbitrary network requests
- Modify Agent Canvas's source code or UI directly
- Access other extensions' data
- Escape the sandbox

### Trusting Extensions

Before installing an extension:
- **Review the requested permissions** — do they make sense for what the extension does?
- **Check the source** — is it from a trusted author or organization?
- **Use versioned installs** — `npm:` and `github:` sources are pinned and immutable
- **Be cautious with `https://` URLs** — these can change without notice

**When in doubt, don't install.**

---

## Troubleshooting

### Extensions page says "Extensions feature is turned off"

**Solution:** Extensions must be enabled at build time with `VITE_ENABLE_EXTENSIONS=true`. See [Enabling Extensions](#enabling-extensions).

### Extension install fails with "Incompatible host version"

**Cause:** The extension requires a newer version of Agent Canvas than you have.

**Solution:** 
- Upgrade Agent Canvas, or
- Contact the extension author to request support for your Agent Canvas version

### Extension install fails with "Failed to fetch manifest"

**Possible causes:**
- The source URL is incorrect or inaccessible
- For `github:` sources, the repository or path doesn't exist
- For `npm:` sources, the package doesn't exist or isn't published

**Solution:** Double-check the source reference for typos.

### Extension panel shows blank page

**Possible causes:**
- The extension's webview HTML failed to load
- JavaScript errors in the extension code

**Solution:** 
- Check the browser console for errors
- Report the issue to the extension author

### Extension stopped working after Agent Canvas update

**Cause:** The extension may be incompatible with the new Agent Canvas version.

**Solution:**
- Check for extension updates
- Contact the extension author
- Temporarily disable the extension

---

## Further Reading

- **[Extension Author Guide](./AUTHOR_GUIDE.md)** — Learn how to create your own extensions
- **[Extension Security Model](./SECURITY.md)** — Deep dive into how extensions are sandboxed
- **[Extension Architecture](./ARCHITECTURE.md)** — Technical implementation details
