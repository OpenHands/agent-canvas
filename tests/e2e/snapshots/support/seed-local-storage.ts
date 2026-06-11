import type { Page } from "@playwright/test";

export interface SeedLocalStorageOptions {
  /**
   * Remove openhands-onboarded instead of setting it.
   * Use in onboarding modal tests that need the modal to appear.
   */
  removeOnboarded?: boolean;
  /**
   * Skip suppressing the analytics consent modal.
   * Use in tests that specifically snapshot the consent modal UI.
   */
  showConsentModal?: boolean;
  /**
   * Additional [key, value] pairs to seed alongside the standard keys.
   */
  extra?: [string, string][];
}

/**
 * Seeds the standard localStorage keys required by snapshot tests via
 * `page.addInitScript`, so the values are present before any app code runs.
 *
 * Defaults (overridable via options):
 *   - openhands-onboarded = "1"          (suppresses onboarding modal)
 *   - openhands-telemetry-consent = "denied"  (suppresses analytics consent modal)
 *   - openhands-backends / openhands-active-backend = seeded local backend
 */
export async function seedLocalStorage(
  page: Page,
  {
    removeOnboarded = false,
    showConsentModal = false,
    extra = [],
  }: SeedLocalStorageOptions = {},
) {
  await page.addInitScript(
    ({
      removeOnboarded,
      showConsentModal,
      extra,
    }: {
      removeOnboarded: boolean;
      showConsentModal: boolean;
      extra: [string, string][];
    }) => {
      if (removeOnboarded) {
        window.localStorage.removeItem("openhands-onboarded");
      } else {
        window.localStorage.setItem("openhands-onboarded", "1");
      }
      if (!showConsentModal) {
        window.localStorage.setItem("analytics-consent", "false");
        window.localStorage.setItem("openhands-telemetry-consent", "denied");
      }
      if (!window.localStorage.getItem("openhands-backends")) {
        window.localStorage.setItem(
          "openhands-backends",
          JSON.stringify([
            {
              id: "default-local",
              name: "Local",
              host: window.location.origin,
              apiKey: "test-session-key",
              kind: "local",
            },
          ]),
        );
      }
      if (!window.localStorage.getItem("openhands-active-backend")) {
        window.localStorage.setItem(
          "openhands-active-backend",
          JSON.stringify({ backendId: "default-local", orgId: null }),
        );
      }
      for (const [key, value] of extra) {
        window.localStorage.setItem(key, value);
      }
    },
    { removeOnboarded, showConsentModal, extra },
  );
}
