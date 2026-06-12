# Shell Toolkit (example Canvas Extension)

A **multi-surface** Canvas Extension: one package, one browser module, three
contribution surfaces. This is the case the single-surface examples don't show —
it demonstrates the unified module contract from RFC §13.1, where one module's
`activate()` registers route-less surfaces and `mount()` renders a view.

## Surfaces (all from `dist/index.js`)

| Surface | Contribution | Registered in |
|---|---|---|
| Tool visualizer | `toolVisualizers` — renders shell-like MCP tool calls as a terminal card | `activate()` |
| Conversation panel | `conversationRightPanels` — a **Commands** panel beside Files/Browser/Terminal | `activate()` |
| Navigation view | `views` — a **Shell** page in the left nav (after Automations) | `mount()` |

The visualizer and panel are route-less, so they register during the startup
`activate(context)` pass and exist regardless of whether the Shell view is open. The
returned disposable unregisters both on disable/remove — so on the dev source stack the
visualizer and panel can appear/disappear live without a restart (RFC §15.2/§13.1).

## Install

```sh
# packaged/restart-bounded:
agent-canvas install ./examples/extensions/shell-toolkit --yes

# dev source stack (live):
npm run dev
agent-canvas install ./examples/extensions/shell-toolkit --dev
```

## Verify

- A **Shell** entry appears in the left sidebar after Automations and opens the view.
- Open a conversation: a **Commands** tab appears beside Files / Browser / Terminal.
- When the agent runs a shell-like MCP tool (`tool_name` of `shell` / `bash` /
  `execute_bash`), the event renders as a terminal card instead of the default body;
  other tools and events fall through to the built-in renderers (RFC §12.9).

## Provisional contracts ⚠️

Two parts depend on contracts the RFC has not finalized; both are flagged inline in
`dist/index.js`:

1. **Visualizer body** — follows the not-yet-final agent-team API (PR #1277, RFC §12.9).
   The real `Body` is a React component returning a React node from
   `@openhands/agent-canvas/visualizers` primitives; this example returns a DOM node for
   illustration. The relationship between the manifest `toolVisualizers[].module` field
   and `activate()`-registration also needs to be pinned.
2. **Right-panel mount** — same assumed `registerRightPanel({ id, mount })` /
   `mount({ root, conversation })` shape as [`app-panel`](../app-panel), pending §12.4/§13.1.

When those land, only `dist/index.js` should need to change; the manifest stays the same.
