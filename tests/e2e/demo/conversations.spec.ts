import { expect, test } from "@playwright/test";

import {
  dismissAnalyticsModal,
  enableDemoFeatureFlags,
  expectConversationReady,
} from "../support/demo-helpers";

test.beforeEach(async ({ page }) => {
  await enableDemoFeatureFlags(page);
});

test("starts local conversations from scratch and from a workspace", async ({
  page,
}) => {
  await page.goto("/");
  await dismissAnalyticsModal(page);

  await page.getByTestId("launch-new-conversation-button").click();
  await expectConversationReady(page);

  await page.getByTestId("ellipsis-button").click();
  await expect(
    page.getByTestId("conversation-name-context-menu"),
  ).toBeVisible();
  await expect(page.getByTestId("display-cost-button")).toBeVisible();
  await expect(page.getByTestId("show-skills-button")).toBeVisible();
  await expect(page.getByTestId("download-trajectory-button")).toBeVisible();
  await expect(page.getByTestId("delete-button")).toBeVisible();

  await page.goto("/");
  await dismissAnalyticsModal(page);
  await page.getByTestId("workspaces-tab").click();
  await page.getByTestId("workspace-dropdown").click();
  await page.getByTestId("add-workspaces-button").click();

  await expect(page.getByTestId("folder-browser-modal")).toBeVisible();
  await page.getByTestId("folder-browser-entry-Projects").click();
  await page.getByTestId("folder-browser-entry-OpenHands").click();
  await page.getByTestId("folder-browser-use").click();

  await page.getByTestId("workspace-dropdown").click();
  await page.getByText("agent-canvas", { exact: true }).click();
  await expect(page.getByTestId("workspace-launch-button")).toBeEnabled();
  await page.getByTestId("workspace-launch-button").click();

  await expectConversationReady(page);
});
