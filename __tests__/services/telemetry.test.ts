import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// Mock posthog-js before importing telemetry service
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
      await trackFirstUse();
      expect(posthog.capture).not.toHaveBeenCalled();
    });

    it("sends event when consent is granted", async () => {
      setTelemetryConsent("granted");
      await trackFirstUse();

      expect(posthog.capture).toHaveBeenCalledTimes(1);
      expect(posthog.capture).toHaveBeenCalledWith(
        "canvas_install",
        expect.objectContaining({
          platform: expect.any(String),
          user_agent: expect.any(String),
        }),
      );
    });

    it("only sends first use event once", async () => {
      setTelemetryConsent("granted");

      await trackFirstUse();
      await trackFirstUse();
      await trackFirstUse();

      // Should only be called once
      expect(posthog.capture).toHaveBeenCalledTimes(1);
    });

    it("includes correct event data", async () => {
      setTelemetryConsent("granted");
      await trackFirstUse();

      expect(posthog.capture).toHaveBeenCalledWith(
        "canvas_install",
        expect.objectContaining({
          platform: expect.any(String),
          user_agent: expect.any(String),
          referrer: expect.any(String),
          url_origin: expect.any(String),
          embedded: expect.any(Boolean),
        }),
      );
    });
  });

  describe("trackEvent", () => {
    it("does not send event when consent is not granted", async () => {
      await trackEvent("test_event", { foo: "bar" });
      expect(posthog.capture).not.toHaveBeenCalled();
    });

    it("sends custom event when consent is granted", async () => {
      setTelemetryConsent("granted");
      await trackEvent("custom_action", { button: "submit" });

      expect(posthog.capture).toHaveBeenCalledWith("custom_action", {
        button: "submit",
      });
    });
  });

  describe("clearTelemetryData", () => {
    it("clears all telemetry data from localStorage", () => {
      setTelemetryConsent("granted");
      localStorage.setItem("openhands-telemetry-first-use", "true");

      clearTelemetryData();

      expect(localStorage.getItem("openhands-telemetry-consent")).toBeNull();
      expect(localStorage.getItem("openhands-telemetry-first-use")).toBeNull();
    });
  });

  describe("PostHog integration", () => {
    it("calls opt_in_capturing when consent is granted", () => {
      setTelemetryConsent("granted");
      expect(posthog.opt_in_capturing).toHaveBeenCalled();
    });

    it("calls opt_out_capturing when consent is denied", () => {
      setTelemetryConsent("denied");
      expect(posthog.opt_out_capturing).toHaveBeenCalled();
    });
  });
});
