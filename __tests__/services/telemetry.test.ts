import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  getTelemetryConsent,
  setTelemetryConsent,
  isTelemetryEnabled,
  trackFirstUse,
  trackEvent,
  clearTelemetryData,
} from "#/services/telemetry";

// Mock import.meta.env for tests
vi.stubGlobal("import.meta", {
  env: {
    DEV: false,
    VITE_DO_NOT_TRACK: undefined,
  },
});

describe("Telemetry Service", () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    // Reset fetch mock
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe("getTelemetryConsent", () => {
    it("returns 'pending' when no consent has been set", () => {
      expect(getTelemetryConsent()).toBe("pending");
    });

    it("returns 'granted' when consent is granted", () => {
      localStorage.setItem("openhands-telemetry-consent", "granted");
      expect(getTelemetryConsent()).toBe("granted");
    });

    it("returns 'denied' when consent is denied", () => {
      localStorage.setItem("openhands-telemetry-consent", "denied");
      expect(getTelemetryConsent()).toBe("denied");
    });
  });

  describe("setTelemetryConsent", () => {
    it("stores granted consent in localStorage", () => {
      setTelemetryConsent("granted");
      expect(localStorage.getItem("openhands-telemetry-consent")).toBe(
        "granted",
      );
    });

    it("stores denied consent in localStorage", () => {
      setTelemetryConsent("denied");
      expect(localStorage.getItem("openhands-telemetry-consent")).toBe(
        "denied",
      );
    });
  });

  describe("isTelemetryEnabled", () => {
    it("returns false when consent is pending", () => {
      expect(isTelemetryEnabled()).toBe(false);
    });

    it("returns true when consent is granted", () => {
      setTelemetryConsent("granted");
      expect(isTelemetryEnabled()).toBe(true);
    });

    it("returns false when consent is denied", () => {
      setTelemetryConsent("denied");
      expect(isTelemetryEnabled()).toBe(false);
    });
  });

  describe("trackFirstUse", () => {
    it("does not send event when consent is not granted", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      await trackFirstUse();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("sends event when consent is granted", async () => {
      setTelemetryConsent("granted");

      // Mock successful response
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(null, { status: 200 }),
      );

      await trackFirstUse();

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://us.i.posthog.com/capture",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }),
      );
    });

    it("only sends first use event once", async () => {
      setTelemetryConsent("granted");

      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(null, { status: 200 }),
      );

      await trackFirstUse();
      await trackFirstUse();
      await trackFirstUse();

      // Should only be called once
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it("includes correct event data", async () => {
      setTelemetryConsent("granted");

      let capturedBody: string | undefined;
      vi.spyOn(globalThis, "fetch").mockImplementationOnce(async (_, init) => {
        capturedBody = init?.body as string;
        return new Response(null, { status: 200 });
      });

      await trackFirstUse();

      expect(capturedBody).toBeDefined();
      const parsed = JSON.parse(capturedBody!);
      expect(parsed.event).toBe("library_first_use");
      expect(parsed.properties.package_name).toBe("@openhands/agent-canvas");
      expect(parsed.properties.package_version).toBeDefined();
    });
  });

  describe("trackEvent", () => {
    it("does not send event when consent is not granted", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      await trackEvent("test_event", { foo: "bar" });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("sends custom event when consent is granted", async () => {
      setTelemetryConsent("granted");

      let capturedBody: string | undefined;
      vi.spyOn(globalThis, "fetch").mockImplementationOnce(async (_, init) => {
        capturedBody = init?.body as string;
        return new Response(null, { status: 200 });
      });

      await trackEvent("custom_action", { button: "submit" });

      const parsed = JSON.parse(capturedBody!);
      expect(parsed.event).toBe("custom_action");
      expect(parsed.properties.button).toBe("submit");
      expect(parsed.properties.package_name).toBe("@openhands/agent-canvas");
    });
  });

  describe("clearTelemetryData", () => {
    it("clears all telemetry data from localStorage", () => {
      setTelemetryConsent("granted");
      localStorage.setItem(
        "openhands-telemetry",
        JSON.stringify({ firstUseSent: true }),
      );

      clearTelemetryData();

      expect(localStorage.getItem("openhands-telemetry-consent")).toBeNull();
      expect(localStorage.getItem("openhands-telemetry")).toBeNull();
    });
  });
});
