import { test, expect, type Page } from "@playwright/test";
import type { Backend } from "../../../src/api/backend-registry/types";
import { seedLocalStorage } from "./support/seed-local-storage";

/**
 * Extended visual snapshot tests for the backend management UI.
 *
 * The add-backend modal is a two-column layout:
 *   Left — Manual connection: name, host, API-key, Connect button.
 *          Kind is inferred from the host URL (local vs cloud).
 *   Right — Cloud OAuth: one-click "Login with OpenHands" device flow.
 *
 * Flow 1 — Add form validation gates (manual connection column)
 *   Connect is disabled until name + valid host are filled; cloud-inferred
 *   hosts additionally require an API key.
 *
 * Flow 2 — Two-column layout renders correctly
 *   The add modal shows both manual-connection and cloud-login columns
 *   side by side with an OR divider.
 *
 * Flow 3 — Cloud login column renders OAuth section
 *   The right column shows the OpenHands logo, description, and a
 *   "Login with OpenHands" device-flow button.
 *
 * Flow 4 — Remove backend with confirmation step
 *   Clicking "Remove" opens a ConfirmationModal; confirming removes the
 *   row; cancelling keeps it.
 *
 * Flow 5 — Edit backend pre-fills form fields
 *   Opening the edit modal for an existing backend populates name, host,
 *   and API-key inputs from the stored backend data.
 *
 * Flow 6 — Switch active backend via dropdown
 *   Selecting a different backend fires the environment-switch overlay,
 *   then updates the selector trigger label once the overlay fades.
 *
 * Flow 7 — Malformed / empty host blocks submission
 *   A host with only whitespace keeps the Connect button disabled.
 *   A syntactically invalid URL also keeps Connect disabled.
 *
 * Flow 8 — Close add form dismisses without saving
 *   Clicking the close (✕) button closes the modal without altering
 *   the backend list.
 */

// ── Constants ──────────────────────────────────────────────────────────────

/** Two pre-seeded backends used by multi-backend tests. */
const LOCAL_BACKEND: Backend = {
  id: "default-local",
  name: "Local",
  host: "http://localhost:3000",
  apiKey: "",
  kind: "local",
};

const CLOUD_BACKEND: Backend = {
  id: "test-production",
  name: "Production",
  host: "https://app.all-hands.dev",
  apiKey: "sk-test-key",
  kind: "cloud",
};

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Seed localStorage with one or two backends and navigate to the
 * conversations list so the BackendSelector is visible in the sidebar.
 * Routes file API and cloud-proxy requests so they don't produce
 * console errors that could affect timing.
 */
async function setupPage(
  page: Page,
  {
    backends = [LOCAL_BACKEND],
    activeBackendId,
  }: { backends?: Backend[]; activeBackendId?: string } = {},
) {
  const extra: [string, string][] = [
    ["openhands-backends", JSON.stringify(backends)],
  ];
  if (activeBackendId) {
    extra.push([
      "openhands-active-backend",
      JSON.stringify({ backendId: activeBackendId, orgId: null }),
    ]);
  }
  await seedLocalStorage(page, { extra });

  // Prevent workspace-scan 404s in the sidebar from cluttering timing.
  await page.route("**/api/file/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ path: "/home", subdirs: [] }),
    }),
  );
}

async function dismissConsentModal(page: Page) {
  await page
    .getByRole("button", { name: "Confirm preferences" })
    .click({ timeout: 3_000 })
    .catch(() => undefined);
}

/**
 * Navigate to the conversations list and hover the backend selector to
 * open the dropdown.  Returns the root-layout locator for snapshots.
 */
async function openDropdown(page: Page) {
  await page.goto("/conversations");
  await dismissConsentModal(page);
  await page.waitForLoadState("networkidle");

  const rootLayout = page.getByTestId("root-layout");
  await expect(rootLayout).toBeVisible({ timeout: 15_000 });

  const selector = page.getByTestId("backend-selector");
  await expect(selector).toBeVisible({ timeout: 10_000 });
  await selector.hover();

  await expect(page.getByTestId("add-backend-menu-item")).toBeVisible({
    timeout: 5_000,
  });

  return rootLayout;
}

/** Open the Add Backend modal via the dropdown footer. */
async function openAddModal(page: Page) {
  const rootLayout = await openDropdown(page);
  await page.getByTestId("add-backend-menu-item").click();
  await expect(page.getByTestId("add-backend-modal")).toBeVisible({
    timeout: 5_000,
  });
  await expect(page.getByTestId("add-backend-name")).toBeVisible({
    timeout: 5_000,
  });
  return rootLayout;
}

