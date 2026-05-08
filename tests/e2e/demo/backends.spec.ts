import { expect, test } from "@playwright/test";

import {
  dismissAnalyticsModal,
  enableDemoFeatureFlags,
} from "../support/demo-helpers";

test.beforeEach(async ({ page }) => {
  await enableDemoFeatureFlags(page);
});

test("adds and switches local and cloud backend environments", async ({
  page,
}) => {
  await page.goto("/");
  await dismissAnalyticsModal(page);

  await page.getByTestId("user-avatar").click({ force: true });
  await page.getByTestId("add-backend-menu-item").click();
  await page.getByTestId("add-backend-name").fill("Second local");
  await page.getByTestId("add-backend-host").fill("http://localhost:18002");
  await expect(page.getByTestId("add-backend-kind-local")).toBeChecked();
  await page.getByTestId("add-backend-submit").click();

  await page.getByTestId("user-avatar").click({ force: true });
  await page.getByTestId("backend-selector").locator("input").click();
  await page.getByText("Second local", { exact: true }).click();
  await expect(
    page.getByTestId("backend-selector").locator("input"),
  ).toHaveValue("Second local");
  await expect(page.getByTestId("workspaces-tab")).toBeVisible();

  await page.getByTestId("add-backend-menu-item").click();
  await page.getByTestId("add-backend-name").fill("Production");
  await page.getByTestId("add-backend-host").fill("app.all-hands.dev");
  await page.getByTestId("add-backend-api-key").fill("sk-demo");
  await expect(page.getByTestId("add-backend-kind-cloud")).toBeChecked();
  await page.getByTestId("add-backend-submit").click();

  await page.getByTestId("user-avatar").click({ force: true });
  await page.getByTestId("backend-selector").locator("input").click();
  await page
    .getByRole("option", { name: /Production.*Personal Workspace/ })
    .click();
  await expect(
    page.getByTestId("backend-selector").locator("input"),
  ).toHaveValue(/Production.*Personal Workspace/);
  await expect(page.getByTestId("workspaces-tab")).toHaveCount(0);
  await expect(page.getByText("Cloud Demo Conversation")).toBeVisible();
});
