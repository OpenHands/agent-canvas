import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useSettingsMock = vi.fn();
vi.mock("#/hooks/query/use-settings", () => ({
  useSettings: () => useSettingsMock(),
}));

const setTelemetryConsentMock = vi.fn();
vi.mock("#/services/telemetry", () => ({
  setTelemetryConsent: (...args: unknown[]) =>
    setTelemetryConsentMock(...args),
}));

// Import after mocks so the module sees the stubbed dependencies.
import { useSyncPostHogConsent } from "#/hooks/use-sync-posthog-consent";

describe("useSyncPostHogConsent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls opt-out when user_consents_to_analytics is null", () => {
    useSettingsMock.mockReturnValue({
      data: { user_consents_to_analytics: null },
    });

    renderHook(() => useSyncPostHogConsent());

    expect(setTelemetryConsentMock).toHaveBeenCalledWith("denied");
  });

  it("calls opt-out when user_consents_to_analytics is false", () => {
    useSettingsMock.mockReturnValue({
      data: { user_consents_to_analytics: false },
    });

    renderHook(() => useSyncPostHogConsent());

    expect(setTelemetryConsentMock).toHaveBeenCalledWith("denied");
  });

  it("calls opt-in when user_consents_to_analytics is true", () => {
    useSettingsMock.mockReturnValue({
      data: { user_consents_to_analytics: true },
    });

    renderHook(() => useSyncPostHogConsent());

    expect(setTelemetryConsentMock).toHaveBeenCalledWith("granted");
  });

  it("does nothing while settings are still loading (data === undefined)", () => {
    useSettingsMock.mockReturnValue({ data: undefined });

    renderHook(() => useSyncPostHogConsent());

    expect(setTelemetryConsentMock).not.toHaveBeenCalled();
  });

  it("re-syncs when settings update from null to true (consent granted after load)", () => {
    useSettingsMock.mockReturnValue({
      data: { user_consents_to_analytics: null },
    });

    const { rerender } = renderHook(() => useSyncPostHogConsent());

    expect(setTelemetryConsentMock).toHaveBeenCalledWith("denied");
    setTelemetryConsentMock.mockClear();

    useSettingsMock.mockReturnValue({
      data: { user_consents_to_analytics: true },
    });
    rerender();

    expect(setTelemetryConsentMock).toHaveBeenCalledWith("granted");
  });

  it("re-syncs when settings update from true to false (consent revoked)", () => {
    useSettingsMock.mockReturnValue({
      data: { user_consents_to_analytics: true },
    });

    const { rerender } = renderHook(() => useSyncPostHogConsent());

    setTelemetryConsentMock.mockClear();

    useSettingsMock.mockReturnValue({
      data: { user_consents_to_analytics: false },
    });
    rerender();

    expect(setTelemetryConsentMock).toHaveBeenCalledWith("denied");
  });
});
