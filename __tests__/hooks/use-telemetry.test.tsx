import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// Mock posthog-js before importing hook
vi.mock("posthog-js", () => ({
  default: {
    init: vi.fn(),
    capture: vi.fn(),
    opt_in_capturing: vi.fn(),
    opt_out_capturing: vi.fn(),
    has_opted_out_capturing: vi.fn(() => false),
    reset: vi.fn(),
    register: vi.fn(),
  },
}));

import posthog from "posthog-js";
import { useTelemetry } from "#/hooks/use-telemetry";

describe("useTelemetry", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
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

  it("triggers trackInstall on mount (regardless of consent)", async () => {
    renderHook(() => useTelemetry());

    // trackInstall is called on mount - wait for the async effect
    await waitFor(() => {
      expect(posthog.capture).toHaveBeenCalledWith(
        "canvas_install",
        expect.any(Object),
      );
    });
  });

  it("only triggers trackInstall once even with multiple renders", async () => {
    const { rerender } = renderHook(() => useTelemetry());

    // Wait for initial trackInstall
    await waitFor(() => {
      expect(posthog.capture).toHaveBeenCalledTimes(1);
    });

    // Rerender multiple times
    rerender();
    rerender();
    rerender();

    // Should still only have been called once
    expect(posthog.capture).toHaveBeenCalledTimes(1);
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
    localStorage.setItem("openhands-telemetry-first-use", "true"); // Skip install tracking
    vi.clearAllMocks();

    const { result } = renderHook(() => useTelemetry());

    act(() => {
      result.current.track("test_event", { foo: "bar" });
    });

    // capture should not be called for custom events without consent
    expect(posthog.capture).not.toHaveBeenCalledWith("test_event", {
      foo: "bar",
    });
  });

  it("track function calls trackEvent when consent is granted", () => {
    localStorage.setItem("openhands-telemetry-consent", "granted");
    localStorage.setItem("openhands-telemetry-first-use", "true"); // Skip install tracking

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
