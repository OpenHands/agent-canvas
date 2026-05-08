# Visual verification — Issue #132 (ACP tool-call rendering)

This port mirrors three upstream OpenHands frontend PRs:

- [OpenHands#13994](https://github.com/OpenHands/OpenHands/pull/13994) — initial ACP tool-call event support.
- [OpenHands#14246](https://github.com/OpenHands/OpenHands/pull/14246) — drop the `ACP · ` prefix from titles.
- [OpenHands#14247](https://github.com/OpenHands/OpenHands/pull/14247) — suppress `in_progress` events so empty-args cards don't flash.

## Live verification (`npm run dev`)

`agent-canvas` was rebuilt from the `port/acp-tool-call-rendering` branch
and run against a local `openhands-agent-server` 1.20.1 (started by
`scripts/dev-safe.mjs`). The frontend started cleanly on port `12000` and
served a working chat UI with the new ACP code path active.

Frames in `demo.gif`:

1. **`01-home.png`** — Agent Canvas home page (`Let's Start Building!`)
   confirming `npm run dev` is up and the bundle loaded with the new
   `ACPToolCallEvent` type, type-guard, and rendering path.
2. **`02-conversation-changes.png`** — Inside an existing conversation
   with the `Changes` panel open. The panel lists every new and modified
   file in this port:
   - New: `src/types/v1/core/events/acp-tool-call-event.ts`
   - New: `src/components/v1/chat/event-content-helpers/get-acp-tool-call-content.ts`
   - Modified: `event-message.tsx`, `should-render-event.ts`,
     `generic-event-message-wrapper.tsx`, `get-event-content.tsx`,
     `get-observation-result.ts`, `handle-event-for-ui.ts`,
     `type-guards.ts`, `openhands-event.ts`, `events/index.ts`,
     `i18n/translation.json`
   - Plus four matching test files under `__tests__/`.

## Functional verification (unit tests)

39 new/modified ACP-specific test cases pass:

```
$ npx vitest run \
    __tests__/components/v1/chat/event-content-helpers/get-acp-tool-call-content.test.ts \
    __tests__/components/v1/chat/event-content-helpers/should-render-event.test.ts \
    __tests__/utils/handle-event-for-ui.test.ts \
    __tests__/components/v1/chat/event-message-acp-tool-call.test.tsx
…
Test Files  4 passed (4)
     Tests  39 passed (39)
```

Coverage:

- `getACPToolCallTitleKey` — picks the right `ACTION_MESSAGE$ACP_*` key
  for every `tool_kind` (execute / edit / read / fetch / other / null).
- `getACPToolCallContent` — formats execute calls with `Command:` +
  `Output:` blocks (matching `getTerminalObservationContent`), formats
  non-execute calls with a JSON `Input:` block, swaps `Output:` for
  `**Error:**` when `is_error`, falls back to the shared
  `OBSERVATION$COMMAND_NO_OUTPUT` copy, truncates >`MAX_CONTENT_LENGTH`,
  and serialises structured outputs as JSON.
- `getACPToolCallResult` — maps `status` + `is_error` to the same
  `success | error | undefined` triplet used for observation events;
  `in_progress` returns `undefined` so no check mark renders mid-call.
- `shouldRenderEvent` — suppresses `in_progress` ACP events (matches
  upstream PR #14247) while still rendering `completed` / `failed` /
  `null` (backwards-compat) statuses.
- `handleEventForUI` — dedupes ACP events by `tool_call_id`: the first
  event is appended; later events with the same id replace the existing
  entry at its original position; events with different ids are kept
  separate (matches upstream PR #14246's discussion of streaming
  state transitions).
- `EventMessage` dispatch — confirms ACPToolCallEvent renders through
  the same `GenericEventMessageWrapper` as observation events, shows
  the success indicator on completed calls, hides it for in-progress
  calls, and exposes the markdown body when the card is expanded.

## Why no live ACP capture in the GIF

Triggering a real ACP sub-agent (Claude Code, Codex, Gemini CLI) in this
sandbox is out of scope — those require a separately configured ACP
backend in the agent server. The upstream PR #14246 includes a
Storybook story (`ACPToolCallCard.stories.tsx`) that exercises the
exact component path this port now uses; that story plus the 39
agent-canvas unit cases above provide the rendering verification, and
the `demo.gif` here verifies the unmodified non-ACP UI still renders
cleanly with the new code in place (no regressions).
