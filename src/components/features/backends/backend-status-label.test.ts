import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import { I18nKey } from "#/i18n/declaration";
import { CORS_OR_NETWORK_ERROR_MESSAGE } from "#/utils/user-facing-error";
import { getBackendStatusLabel } from "./backend-status-label";

const t = ((key: string) => key) as TFunction<"openhands">;

describe("getBackendStatusLabel", () => {
  it("prefers add API key for Cloud backends with a blank API key", () => {
    expect(
      getBackendStatusLabel(
        t,
        { kind: "cloud", apiKey: "" },
        { isConnected: false, lastError: CORS_OR_NETWORK_ERROR_MESSAGE },
      ),
    ).toBe(I18nKey.BACKEND$STATUS_DISCONNECTED_ADD_API_KEY);
  });

  it("maps Cloud browser-network failures to API key or network guidance", () => {
    expect(
      getBackendStatusLabel(
        t,
        { kind: "cloud", apiKey: "oh-cloud-key" },
        { isConnected: false, lastError: CORS_OR_NETWORK_ERROR_MESSAGE },
      ),
    ).toBe(I18nKey.BACKEND$STATUS_DISCONNECTED_CHECK_CLOUD_ACCESS);
  });

  it("keeps local browser-network failures generic", () => {
    expect(
      getBackendStatusLabel(
        t,
        { kind: "local", apiKey: "" },
        { isConnected: false, lastError: CORS_OR_NETWORK_ERROR_MESSAGE },
      ),
    ).toBe(I18nKey.BACKEND$STATUS_DISCONNECTED_CHECK_URL_OR_NETWORK);
  });
});
