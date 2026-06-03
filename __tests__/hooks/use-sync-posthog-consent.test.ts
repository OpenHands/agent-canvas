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
  });

  it("calls opt-out when user_consents_to_analytics is null", () => {
    useSettingsMock.mockReturnValue({
      data: { user_consents_to_analytics: null },
    });

    renderHook(() => useSyncPostHogConsent());

    expect(handleCaptureConsentMock).toHaveBeenCalledWith(fakePosthog, false);
  });

  it("calls opt-out when user_consents_to_analytics is false", () => {
    useSettingsMock.mockReturnValue({
      data: { user_consents_to_analytics: false },
    });

    renderHook(() => useSyncPostHogConsent());

    expect(handleCaptureConsentMock).toHaveBeenCalledWith(fakePosthog, false);
  });

  it("calls opt-in when user_consents_to_analytics is true", () => {
    useSettingsMock.mockReturnValue({
      data: { user_consents_to_analytics: true },
    });

    renderHook(() => useSyncPostHogConsent());

    expect(handleCaptureConsentMock).toHaveBeenCalledWith(fakePosthog, true);
  });

  it("does nothing while settings are still loading (data === undefined)", () => {
    useSettingsMock.mockReturnValue({ data: undefined });

    renderHook(() => useSyncPostHogConsent());

    expect(handleCaptureConsentMock).not.toHaveBeenCalled();
  });

  it("does nothing when posthog is not yet available", () => {
    usePostHogMock.mockReturnValue(null);
    useSettingsMock.mockReturnValue({
      data: { user_consents_to_analytics: true },
    });

    renderHook(() => useSyncPostHogConsent());

    expect(handleCaptureConsentMock).not.toHaveBeenCalled();
  });

  it("re-syncs when settings update from null to true (consent granted after load)", () => {
    useSettingsMock.mockReturnValue({
      data: { user_consents_to_analytics: null },
    });

    const { rerender } = renderHook(() => useSyncPostHogConsent());

    expect(handleCaptureConsentMock).toHaveBeenCalledWith(fakePosthog, false);
    handleCaptureConsentMock.mockClear();

    useSettingsMock.mockReturnValue({
      data: { user_consents_to_analytics: true },
    });
    rerender();

    expect(handleCaptureConsentMock).toHaveBeenCalledWith(fakePosthog, true);
  });

  it("re-syncs when settings update from true to false (consent revoked)", () => {
    useSettingsMock.mockReturnValue({
      data: { user_consents_to_analytics: true },
    });

    const { rerender } = renderHook(() => useSyncPostHogConsent());

    handleCaptureConsentMock.mockClear();

    useSettingsMock.mockReturnValue({
      data: { user_consents_to_analytics: false },
    });
    rerender();

    expect(handleCaptureConsentMock).toHaveBeenCalledWith(fakePosthog, false);
  });
});
