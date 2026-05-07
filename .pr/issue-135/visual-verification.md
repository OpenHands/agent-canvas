# Issue #135 — Show full model name in conversation header

Port of [OpenHands/OpenHands#14284](https://github.com/OpenHands/OpenHands/pull/14284).

## Recording setup

* Branch: `port/full-model-name-header`
* Backend: `npm run dev` (spawns isolated `openhands-agent-server@main` on `:18000`)
* Frontend: `localhost:12000` (exposed at `https://work-1-yrsrggnfhzzshrxo.prod-runtime.all-hands.dev/` for the recording)
* LLM configured via `PATCH /api/settings` with `agent_settings_diff.llm.model = litellm_proxy/claude-sonnet-4-5-20250929` and the live `LLM_API_KEY`.

The recordings were produced by `node scripts/record-demo.mjs full-model-name <out>.webm`, then converted to GIF with the ffmpeg snippet documented in that script.

## Visual diff

`comparison.png` stacks the same conversation header band before and after the fix:

* **Before** (`max-w-[150px] overflow-hidden` + inner `truncate`): `litellm_proxy/claude…` cuts off after the first 150 px.
* **After** (`whitespace-nowrap`, no inner truncate): the full `litellm_proxy/claude-sonnet-4-5-20250929` renders inline.

`before.png` / `after.png` are full 1280×720 captures of the conversation page in each state. `demo.gif` is the recorded "after" flow (home → New Conversation → header rendered with the un-truncated badge).

## Tests

* `npm test -- conversation-name` → 25/25 passing (includes the new assertions that the outer span has `whitespace-nowrap` and no `max-w-[150px]` / `overflow-hidden`, and the inner span has no `truncate`).
* `npm run typecheck` → clean.
