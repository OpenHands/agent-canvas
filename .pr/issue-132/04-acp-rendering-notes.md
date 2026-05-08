# Visual proof of ACP tool-call rendering — addendum to demo.gif

This addresses the reviewer note that the original demo did not show ACP
events being rendered.

## Why a synthetic injection

`openhands-agent-server@1.20.1` cannot drive an ACP sub-agent inside the
sandbox (no Claude Code / Codex / Gemini CLI binaries, no ACP transport
configured), so the only way to exercise this code path against
`npm run dev` is to inject `ACPToolCallEvent` objects directly into the
running `useEventStore`. The injection is gated by
`if (import.meta.env.DEV)` and tree-shaken from production builds — it
only re-exports the existing Zustand store onto `window.__OH_EVENT_STORE__`
for fixture/preview tooling. No production behaviour changes.

## What the GIF shows

`demo.gif` alternates between two real screenshots from the dev server:

1. **`04-acp-cards-collapsed.png`** — Three `ACPToolCallEvent` cards
   rendered under a synthetic user message:
   - `Running gh pr diff 14246` (tool_kind=`execute`, status=`completed`)
   - `Reading src/components/v1/chat/event-message.tsx` (tool_kind=`read`, status=`completed`)
   - `Editing src/utils/handle-event-for-ui.ts` (tool_kind=`edit`, status=`failed`)
   The first two show the green "completed" success indicator; the third
   has no indicator (failed terminal state). All three render through
   the same `GenericEventMessageWrapper` path that ports OpenHands#13994 +
   #14246 + #14247 added.
2. **`05-acp-cards-expanded.png`** — Same conversation with the first
   two cards expanded:
   - The `execute` card surfaces `Command:` and `Output:` blocks with
     the SHTTP-style code block treatment.
   - The `read` card surfaces `Input:` (JSON) and `Output:` (file
     contents) — the same shape `getACPToolCallContent` produces for
     read tools.
   The localized titles are pulled from `ACTION_MESSAGE$ACP_RUN`,
   `ACTION_MESSAGE$ACP_READ`, `ACTION_MESSAGE$ACP_EDIT` etc.; the
   `make-i18n` step generated the matching declaration enum and locale
   bundles for all 15 locales.

## Functional verification

```
$ npx vitest run \
    __tests__/components/v1/chat/event-content-helpers/get-acp-tool-call-content.test.ts \
    __tests__/components/v1/chat/event-message-acp-tool-call.test.tsx
…
Test Files  2 passed (2)
     Tests  20 passed (20)
```

Plus the existing handle-event-for-ui and type-guard suites already in
the PR.

## Capture script

The capture is reproducible via `tmp-capture-acp.mjs` (committed
alongside this note for traceability) — it stubs the conversation
events endpoint, calls `useEventStore.setState({...})` with three
synthetic `ACPToolCallEvent`s plus a lead-in user `MessageEvent`, then
screenshots collapsed and expanded states.
