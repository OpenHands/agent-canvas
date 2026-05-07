import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTelemetry } from "#/hooks/use-telemetry";

describe("useTelemetry", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    // Mock fetch to prevent actual network calls
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 200 }),
    );
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

  it("grants consent and enables telemetry", () => {
    const { result } = renderHook(() => useTelemetry());

    act(() => {
      result.current.grantConsent();
    });

    expect(result.current.consent).toBe("granted");
    expect(result.current.isEnabled).toBe(true);
    expect(result.current.showConsentPrompt).toBe(false);
    expect(localStorage.getItem("openhands-telemetry-consent")).toBe("granted");
  });

  it("denies consent and disables telemetry", () => {
    const { result } = renderHook(() => useTelemetry());

    act(() => {
      result.current.denyConsent();
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

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("track function sends event when consent is granted", async () => {
    localStorage.setItem("openhands-telemetry-consent", "granted");

    const { result } = renderHook(() => useTelemetry());

    await act(async () => {
      result.current.track("test_event", { foo: "bar" });
      // Wait for async operation
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it("clearData resets consent to pending", () => {
    const { result } = renderHook(() => useTelemetry());

    act(() => {
      result.current.grantConsent();
    });

    expect(result.current.consent).toBe("granted");

    act(() => {
      result.current.clearData();
    });

    expect(result.current.consent).toBe("pending");
    expect(result.current.showConsentPrompt).toBe(true);
  });
});
