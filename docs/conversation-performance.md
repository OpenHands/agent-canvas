# Conversation performance notes

The conversation view is the highest-risk UI surface for unbounded growth:
long-running sessions accumulate events, tool outputs, browser screenshots, and
rendered DOM. This document records the current performance guardrails so future
changes can preserve the same invariants.

## Event rendering action lookup

Conversation rendering frequently needs to pair an observation with the action
that produced it. The message list, event grouping, and group summary all use
that relationship to render titles, thoughts, reasoning content, and tool
details.

The render path now builds a single `Map<eventId, ActionEvent>` for the current
event history in `Messages`, then passes that lookup to children. This avoids
repeated `Array.find` scans over the full conversation history for every
observation or group. The compatibility fallback still accepts a raw event list
for direct component tests and non-list callers, but production rendering should
prefer the precomputed lookup.

Invariants:

- Build the lookup from the full event history, not only the UI-reduced event
  list, because observations may need actions that have been replaced in
  `uiEvents`.
- Keep the lookup scoped to a render of `Messages`; it should not become a
  long-lived global cache.
- Do not reintroduce per-observation full-history scans in hot render paths.

## Retained event payload sanitizing

Browser observations can include base64 screenshots. Those payloads are useful
for the live Browser tab, but retaining every historical screenshot inside
React Query and the event store causes conversation memory to grow with browser
tool usage.

Before events are retained in history or Zustand, browser observation
`screenshot_data` is stripped through `stripHeavyEventPayloads`. The WebSocket
handler still reads the raw event first, so the Browser tab can keep showing the
latest screenshot. Only the retained history copy is sanitized.

Invariants:

- Sanitize both REST-loaded history pages and live events before they are stored
  in `useEventStore`.
- Keep the sanitizer narrow. It should remove payloads that are redundant for
  historical chat rendering, not change event identity, timestamps, action
  links, or visible text.
- If another event type starts carrying large binary or base64 data, add it to
  the same sanitizer rather than handling it in one fetch path only.
