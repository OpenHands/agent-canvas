# hello-sidebar (sample UI extension)

A minimal sample for the VS Code–style UI extension system (see
`docs/proposals/ui-extensions.md` and `src/extensions/README.md`).

It contributes:

- an Activity Bar (sidebar) button **Hello** with an icon,
- a webview panel (`panel.html`) shown when the button is selected,
- a command **Hello: Say hi** that reads the active conversation and shows a host
  message.

Files:

- `extension.json` — the declarative manifest (parsed by `src/extensions/manifest.ts`).
- `main.js` — worker entry; runs off the host thread with no DOM access.
- `panel.html` — sandboxed webview UI using `acquireAgentCanvasApi()`.
- `icon.svg` — the rail icon.

This sample requires only the `conversation:read` capability, which the host surfaces
for consent at install time.
