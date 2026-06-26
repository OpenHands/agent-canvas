# UI Extensions

A VS Code–style mechanism that lets customer-supplied bundles contribute UI (sidebar
buttons, panels, commands) **without modifying Agent-Canvas source** and **without
giving third-party code access to the host DOM, cookies, or credentials**.

See `docs/proposals/ui-extensions.md` for the full design and rationale.

## Architecture at a glance

```
extension.json (declarative)        ──parse──▶  manifest.ts
        │                                            │
        ▼                                            ▼
   loader.ts  ──register──▶  contribution-registry.ts  ──▶  Sidebar / Command menu (native UI)
        │                                            ▲
        │ (on select)                                │ useContributions()
        ▼
 extension-manager.ts ──▶ host/extension-host.ts ──RPC──▶ Web Worker (sdk/runtime.ts)
        │                          │                          runs extension main()
        │                          │ createHostMethods() (capability-gated)
        ▼                          ▼
 host/webview-transport.ts ──▶ sandboxed <iframe> (ExtensionWebview)  ── same host API
```

Key properties:

- **Declarative-first.** Sidebar buttons/commands/views are declared as data; the
  shell renders them. Showing a button runs no extension code.
- **Isolated logic.** Extension `main()` runs in a Web Worker (no DOM). It reaches the
  app only via the `agentCanvas` RPC API.
- **Sandboxed custom UI.** Webviews are `sandbox="allow-scripts"` (origin-null)
  iframes using the same capability-gated API over `postMessage`.
- **Least privilege.** Every privileged call is gated by the manifest's
  `capabilities`, surfaced for consent at install time.

## File map

| Area | Files |
|---|---|
| Types | `types.ts`, `sdk/types.ts` |
| Manifest | `manifest.ts` |
| Registry | `contribution-registry.ts`, `use-contributions.ts` |
| Loader / manager | `loader.ts`, `extension-manager.ts` |
| Host runtime | `host/rpc.ts`, `host/host-api.ts`, `host/extension-host.ts`, `host/webview-transport.ts` |
| Worker/webview SDK | `sdk/runtime.ts`, `sdk/worker-bootstrap.ts`, `sdk/api-proxy.ts`, `sdk/webview-client.ts` |
| UI | `../components/features/sidebar/sidebar-contribution-button.tsx`, `../components/features/extensions/extension-webview.tsx` |

## Authoring an extension

A bundle is a folder with an `extension.json`, an optional worker `main`, and optional
webview assets. See `examples/extensions/hello-sidebar/` for a minimal working sample.

```jsonc
{
  "id": "acme.hello",
  "name": "Hello",
  "version": "1.0.0",
  "engines": { "agentCanvas": "^1.0.0" },
  "main": "main.js",
  "activationEvents": ["onCommand:hello.say"],
  "capabilities": ["conversation:read"],
  "contributes": {
    "viewsContainers": { "activitybar": [{ "id": "hello.container", "title": "Hello", "icon": "icon.svg" }] },
    "views": { "hello.container": [{ "id": "hello.panel", "name": "Hello", "type": "webview" }] },
    "commands": [{ "command": "hello.say", "title": "Hello: Say hi" }]
  }
}
```

```js
// main.js (runs in a Web Worker)
export function activate(ctx) {
  ctx.agentCanvas.commands.register("hello.say", async () => {
    const convo = await ctx.agentCanvas.conversation.getActive();
    await ctx.agentCanvas.window.showInformationMessage(
      `Hi! Active conversation: ${convo?.title ?? "none"}`,
    );
  });
}
```

## Status

M1–M4 are implemented and tested (`__tests__/extensions/`). Remaining work (app
mounting with real host dependencies, the `/extensions` management UI, and CSP/origin
hardening) is tracked in the proposal's "Implementation status" section.
