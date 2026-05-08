import { expect, type Page, test } from "@playwright/test";

async function dismissAnalyticsModal(page: Page) {
  const consentDialog = page.getByRole("dialog", {
    name: "Help improve OpenHands",
  });
  await page
    .getByRole("button", { name: "Confirm preferences" })
    .click({ timeout: 5000 })
    .catch(() => undefined);
  await expect(consentDialog).toHaveCount(0, { timeout: 5000 });
}

async function expectConversationReady(page: Page) {
  await expect(page).toHaveURL(/\/conversations\/.+/);
  await expect(page.getByTestId("app-route")).toBeVisible({
    timeout: 20000,
  });
  await expect(page.getByTestId("conversation-name-title")).toContainText(
    "New Conversation",
    { timeout: 20000 },
  );
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("analytics-consent", "true");
    window.localStorage.setItem("FEATURE_AUTOMATIONS", "true");
  });
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
