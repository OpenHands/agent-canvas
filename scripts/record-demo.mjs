#!/usr/bin/env node
/**
 * Record a short demo of agent-canvas for PR GIFs.
 *
 * Usage:
 *   node scripts/record-demo.mjs <flow> <output-webm>
 *
 * Convert the resulting webm to GIF with:
 *   ffmpeg -i <output>.webm \
 *     -vf "fps=10,scale=960:-1:flags=lanczos,split[s0][s1];\
 *          [s0]palettegen=max_colors=128[p];\
 *          [s1][p]paletteuse=dither=bayer:bayer_scale=4" \
 *     -loop 0 <output>.gif
 *
 * `npm run dev` from this repo must already be running. By default the
 * recorder hits `http://localhost:12000`; override with `DEMO_BASE_URL` when
 * the frontend is exposed via a remote host (e.g. an All Hands work URL),
 * otherwise the browser-side calls to the agent-server will fail with CORS.
 *
 * Flows:
 *   - full-model-name : open home → click "New Conversation" → wait for the
 *                       conversation header → hover the un-truncated model
 *                       badge so the tooltip is visible at the end of the
 *                       recording.
 */
import { chromium } from "playwright";
import { mkdirSync, renameSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const FLOW = process.argv[2] ?? "full-model-name";
const OUTPUT = process.argv[3]
  ? path.resolve(process.argv[3])
  : path.resolve(`.pr/${FLOW}.webm`);
const BASE_URL = process.env.DEMO_BASE_URL ?? "http://localhost:12000";
const VIEWPORT = { width: 1280, height: 720 };

const outDir = path.dirname(OUTPUT);
mkdirSync(outDir, { recursive: true });

const tmpDir = path.join(outDir, ".tmp-record");
mkdirSync(tmpDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: VIEWPORT,
  recordVideo: { dir: tmpDir, size: VIEWPORT },
});
const page = await context.newPage();
page.on("console", (msg) => {
  if (msg.type() === "error") {
    console.error(`[browser console error] ${msg.text()}`);
  }
});
page.on("pageerror", (error) => {
  console.error(`[browser page error] ${error.message}`);
});

async function flowFullModelName() {
  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
  // The "Account settings" popover (rendered when the user menu is open in
  // the host shell) can overlay the home content during initial load. Press
  // Escape so the home content is interactive, then dismiss any tooltip.
  await page.waitForTimeout(1_500);
  await page.keyboard.press("Escape");
  await page.mouse.click(640, 360);
  await page.waitForTimeout(500);
  // Wait for the "Start from Scratch" card.
  await page
    .getByRole("button", { name: /New Conversation/i })
    .first()
    .waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForTimeout(800);
  await page
    .getByRole("button", { name: /New Conversation/i })
    .first()
    .click();
  // Wait for navigation to /conversations/<id>.
  await page.waitForURL(/\/conversations\//, { timeout: 30_000 });
  // Wait for the model name badge to appear in the header.
  await page
    .getByTestId("conversation-name-llm-model")
    .waitFor({ state: "visible", timeout: 60_000 });
  // Hold so the GIF lingers on the un-truncated model name.
  await page.waitForTimeout(2_500);
  // Hover the model badge to make the tooltip appear.
  await page.getByTestId("conversation-name-llm-model").hover();
  await page.waitForTimeout(2_500);
}

const flows = {
  "full-model-name": flowFullModelName,
};

if (!flows[FLOW]) {
  throw new Error(`Unknown flow: ${FLOW}`);
}

await flows[FLOW]();

await context.close();
await browser.close();

// Move the generated webm into the requested output path.
const generated = readdirSync(tmpDir)
  .filter((name) => name.endsWith(".webm"))
  .map((name) => path.join(tmpDir, name))
  .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];

if (!generated) {
  throw new Error("Playwright did not produce a video file");
}

renameSync(generated, OUTPUT);
console.log(`Saved ${OUTPUT}`);
