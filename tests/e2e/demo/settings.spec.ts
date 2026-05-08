import { expect, test } from "@playwright/test";

import {
  dismissAnalyticsModal,
  enableDemoFeatureFlags,
} from "../support/demo-helpers";

test.beforeEach(async ({ page }) => {
  await enableDemoFeatureFlags(page);
});

test("renders SDK-driven condenser settings by prominence", async ({
  page,
}) => {
  await page.goto("/settings/condenser");
  await dismissAnalyticsModal(page);

  await expect(page.getByTestId("condenser-settings-screen")).toBeVisible();
  await expect(page.getByText(/Enable Memory Condens/)).toBeVisible();
  await expect(
    page.getByTestId("sdk-settings-condenser.enabled"),
  ).toBeChecked();
  await expect(page.getByTestId("sdk-settings-condenser.max_size")).toHaveCount(
    0,
  );

  await page.getByTestId("sdk-section-all-toggle").click();

  await expect(
    page.getByTestId("sdk-settings-condenser.max_size"),
  ).toBeVisible();
  await page.getByTestId("sdk-settings-condenser.max_size").fill("512");
  await expect(page.getByTestId("save-button")).toBeEnabled();
});
