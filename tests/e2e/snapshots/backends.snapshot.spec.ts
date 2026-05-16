import { test, expect, Page } from "@playwright/test";

/**
 * Visual snapshot tests for the backend management UI.
 *
 * The BackendSelector lives in the sidebar footer and opens a dropdown on
 * hover.  Its footer contains two action buttons:
 *   - data-testid="add-backend-menu-item"     → opens BackendFormModal (add)
 *   - data-testid="manage-backends-menu-item" → opens ManageBackendsModal
 *
 * Backend state is seeded from the registry's default local backend
 * (DEFAULT_LOCAL_BACKEND_NAME = "Local") which is auto-created in
 * localStorage on first load.
 *
 * Three snapshots are captured:
 *   1. Selector dropdown open — shows the "Local" backend with status dot
 *      and the Add / Manage footer actions.
 *   2. Add Backend modal — BackendFormModal in "add" mode (empty form).
 *   3. Manage Backends modal — ManageBackendsModal listing the default backend.
 */

async function dismissConsentModal(page: Page) {
  await page
    .getByRole("button", { name: "Confirm preferences" })
    .click({ timeout: 3_000 })
    .catch(() => undefined);
}

async function setupMocks(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("openhands-onboarded", "true");
  });

  // Suppress file-API proxy errors emitted when the home page scans the
  // workspace directory (same suppression used in sidebar.snapshot.spec.ts).
  await page.route("**/api/file/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ path: "/home", subdirs: [] }),
    });
  });
}

/**
 * Navigate to the home page, wait for it to stabilise, then hover over the
 * backend selector to open the dropdown.  Returns the rootLayout locator.
 */
async function openBackendDropdown(page: Page) {
  await page.goto("/conversations");
  await dismissConsentModal(page);
  await page.waitForLoadState("networkidle");

  // Wait for the sidebar to be fully rendered.
  const rootLayout = page.getByTestId("root-layout");
  await expect(rootLayout).toBeVisible({ timeout: 15_000 });

  // The BackendSelector renders its Dropdown with openOnHover=true in the
  // expanded sidebar footer.  Hovering over data-testid="backend-selector"
  // fires onMouseEnter → openMenu().
  const backendSelector = page.getByTestId("backend-selector");
  await expect(backendSelector).toBeVisible({ timeout: 10_000 });
  await backendSelector.hover();

  // Wait for the dropdown footer actions to confirm the menu is open.
  await expect(page.getByTestId("add-backend-menu-item")).toBeVisible({
    timeout: 5_000,
  });

  return rootLayout;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe("Backend Management Visual Snapshots", () => {
  test.setTimeout(60_000);

  test("backend selector dropdown shows registered backend with status dot", async ({
    page,
  }) => {
    await setupMocks(page);
    const rootLayout = await openBackendDropdown(page);

    await expect(rootLayout).toHaveScreenshot("backend-selector-open.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.01,
    });
  });

  test("add backend modal opens with empty form", async ({ page }) => {
    await setupMocks(page);
    const rootLayout = await openBackendDropdown(page);

    // Click "Add backend" in the dropdown footer.
    // onMouseDown has stopPropagation to keep the menu open; onClick opens the modal.
    await page.getByTestId("add-backend-menu-item").click();

    // BackendFormModal (mode="add") has data-testid="add-backend-modal".
    await expect(page.getByTestId("add-backend-modal")).toBeVisible({
      timeout: 5_000,
    });

    // Wait for the name input to confirm the form has rendered.
    await expect(page.getByTestId("add-backend-name")).toBeVisible({
      timeout: 5_000,
    });

    await expect(rootLayout).toHaveScreenshot("backend-add-modal.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.01,
    });
  });

  test("manage backends modal lists the default local backend", async ({
    page,
  }) => {
    await setupMocks(page);
    const rootLayout = await openBackendDropdown(page);

    // Click "Manage backends" in the dropdown footer.
    await page.getByTestId("manage-backends-menu-item").click();

    // ManageBackendsModal has data-testid="manage-backends-modal".
    await expect(page.getByTestId("manage-backends-modal")).toBeVisible({
      timeout: 5_000,
    });

    // Confirm at least one backend row is visible (the default "Local" backend).
    // Row testids follow the pattern: manage-backends-row-${backend.name}.
    await expect(page.getByTestId("manage-backends-row-Local")).toBeVisible({
      timeout: 5_000,
    });

    await expect(rootLayout).toHaveScreenshot("backend-manage-modal.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.01,
    });
  });
});
