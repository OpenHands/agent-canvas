import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fakePosthog = {
  identify: vi.fn(),
  reset: vi.fn(),
};
let posthogInstance: typeof fakePosthog | null = fakePosthog;

vi.mock("posthog-js/react", () => ({
  usePostHog: () => posthogInstance,
}));

const useSettingsMock = vi.fn();
vi.mock("#/hooks/query/use-settings", () => ({
  useSettings: () => useSettingsMock(),
}));

const useActiveBackendMock = vi.fn();
vi.mock("#/contexts/active-backend-context", () => ({
  useActiveBackend: () => useActiveBackendMock(),
}));

const useCloudCurrentUserIdMock = vi.fn();
vi.mock("#/hooks/query/use-cloud-current-user-id", () => ({
  useCloudCurrentUserId: () => useCloudCurrentUserIdMock(),
}));

import { usePostHogIdentify } from "#/hooks/use-posthog-identify";

const BACKEND_ID = "cloud-1";
const cloudBackend = { kind: "cloud" as const, id: BACKEND_ID };
const localBackend = { kind: "local" as const, id: "local-1" };

describe("usePostHogIdentify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    posthogInstance = fakePosthog;
    useActiveBackendMock.mockReturnValue({ backend: cloudBackend });
    useSettingsMock.mockReturnValue({
      data: { user_consents_to_analytics: true, email: "user@example.com" },
    });
    useCloudCurrentUserIdMock.mockReturnValue({
      [BACKEND_ID]: { userId: "user-123", isLoading: false },
    });
  });

  describe("no-op guards", () => {
    it("does nothing when backend is local mode", () => {
      useActiveBackendMock.mockReturnValue({ backend: localBackend });

      renderHook(() => usePostHogIdentify());

      expect(fakePosthog.identify).not.toHaveBeenCalled();
      expect(fakePosthog.reset).not.toHaveBeenCalled();
    });

    it("does nothing when posthog is not available", () => {
      posthogInstance = null;

      renderHook(() => usePostHogIdentify());

      expect(fakePosthog.identify).not.toHaveBeenCalled();
      expect(fakePosthog.reset).not.toHaveBeenCalled();
    });

    it("does nothing while settings are still loading (data === undefined)", () => {
      useSettingsMock.mockReturnValue({ data: undefined });

      renderHook(() => usePostHogIdentify());

      expect(fakePosthog.identify).not.toHaveBeenCalled();
      expect(fakePosthog.reset).not.toHaveBeenCalled();
    });

    it("does nothing when consent is null (decision not yet made)", () => {
      useSettingsMock.mockReturnValue({
        data: { user_consents_to_analytics: null, email: "user@example.com" },
      });

      renderHook(() => usePostHogIdentify());

      expect(fakePosthog.identify).not.toHaveBeenCalled();
      expect(fakePosthog.reset).not.toHaveBeenCalled();
    });

    it("does nothing when consent is true but userId has not loaded yet", () => {
      useCloudCurrentUserIdMock.mockReturnValue({
        [BACKEND_ID]: { userId: null, isLoading: true },
      });

      renderHook(() => usePostHogIdentify());

      expect(fakePosthog.identify).not.toHaveBeenCalled();
      expect(fakePosthog.reset).not.toHaveBeenCalled();
    });
  });

  describe("identify", () => {
    it("calls posthog.identify with userId and email when consent is true", () => {
      renderHook(() => usePostHogIdentify());

      expect(fakePosthog.identify).toHaveBeenCalledOnce();
      expect(fakePosthog.identify).toHaveBeenCalledWith("user-123", {
        email: "user@example.com",
      });
    });

    it("omits email from traits when settings.email is not set", () => {
      useSettingsMock.mockReturnValue({
        data: { user_consents_to_analytics: true, email: undefined },
      });

      renderHook(() => usePostHogIdentify());

      expect(fakePosthog.identify).toHaveBeenCalledWith("user-123", {
        email: undefined,
      });
    });

    it("re-identifies with updated traits when email changes", () => {
      const { rerender } = renderHook(() => usePostHogIdentify());

      expect(fakePosthog.identify).toHaveBeenCalledOnce();

      useSettingsMock.mockReturnValue({
        data: { user_consents_to_analytics: true, email: "new@example.com" },
      });
      rerender();

      expect(fakePosthog.identify).toHaveBeenCalledTimes(2);
      expect(fakePosthog.identify).toHaveBeenLastCalledWith("user-123", {
        email: "new@example.com",
      });
    });
  });

  describe("reset", () => {
    it("calls posthog.reset when consent is explicitly false", () => {
      useSettingsMock.mockReturnValue({
        data: { user_consents_to_analytics: false, email: "user@example.com" },
      });

      renderHook(() => usePostHogIdentify());

      expect(fakePosthog.reset).toHaveBeenCalledOnce();
      expect(fakePosthog.identify).not.toHaveBeenCalled();
    });

    it("calls posthog.reset when userId becomes null after a prior identify (logout)", () => {
      const { rerender } = renderHook(() => usePostHogIdentify());

      expect(fakePosthog.identify).toHaveBeenCalledOnce();

      useCloudCurrentUserIdMock.mockReturnValue({
        [BACKEND_ID]: { userId: null, isLoading: false },
      });
      rerender();

      expect(fakePosthog.reset).toHaveBeenCalledOnce();
    });

    it("does not call posthog.reset on initial render when userId is null with no prior identify", () => {
      useCloudCurrentUserIdMock.mockReturnValue({
        [BACKEND_ID]: { userId: null, isLoading: false },
      });

      renderHook(() => usePostHogIdentify());

      expect(fakePosthog.reset).not.toHaveBeenCalled();
      expect(fakePosthog.identify).not.toHaveBeenCalled();
    });

    it("calls posthog.reset when consent changes from true to false after identify", () => {
      const { rerender } = renderHook(() => usePostHogIdentify());

      expect(fakePosthog.identify).toHaveBeenCalledOnce();
      fakePosthog.identify.mockClear();

      useSettingsMock.mockReturnValue({
        data: { user_consents_to_analytics: false, email: "user@example.com" },
      });
      rerender();

      expect(fakePosthog.reset).toHaveBeenCalledOnce();
      expect(fakePosthog.identify).not.toHaveBeenCalled();
    });
  });
});