/** Open the Manage Backends modal via the dropdown footer. */
async function openManageModal(page: Page) {
  const rootLayout = await openDropdown(page);
  await page.getByTestId("manage-backends-menu-item").click();
  await expect(page.getByTestId("manage-backends-modal")).toBeVisible({
    timeout: 5_000,
  });
  return rootLayout;
}

const SNAP_OPTS = { animations: "disabled" as const, maxDiffPixelRatio: 0.01 };

// ── Test Suite ─────────────────────────────────────────────────────────────

test.describe("Backend Management — Extended Flow Snapshots", () => {
  test.setTimeout(90_000);

  // ── Flow 1: Add-form validation gates ─────────────────────────────────

  test("Flow 1a — add form blank: Connect button disabled until required fields filled", async ({
    page,
  }) => {
    await setupPage(page);
    const rootLayout = await openAddModal(page);

    // 1. Completely blank form — Connect must be disabled.
    await expect(page.getByTestId("add-backend-submit")).toBeDisabled();
    await expect(rootLayout).toHaveScreenshot(
      "backend-add-blank-disabled.png",
      SNAP_OPTS,
    );

    // 2. Fill only the name; host still empty → Connect still disabled.
    await page.getByTestId("add-backend-name").fill("My Backend");
    await expect(page.getByTestId("add-backend-submit")).toBeDisabled();
    await expect(rootLayout).toHaveScreenshot(
      "backend-add-name-only-disabled.png",
      SNAP_OPTS,
    );
  });

  test("Flow 1b — local backend becomes Connect-ready with name + host, no API key required", async ({
    page,
  }) => {
    await setupPage(page);
    const rootLayout = await openAddModal(page);

    // A localhost URL infers local kind — no API key needed.
    await page.getByTestId("add-backend-name").fill("Dev Server");
    await page.getByTestId("add-backend-host").fill("http://localhost:8080");

    // API key left empty — Connect must be enabled for local kind.
    await expect(page.getByTestId("add-backend-submit")).not.toBeDisabled();
    await expect(rootLayout).toHaveScreenshot(
      "backend-add-local-ready.png",
      SNAP_OPTS,
    );
  });

  test("Flow 1c — cloud-inferred backend requires API key; Connect stays disabled without it", async ({
    page,
  }) => {
    await setupPage(page);
    const rootLayout = await openAddModal(page);

    // An all-hands.dev URL infers cloud kind — API key required.
    await page.getByTestId("add-backend-name").fill("Cloud Prod");
    await page.getByTestId("add-backend-host").fill("https://app.all-hands.dev");

    // No API key → Connect disabled.
    await expect(page.getByTestId("add-backend-submit")).toBeDisabled();
    await expect(rootLayout).toHaveScreenshot(
      "backend-add-cloud-no-key-disabled.png",
      SNAP_OPTS,
    );

    // Fill API key → Connect enabled.
    await page.getByTestId("add-backend-api-key").fill("sk-live-abc123");
    await expect(page.getByTestId("add-backend-submit")).not.toBeDisabled();
    await expect(rootLayout).toHaveScreenshot(
      "backend-add-cloud-with-key-enabled.png",
      SNAP_OPTS,
    );
  });

  // ── Flow 2: Two-column layout ──────────────────────────────────────

  test("Flow 2 — add modal shows two-column layout with manual and cloud login", async ({
    page,
  }) => {
    await setupPage(page);
    const rootLayout = await openAddModal(page);

    // Left column: manual connection form is visible.
    await expect(page.getByTestId("add-backend-form")).toBeVisible();

    // Right column: cloud login section with device-flow OAuth.
    await expect(page.getByTestId("add-backend-cloud-title")).toBeVisible();
    await expect(page.getByTestId("add-backend-device-flow")).toBeVisible();
    await expect(page.getByTestId("add-backend-login-button")).toBeVisible();

    await expect(rootLayout).toHaveScreenshot(
      "backend-add-two-column-layout.png",
      SNAP_OPTS,
    );
  });

  // ── Flow 3: Cloud login column ────────────────────────────────────────

  test("Flow 3 — cloud login column shows advanced host override", async ({
    page,
  }) => {
    await setupPage(page);
    const rootLayout = await openAddModal(page);

    // Expand advanced settings in the cloud column.
    await page.getByTestId("add-backend-advanced-toggle").click();
    await expect(page.getByTestId("add-backend-cloud-host")).toBeVisible({
      timeout: 3_000,
    });

    await expect(rootLayout).toHaveScreenshot(
      "backend-add-cloud-advanced-open.png",
      SNAP_OPTS,
    );
  });

  // ── Flow 4: Remove backend with confirmation ──────────────────────────

  test("Flow 4 — removing a backend: confirmation modal then row disappears", async ({
    page,
  }) => {
    await setupPage(page, { backends: [LOCAL_BACKEND, CLOUD_BACKEND] });
    const rootLayout = await openManageModal(page);

    // Both backend rows visible.
    await expect(
      page.getByTestId("manage-backends-row-Local"),
    ).toBeVisible();
    await expect(
      page.getByTestId("manage-backends-row-Production"),
    ).toBeVisible();
    await expect(rootLayout).toHaveScreenshot(
      "backend-manage-two-listed.png",
      SNAP_OPTS,
    );

    // Click Remove on "Production".
    await page.getByTestId("manage-backends-remove-Production").click();

    // ConfirmationModal should appear with the backend name in the text.
    await expect(page.getByTestId("confirmation-modal")).toBeVisible({
      timeout: 5_000,
    });
    await expect(rootLayout).toHaveScreenshot(
      "backend-remove-confirmation.png",
      SNAP_OPTS,
    );

    // Click Cancel — Production row should still be present.
    await page.getByTestId("cancel-button").click();
    await expect(page.getByTestId("confirmation-modal")).not.toBeVisible({
      timeout: 3_000,
    });
    await expect(
      page.getByTestId("manage-backends-row-Production"),
    ).toBeVisible();
    await expect(rootLayout).toHaveScreenshot(
      "backend-remove-cancelled.png",
      SNAP_OPTS,
    );

    // Remove again and CONFIRM this time.
    await page.getByTestId("manage-backends-remove-Production").click();
    await expect(page.getByTestId("confirmation-modal")).toBeVisible({
      timeout: 5_000,
    });
    await page.getByTestId("confirm-button").click();

    // Row disappears from the manage list.
    await expect(
      page.getByTestId("manage-backends-row-Production"),
    ).not.toBeVisible({ timeout: 5_000 });
    await expect(rootLayout).toHaveScreenshot(
      "backend-manage-after-removal.png",
      SNAP_OPTS,
    );
  });

  // ── Flow 5: Edit backend modal pre-fills form ─────────────────────────

  test("Flow 5 — edit modal pre-populates existing backend's name, host and key", async ({
    page,
  }) => {
    await setupPage(page, { backends: [LOCAL_BACKEND, CLOUD_BACKEND] });
    const rootLayout = await openManageModal(page);

    // Open Edit for the Production backend.
    await page.getByTestId("manage-backends-edit-Production").click();
    await expect(page.getByTestId("edit-backend-modal")).toBeVisible({
      timeout: 5_000,
    });

    // Assert the pre-filled values.
    await expect(page.getByTestId("edit-backend-name")).toHaveValue(
      CLOUD_BACKEND.name,
    );
    await expect(page.getByTestId("edit-backend-host")).toHaveValue(
      CLOUD_BACKEND.host,
    );

    await expect(rootLayout).toHaveScreenshot(
      "backend-edit-prefilled.png",
      SNAP_OPTS,
    );
  });

  // ── Flow 6: Switch active backend ────────────────────────────────────

  test("Flow 6 — switching backends shows environment-switch overlay then updates selector", async ({
    page,
  }) => {
    // Start with Local active; Production is a second registered backend.
    await setupPage(page, {
      backends: [LOCAL_BACKEND, CLOUD_BACKEND],
      activeBackendId: LOCAL_BACKEND.id,
    });
    const rootLayout = await openDropdown(page);

    // Both options should be visible in the open dropdown.
    await expect(page.getByRole("option", { name: "Local" })).toBeVisible();
    await expect(
      page.getByRole("option", { name: "Production" }),
    ).toBeVisible();
    await expect(rootLayout).toHaveScreenshot(
      "backend-dropdown-two-backends.png",
      SNAP_OPTS,
    );

    // Click Production option — triggers the environment-switch overlay.
    // The overlay is rendered via createPortal into document.body, so it
    // lives outside the root-layout subtree.  Use a full-page screenshot
    // to capture it reliably.
    //
    // body[data-environment-switching="true"] is set synchronously inside
    // triggerEnvironmentSwitch before any React re-render, giving us a
    // stable early signal that the overlay is imminent even before React
    // paints the portal div.
    await page.getByRole("option", { name: "Production" }).click();
    await page.waitForSelector('body[data-environment-switching="true"]', {
      timeout: 2_000,
    });
    // Now wait for the actual portal div (React needs one render tick).
    await page.waitForSelector('[data-testid="environment-switch-overlay"]', {
      timeout: 2_000,
    });

    // The overlay card animates from opacity:0 → 1 over 980ms.  Playwright's
    // `animations: "disabled"` freezes CSS animations at frame 0, making the
    // card invisible in the screenshot.  Override that so the card renders
    // fully opaque for a deterministic snapshot.
    await page.addStyleTag({
      content:
        ".environment-switch-overlay > div { animation: none !important; opacity: 1 !important; transform: none !important; }",
    });

    await expect(page).toHaveScreenshot("backend-switch-overlay.png", SNAP_OPTS);

    // After overlay fades (980 ms), the selector should show "Production".
    await page.waitForSelector('[data-testid="environment-switch-overlay"]', {
      state: "hidden",
      timeout: 3_000,
    });
    // Re-hover to show the updated active backend in the dropdown.
    await page.getByTestId("backend-selector").hover();
    await expect(
      page.getByRole("option", { name: "Production" }),
    ).toBeVisible({ timeout: 5_000 });
    await expect(rootLayout).toHaveScreenshot(
      "backend-after-switch.png",
      SNAP_OPTS,
    );
  });

  // ── Flow 7: Malformed/empty host ──────────────────────────────────────

  test("Flow 7 — empty or invalid host keeps Connect disabled", async ({
    page,
  }) => {
    await setupPage(page);
    const rootLayout = await openAddModal(page);

    // Seed just the name, leave host blank.
    await page.getByTestId("add-backend-name").fill("Bad URL Test");

    // Whitespace-only host → isValidHostUrl returns false → disabled.
    await page.getByTestId("add-backend-host").fill("   ");
    await expect(page.getByTestId("add-backend-submit")).toBeDisabled();
    await expect(rootLayout).toHaveScreenshot(
      "backend-add-whitespace-host-disabled.png",
      SNAP_OPTS,
    );

    // A syntactically invalid URL is rejected by isValidHostUrl().
    await page.getByTestId("add-backend-host").fill("not://:::a valid url!!!");
    await expect(page.getByTestId("add-backend-submit")).toBeDisabled();
    await expect(rootLayout).toHaveScreenshot(
      "backend-add-invalid-url-disabled.png",
      SNAP_OPTS,
    );
  });

  // ── Flow 8: Cancel add form ───────────────────────────────────────────

  test("Flow 8 — closing the add form dismisses modal without persisting data", async ({
    page,
  }) => {
    await setupPage(page);
    const rootLayout = await openAddModal(page);

    // Partially fill the form.
    await page.getByTestId("add-backend-name").fill("Temp Backend");
    await page.getByTestId("add-backend-host").fill("http://localhost:9999");

    await expect(rootLayout).toHaveScreenshot(
      "backend-add-form-partially-filled.png",
      SNAP_OPTS,
    );

    // Click the close (✕) button.
    await page.getByTestId("add-backend-close").click();

    // Modal is dismissed.
    await expect(page.getByTestId("add-backend-modal")).not.toBeVisible({
      timeout: 5_000,
    });

    // Open Manage Backends to confirm "Temp Backend" was NOT saved.
    await page.getByTestId("backend-selector").hover();
    await expect(page.getByTestId("manage-backends-menu-item")).toBeVisible({
      timeout: 5_000,
    });
    await page.getByTestId("manage-backends-menu-item").click();
    await expect(page.getByTestId("manage-backends-modal")).toBeVisible({
      timeout: 5_000,
    });

    // Only the original "Local" backend should be present.
    await expect(
      page.getByTestId("manage-backends-row-Local"),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid*="manage-backends-row-Temp"]'),
    ).not.toBeVisible();

    await expect(rootLayout).toHaveScreenshot(
      "backend-cancel-nothing-saved.png",
      SNAP_OPTS,
    );
  });
});
