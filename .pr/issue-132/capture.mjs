import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

mkdirSync(".pr/issue-132", { recursive: true });

const URL = "https://work-1-yrsrggnfhzzshrxo.prod-runtime.all-hands.dev";
const OUT = ".pr/issue-132";
const CONV = "2c9236f8-7405-469a-afbe-f91788ba7e93";

const acpEvents = [
  // Lead-in user message so v1UserEventsExist passes and the chat renders.
  {
    id: "user-evt-0",
    timestamp: "2026-05-07T14:29:55.000Z",
    source: "user",
    kind: "MessageEvent",
    llm_message: {
      role: "user",
      content: [
        { type: "text", text: "Use Claude Code to inspect the diff for upstream PR 14246, peek at event-message.tsx, then try to patch handle-event-for-ui.ts." },
      ],
    },
    activated_skills: [],
  },
  // Execute (shell command, completed) — should render as
  // "ACPToolCallEvent · gh pr diff 14246" with Command/Output blocks
  {
    id: "acp-evt-1",
    timestamp: "2026-05-07T14:30:00.000Z",
    source: "agent",
    kind: "ACPToolCallEvent",
    tool_call_id: "tc_exec_1",
    title: "gh pr diff 14246",
    status: "completed",
    tool_kind: "execute",
    raw_input: { command: "gh pr diff 14246 --repo OpenHands/OpenHands" },
    raw_output:
      "diff --git a/frontend/src/components/.../acp-tool-call-card.tsx\n@@ ...\n+import { ACPToolCallEvent } from ...\n+\n+const result = getACPToolCallResult(event);\n+return <GenericEventMessage status={result} ... />;",
    content: null,
    is_error: false,
  },
  // Read (file read, completed) — rendered with JSON Input: block
  {
    id: "acp-evt-2",
    timestamp: "2026-05-07T14:30:05.000Z",
    source: "agent",
    kind: "ACPToolCallEvent",
    tool_call_id: "tc_read_1",
    title: "src/components/v1/chat/event-message.tsx",
    status: "completed",
    tool_kind: "read",
    raw_input: { path: "src/components/v1/chat/event-message.tsx", limit: 80 },
    raw_output:
      "import React from 'react';\nimport { isACPToolCallEvent } from '#/types/v1/type-guards';\n…\nif (isACPToolCallEvent(event)) {\n  return <GenericEventMessageWrapper event={event} … />;\n}",
    content: null,
    is_error: false,
  },
  // Edit (failed) — rendered with **Error:** block instead of Output:
  {
    id: "acp-evt-3",
    timestamp: "2026-05-07T14:30:10.000Z",
    source: "agent",
    kind: "ACPToolCallEvent",
    tool_call_id: "tc_edit_1",
    title: "src/utils/handle-event-for-ui.ts",
    status: "failed",
    tool_kind: "edit",
    raw_input: { path: "src/utils/handle-event-for-ui.ts", anchor: "isACPToolCallEvent" },
    raw_output: "anchor not found: isACPToolCallEvent",
    content: null,
    is_error: true,
  },
];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();

// Intercept the events stream so the live conversation can't overwrite our
// injected uiEvents. The frontend uses an SSE-style endpoint
// /api/conversations/<id>/events for backfill. Cancel WebSocket / EventSource
// traffic too.
await page.route("**/api/conversations/*/events*", async (route) => {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ items: [], next_page_id: null, has_more: false }),
  });
});

await page.goto(`${URL}/conversations/${CONV}`, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);

// Inject the synthetic events into the dev-only window.__OH_EVENT_STORE__.
// We replace the uiEvents directly so the chat renders only our cards
// (clean demo) without interference from existing conversation traffic.
page.on("console", (msg) => console.log("[browser]", msg.type(), msg.text()));

const injected = await page.evaluate((events) => {
  const store = (window).__OH_EVENT_STORE__;
  if (!store?.setState) return { ok: false, reason: "store not exposed on window" };
  store.setState({
    events,
    eventIds: new Set(events.map((e) => e.id)),
    uiEvents: events,
  });
  console.log("OH-DEBUG store after setState:", JSON.stringify({
    eventCount: store.getState().events.length,
    uiEventCount: store.getState().uiEvents.length,
    sample: store.getState().uiEvents[0],
  }));
  return { ok: true, count: events.length };
}, acpEvents);
console.log("inject:", injected);

await page.waitForTimeout(1500);

// Debug: re-read store
const after = await page.evaluate(() => {
  const s = (window).__OH_EVENT_STORE__?.getState();
  return {
    events: s?.events?.length,
    uiEvents: s?.uiEvents?.length,
    sampleKind: s?.uiEvents?.[0]?.kind,
    chatChildren:
      document.querySelector("main, [role='main']")?.innerHTML?.slice(0, 500),
  };
});
console.log("post-wait:", after);

// Hide the right-side Changes panel if open so the chat takes more width
const changesBtn = page.getByRole("button", { name: /changes/i });
if (await changesBtn.count()) {
  try {
    await changesBtn.first().click();
    await page.waitForTimeout(400);
  } catch {}
}
await page.screenshot({ path: `${OUT}/04-acp-cards-collapsed.png`, fullPage: false });

// Expand the cards by clicking each cursor-pointer header button
const headers = page.locator("button.cursor-pointer.text-left");
const count = await headers.count();
console.log("headers found:", count);
for (let i = 0; i < count; i += 1) {
  try {
    await headers.nth(i).click();
    await page.waitForTimeout(200);
  } catch (e) {
    console.log("click err:", String(e).slice(0, 200));
  }
}
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/05-acp-cards-expanded.png`, fullPage: false });

// Frame 3: re-collapse the first two cards so the failed Edit card moves
// into the viewport, capturing the Error block.
await page.evaluate(() => {
  const headers = Array.from(document.querySelectorAll("button.cursor-pointer.text-left"));
  const collapse = headers.filter(
    (b) =>
      b.textContent?.includes("gh pr diff 14246") ||
      b.textContent?.includes("event-message.tsx"),
  );
  collapse.forEach((h) => h.click());
});
await page.waitForTimeout(400);
// Then expand the failed card if it isn't already
await page.evaluate(() => {
  const headers = Array.from(document.querySelectorAll("button.cursor-pointer.text-left"));
  const edit = headers.find((b) => b.textContent?.includes("handle-event-for-ui"));
  // ensure expanded — if collapsed (chevron rotated), click to open
  const chev = edit?.querySelector("[aria-expanded='false'], .rotate-0, svg");
  if (edit && chev) edit.click();
});
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/06-acp-card-failed.png`, fullPage: false });

await browser.close();
console.log("done");
