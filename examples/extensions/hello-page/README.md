# Hello Page (example Canvas Extension)

Adds a **Hello** entry to the primary left navigation (after Automations) that opens a
full page rendering placeholder "Hello, world" content.

This demonstrates the `views` + `leftNavigation` surfaces (RFC §12.1) and the
trusted same-origin `browser.module` view runtime (RFC §12.4, §13): Canvas mounts the
extension's `mount({ root, context })` into a Canvas-owned route container at
`/canvas-extensions/example.hello-page/hello`.

## What it does

- Contributes a `views[]` entry with a `primarySidebar` / `afterAutomations` navigation
  slot, an icon, and `order: 300`.
- Ships a browser-ready ESM module (`dist/index.js`) that renders into the provided
  `root` element using vanilla DOM — no React, no bundler, no bare imports.
- Uses Canvas design tokens (`var(--oh-color-primary)`, `var(--cool-grey-*)`) so it
  follows the active color theme, and reads `context.theme.colorScheme`.
- Calls the host API `context.ui.toast(...)` from a button to show a live host call.
- Returns a `dispose()` so Canvas can clean up on unmount/remount.

## Install

```sh
# packaged/restart-bounded:
agent-canvas install ./examples/extensions/hello-page --yes

# dev source stack (live), recommended for iterating:
npm run dev          # in one terminal
agent-canvas install ./examples/extensions/hello-page --dev
```

After install (and enable), look for **Hello** in the left sidebar, just below
Automations.

## Notes

`dist/index.js` is hand-written browser ESM, so **no build step is required**. A real
extension would author in TS/JSX and bundle to a single browser-ready ESM file; the
emitted module must still avoid bare runtime imports (RFC §12.4, PoC §2.2).
