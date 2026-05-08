import { expect, type Page } from "@playwright/test";

export async function enableDemoFeatureFlags(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("analytics-consent", "true");
    window.localStorage.setItem("FEATURE_AUTOMATIONS", "true");
  });
}

export async function dismissAnalyticsModal(page: Page) {
  const consentDialog = page.getByRole("dialog", {
    name: "Help improve OpenHands",
  });
  await page
    .getByRole("button", { name: "Confirm preferences" })
    .click({ timeout: 5000 })
    .catch(() => undefined);
  await expect(consentDialog).toHaveCount(0, { timeout: 5000 });
}

export async function expectConversationReady(page: Page) {
  await expect(page).toHaveURL(/\/conversations\/.+/);
  await expect(page.getByTestId("app-route")).toBeVisible({
    timeout: 20000,
  });
  await expect(page.getByTestId("conversation-name-title")).toContainText(
    "New Conversation",
    { timeout: 20000 },
  );
}
