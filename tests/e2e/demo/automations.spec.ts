import { expect, test } from "@playwright/test";

import {
  dismissAnalyticsModal,
  enableDemoFeatureFlags,
} from "../support/demo-helpers";

test.beforeEach(async ({ page }) => {
  await enableDemoFeatureFlags(page);
});

test("lists, opens, toggles, and deletes automations", async ({ page }) => {
  await page.goto("/automations");
  await dismissAnalyticsModal(page);

  await expect(
    page.getByRole("heading", { name: "Automations" }),
  ).toBeVisible();
  await expect(page.getByText("PR Triage Digest")).toBeVisible();
  await expect(page.getByText("Release Readiness Review")).toBeVisible();

  await page.getByText("PR Triage Digest").click();
  await expect(page).toHaveURL(/\/automations\/a1000000-/);
  await expect(
    page.getByRole("heading", { name: "PR Triage Digest" }),
  ).toBeVisible();
  await expect(
    page.getByText("Review newly opened pull requests"),
  ).toBeVisible();

  await expect(page.getByRole("switch", { name: "Turn off" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.getByRole("switch", { name: "Turn off" }).click();
  await expect(page.getByRole("switch", { name: "Turn on" })).toHaveAttribute(
    "aria-checked",
    "false",
  );

  await page.getByRole("button", { name: "Automation actions" }).click();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(
    page.getByRole("heading", { name: "Delete automation" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Delete" }).last().click();

  await expect(page).toHaveURL(/\/automations$/);
  await expect(page.getByText("PR Triage Digest")).toHaveCount(0);
});
