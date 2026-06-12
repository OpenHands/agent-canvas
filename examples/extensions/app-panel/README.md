# App Panel (example Canvas Extension)

Adds an **App** panel to the conversation work area, beside the built-in Files, Browser,
and Terminal panels.

This demonstrates the `conversationRightPanels` surface (RFC §12.4) and the route-less
registration lifecycle (RFC §13.1): the manifest declares only panel *metadata*, and the
browser module registers the panel *implementation* by contribution id during
`activate(context)` — independent of any view route being open.

## What it does

- Contributes a `conversationRightPanels[]` entry: `id: "example.app-panel.app"`,
  `title: "App"`, an icon, and `order: 200`.
- On activation, calls `context.conversationPanels.registerRightPanel({ id, mount })`.
- The panel's `mount({ root, conversation })` renders placeholder content and shows the
  active conversation id, degrading gracefully when no conversation is active.
- Returns a `dispose()` that unregisters the panel when the extension is disabled or
  removed (so on the dev source stack it can disappear live, without a restart).

Canvas owns tab placement, collapsed/expanded behavior, focus, loading state, and the
per-panel error boundary; the extension only fills the panel body.

## Install

```sh
# packaged/restart-bounded:
agent-canvas install ./examples/extensions/app-panel --yes

# dev source stack (live):
npm run dev
agent-canvas install ./examples/extensions/app-panel --dev
```

Open a conversation and select the **App** tab among the right-hand panels.

## Assumed API shape

The RFC fixes the *manifest* contribution shape and the `registerRightPanel` entry point
but leaves the exact panel-mount params to implementation. This example assumes
`registerRightPanel({ id, mount({ root, conversation }) })` returning a disposable,
consistent with the DOM-island `mount()` contract used by views (RFC §12.4, §13).
If the implemented contract differs, only `dist/index.js` needs to change — the manifest
stays the same.
