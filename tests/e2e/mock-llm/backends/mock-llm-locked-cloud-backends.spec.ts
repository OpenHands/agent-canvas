import { expect, test, type Page } from "@playwright/test";
import { waitForTestId } from "../utils/mock-llm-helpers";

const LOCKED_CLOUD_BACKEND_ID = "locked-cloud";
const LOCKED_CLOUD_BACKEND_NAME = "Locked Cloud";
const LOCKED_CLOUD_ORG_ID = "locked-org";
const LOCKED_CLOUD_ORG_NAME = "Locked Organization";
const LOCKED_CLOUD_USER_ID = "locked-user";
const LOCKED_CLOUD_API_KEY = "mock-cloud-api-key";

test.describe.configure({ mode: "serial" });

async function seedLockedCloudMode(page: Page) {
  await page.addInitScript(
    ({ backendId, backendName, orgId, apiKey }) => {
      const lockedHost = window.location.origin;
      const backend = {
        id: backendId,
        name: backendName,
        host: lockedHost,
        apiKey,
        kind: "cloud",
      };
      const selection = JSON.stringify({ backendId, orgId });

      (
        window as unknown as Record<string, unknown>
      ).__AGENT_CANVAS_LOCK_TO_CLOUD__ = lockedHost;
      window.localStorage.setItem("openhands-onboarded", "1");
      window.localStorage.setItem("analytics-consent", "false");
      window.localStorage.setItem("openhands-telemetry-consent", "denied");
      window.localStorage.setItem("openhands-telemetry-first-use", "true");
      window.localStorage.setItem(
        "openhands-backends",
        JSON.stringify([backend]),
      );
      window.localStorage.setItem("openhands-active-backend", selection);
      window.sessionStorage.setItem("openhands-active-backend", selection);
    },
    {
      backendId: LOCKED_CLOUD_BACKEND_ID,
      backendName: LOCKED_CLOUD_BACKEND_NAME,
      orgId: LOCKED_CLOUD_ORG_ID,
      apiKey: LOCKED_CLOUD_API_KEY,
    },
  );
}

async function routeLockedCloudApi(page: Page) {
  await page.route("**/api/keys/current", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "locked-key",
        name: "Locked key",
        org_id: LOCKED_CLOUD_ORG_ID,
        user_id: LOCKED_CLOUD_USER_ID,
        auth_type: "pat",
      }),
    });
  });

  await page.route("**/api/organizations", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            id: LOCKED_CLOUD_ORG_ID,
            name: LOCKED_CLOUD_ORG_NAME,
          },
        ],
        current_org_id: LOCKED_CLOUD_ORG_ID,
      }),
    });
  });

  await page.route(
    `**/api/organizations/${LOCKED_CLOUD_ORG_ID}/me`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          org_id: LOCKED_CLOUD_ORG_ID,
          user_id: LOCKED_CLOUD_USER_ID,
        }),
      });
    },
  );
}

test.describe("locked Cloud backend management", () => {
  test("shows the locked Cloud row without edit or remove actions", async ({
    page,
  }) => {
    await seedLockedCloudMode(page);
    await routeLockedCloudApi(page);

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForTestId(page, "backend-selector");

    await page.getByTestId("backend-selector").click();
    await page.getByTestId("manage-backends-menu-item").click();

    const modal = page.getByTestId("manage-backends-modal");
    await expect(modal).toBeVisible({ timeout: 5_000 });

    const row = page.getByTestId(
      `manage-backends-row-${LOCKED_CLOUD_BACKEND_NAME}`,
    );
    await expect(row).toBeVisible();
    await expect(row.getByText(LOCKED_CLOUD_BACKEND_NAME)).toBeVisible();
    await expect(row.getByText(LOCKED_CLOUD_ORG_NAME)).toBeVisible();
    await expect(
      row.getByTestId(`manage-backends-edit-${LOCKED_CLOUD_BACKEND_NAME}`),
    ).toHaveCount(0);
    await expect(
      row.getByTestId(`manage-backends-remove-${LOCKED_CLOUD_BACKEND_NAME}`),
    ).toHaveCount(0);
  });
});
