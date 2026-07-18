import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// usePostHog must be controllable per-test so use vi.hoisted.
const { usePostHogMock } = vi.hoisted(() => ({
  usePostHogMock: vi.fn(),
}));

vi.mock("posthog-js/react", () => ({
  usePostHog: usePostHogMock,
}));

const useSettingsMock = vi.fn();
vi.mock("#/hooks/query/use-settings", () => ({
  useSettings: () => useSettingsMock(),
}));

const { getTelemetryConsentMock, setTelemetryConsentMock } = vi.hoisted(() => ({
  getTelemetryConsentMock: vi.fn(),
  setTelemetryConsentMock: vi.fn(),
}));
vi.mock("#/services/telemetry", () => ({
  getTelemetryConsent: getTelemetryConsentMock,
  setTelemetryConsent: setTelemetryConsentMock,
}));

const handleCaptureConsentMock = vi.fn();
vi.mock("#/utils/handle-capture-consent", () => ({
  handleCaptureConsent: (...args: unknown[]) =>
    handleCaptureConsentMock(...args),
}));

// Import after mocks so the module sees the stubbed dependencies.
import { useSyncPostHogConsent } from "#/hooks/use-sync-posthog-consent";

const fakePosthog = { capture: vi.fn() };

describe("useSyncPostHogConsent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePostHogMock.mockReturnValue(fakePosthog);
    getTelemetryConsentMock.mockReturnValue("pending");
  });

  it("calls opt-out when user_consents_to_analytics is null and local is pending", () => {
    useSettingsMock.mockReturnValue({
      data: { user_consents_to_analytics: null },
    });
    getTelemetryConsentMock.mockReturnValue("pending");

    renderHook(() => useSyncPostHogConsent());

    expect(handleCaptureConsentMock).toHaveBeenCalledWith(fakePosthog, false);
  });

  it("calls opt-in when user_consents_to_analytics is null but local is granted", () => {
    useSettingsMock.mockReturnValue({
      data: { user_consents_to_analytics: null },
    });
    getTelemetryConsentMock.mockReturnValue("granted");

    renderHook(() => useSyncPostHogConsent());

    expect(handleCaptureConsentMock).toHaveBeenCalledWith(fakePosthog, true);
  });

  it("calls opt-out when user_consents_to_analytics is false", () => {
    useSettingsMock.mockReturnValue({
      data: { user_consents_to_analytics: false },
    });
    getTelemetryConsentMock.mockReturnValue("pending");

    renderHook(() => useSyncPostHogConsent());

    expect(setTelemetryConsentMock).toHaveBeenCalledWith("denied");
    expect(handleCaptureConsentMock).toHaveBeenCalledWith(fakePosthog, false);
  });

  it("calls opt-in when user_consents_to_analytics is true", () => {
    useSettingsMock.mockReturnValue({
      data: { user_consents_to_analytics: true },
    });
    getTelemetryConsentMock.mockReturnValue("pending");

    renderHook(() => useSyncPostHogConsent());

    expect(setTelemetryConsentMock).toHaveBeenCalledWith("granted");
    expect(handleCaptureConsentMock).toHaveBeenCalledWith(fakePosthog, true);
  });
});
