import { test, expect } from "@playwright/test";

/**
 * Bet D reference spec — the "do the first unit by hand" artifact (see
 * `.context/research/autonomous-qa.md`). This is the shape an agent's emitted
 * `tests/e2e/verified/<conv-slug>.spec.ts` should mirror after a browser-
 * toolbelt verification:
 *   - navigate relative to the project's `baseURL` (never hardcode the
 *     ephemeral preview/prod host — that's what the `verified-dev` /
 *     `verified-prod` projects inject),
 *   - assert with web-first (auto-retrying) matchers, not manual waits,
 *   - keep it to ONE durable behavior so the committed spec + recorded video
 *     are reviewable at a glance.
 *
 * Run: `npx playwright test --project=verified-dev` (records video + trace).
 * Advisory for now — it builds trust; it does not gate.
 */
test("cockpit shell loads and the launcher is ready", async ({ page }) => {
  await page.goto("/");

  // The home launcher is the cockpit's entry affordance; if it renders, the
  // app shell booted and hydrated against this target.
  await expect(page.getByTestId("home-chat-launcher")).toBeVisible();
});
