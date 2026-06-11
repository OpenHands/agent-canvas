# Example Canvas Extensions

Three minimal Canvas Extensions that each exercise one contribution surface from the
[Canvas Extensions RFC](../../docs/ExtensionsSystemRFC.md). They are repo fixtures
(`private: true`), not published packages, and ship hand-written browser ESM so they
install and run with **no build step**.

| Example | Surface | Browser module | RFC |
|---|---|---|---|
| [`sunset-theme`](./sunset-theme) | A color theme in Settings > Application > Color Theme | none (manifest-only) | §12.2 |
| [`hello-page`](./hello-page) | A primary-nav page with placeholder content | `mount()` (view) | §12.1, §12.4 |
| [`app-panel`](./app-panel) | An "App" panel in the conversation view | `activate()` (route-less) | §12.4, §13.1 |

Together they cover the three module shapes: **no module** (theme-only), **`mount()`
only** (a view), and **`activate()` only** (a route-less registration).

## Install

```sh
agent-canvas install ./examples/extensions/sunset-theme --yes
agent-canvas install ./examples/extensions/hello-page  --yes
agent-canvas install ./examples/extensions/app-panel   --yes
agent-canvas list canvas-extensions
```

Lifecycle depends on launch mode (RFC §15.2):

- **Packaged / Docker / static** — restart-bounded. Enable/disable from the CLI, then
  restart `agent-canvas`. The Extensions page is read-only.
- **Dev source stack** (`npm run dev` / `dev:minimal`) — live management. Enable/disable
  from the Extensions page and pick up newly installed extensions without a restart.
  Use `--dev` to register a source folder and iterate:

  ```sh
  npm run dev
  agent-canvas install ./examples/extensions/hello-page --dev
  ```

## Verify each one

- **sunset-theme** — Settings > Application > Color Theme shows **Sunset**; selecting it
  recolors the app. Disabling/removing the extension falls back to the default theme.
- **hello-page** — a **Hello** entry appears in the left sidebar after Automations and
  opens the placeholder page; the "Say hello" button fires a host toast.
- **app-panel** — open a conversation; an **App** tab appears beside Files / Browser /
  Terminal and renders the panel (showing the active conversation id).

## How these map to the spec

- All three carry a `package.json` with `agentCanvas.manifest` and an
  `agent-canvas.extension.json` manifest (RFC §10, §11).
- Browser modules are plain browser-ready ESM with no bare runtime imports; the only
  imports are type-only JSDoc references that are erased (RFC §12.4, PoC §2.2).
- They use Canvas design tokens (`--oh-color-primary`, `--cool-grey-*`) instead of
  importing Canvas internals, and only touch host-mediated context APIs.
- They are **trusted same-origin** code once enabled — not sandboxed (RFC §19). Install
  only extensions you trust.
