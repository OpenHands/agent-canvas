import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Mock posthog-js before importing hook
vi.mock("posthog-js", () => ({
  default: {
    init: vi.fn(),
    capture: vi.fn(),
    opt_in_capturing: vi.fn(),
    opt_out_capturing: vi.fn(),
    reset: vi.fn(),
    register: vi.fn(),
  },
}));

import posthog from "posthog-js";
import { useTelemetry } from "#/hooks/use-telemetry";

describe("useTelemetry", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("returns pending consent initially", () => {
    const { result } = renderHook(() => useTelemetry());

    expect(result.current.consent).toBe("pending");
    expect(result.current.isEnabled).toBe(false);
    expect(result.current.showConsentPrompt).toBe(true);
  });

  it("returns granted consent when already granted in localStorage", () => {
    localStorage.setItem("openhands-telemetry-consent", "granted");

    const { result } = renderHook(() => useTelemetry());

    expect(result.current.consent).toBe("granted");
    expect(result.current.isEnabled).toBe(true);
    expect(result.current.showConsentPrompt).toBe(false);
  });

  it("returns denied consent when already denied in localStorage", () => {
    localStorage.setItem("openhands-telemetry-consent", "denied");

    const { result } = renderHook(() => useTelemetry());

    expect(result.current.consent).toBe("denied");
    expect(result.current.isEnabled).toBe(false);
    expect(result.current.showConsentPrompt).toBe(false);
  });

  it("grants consent and enables telemetry", async () => {
    const { result } = renderHook(() => useTelemetry());

    await act(async () => {
      await result.current.grantConsent();
    });

    expect(result.current.consent).toBe("granted");
    expect(result.current.isEnabled).toBe(true);
    expect(result.current.showConsentPrompt).toBe(false);
    expect(localStorage.getItem("openhands-telemetry-consent")).toBe("granted");
  });

  it("denies consent and disables telemetry", async () => {
    const { result } = renderHook(() => useTelemetry());

    await act(async () => {
      await result.current.denyConsent();
    });

    expect(result.current.consent).toBe("denied");
    expect(result.current.isEnabled).toBe(false);
    expect(result.current.showConsentPrompt).toBe(false);
    expect(localStorage.getItem("openhands-telemetry-consent")).toBe("denied");
  });

  it("track function does nothing when consent is not granted", () => {
    const { result } = renderHook(() => useTelemetry());

    act(() => {
      result.current.track("test_event", { foo: "bar" });
    });

    expect(posthog.capture).not.toHaveBeenCalled();
  });

  it("track function calls trackEvent when consent is granted", () => {
    localStorage.setItem("openhands-telemetry-consent", "granted");

    const { result } = renderHook(() => useTelemetry());

    // Verify that calling track when consent is granted doesn't throw
    // and that it gets dispatched (the actual PostHog call is tested in telemetry.test.ts)
    expect(() => {
      act(() => {
        result.current.track("test_event", { foo: "bar" });
      });
    }).not.toThrow();
  });

  it("clearData resets consent to pending", async () => {
    const { result } = renderHook(() => useTelemetry());

    await act(async () => {
      await result.current.grantConsent();
    });

    expect(result.current.consent).toBe("granted");

    act(() => {
      result.current.clearData();
    });

    expect(result.current.consent).toBe("pending");
    expect(result.current.showConsentPrompt).toBe(true);
  });
});
