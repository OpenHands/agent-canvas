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
