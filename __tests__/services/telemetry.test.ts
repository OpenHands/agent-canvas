import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// Mock posthog-js before importing telemetry service
const mockPosthog = {
  init: vi.fn(),
  capture: vi.fn(),
  opt_in_capturing: vi.fn(),
  opt_out_capturing: vi.fn(),
  has_opted_out_capturing: vi.fn(() => false),
  reset: vi.fn(),
  register: vi.fn(),
};
mockPosthog.init.mockReturnValue(mockPosthog);

vi.mock("posthog-js", () => ({
  default: mockPosthog,
}));

import {
  getTelemetryConsent,
  setTelemetryConsent,
  isTelemetryEnabled,
  trackInstall,
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
    sessionStorage.clear();
    // Reset mock
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  describe("PostHog ownership", () => {
    it("uses an isolated named client for Canvas consent and events", async () => {
      await setTelemetryConsent("granted");

      expect(mockPosthog.init).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          api_host: expect.any(String),
          ui_host: expect.any(String),
          persistence_name: "agent-canvas",
          consent_persistence_name: "agent-canvas-consent",
        }),
        "agent-canvas",
      );
      expect(mockPosthog.opt_in_capturing).toHaveBeenCalled();
    });
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
    it("stores granted consent in localStorage", async () => {
      await setTelemetryConsent("granted");
      expect(localStorage.getItem("openhands-telemetry-consent")).toBe(
        "granted",
      );
    });

    it("stores denied consent in localStorage", async () => {
      await setTelemetryConsent("denied");
      expect(localStorage.getItem("openhands-telemetry-consent")).toBe(
        "denied",
      );
    });
  });

  describe("isTelemetryEnabled", () => {
    it("returns false when consent is pending", () => {
      expect(isTelemetryEnabled()).toBe(false);
    });

    it("returns true when consent is granted", async () => {
      await setTelemetryConsent("granted");
      expect(isTelemetryEnabled()).toBe(true);
    });

    it("returns false when consent is denied", async () => {
      await setTelemetryConsent("denied");
      expect(isTelemetryEnabled()).toBe(false);
    });
  });

  describe("trackInstall", () => {
    it("sends install event immediately without consent (new behavior)", async () => {
      // No consent set - should still send the install event
      await trackInstall();

      expect(mockPosthog.capture).toHaveBeenCalledTimes(1);
      expect(mockPosthog.capture).toHaveBeenCalledWith(
        "canvas_install",
        expect.objectContaining({
          platform: expect.any(String),
          user_agent: expect.any(String),
        }),
      );
    });

    it("only sends install event once", async () => {
      await trackInstall();
      await trackInstall();
      await trackInstall();

      // Should only be called once
      expect(mockPosthog.capture).toHaveBeenCalledTimes(1);
    });

    it("includes correct event data", async () => {
      await trackInstall();

      expect(mockPosthog.capture).toHaveBeenCalledWith(
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

    it("restores opt-out state after sending install event when consent not granted", async () => {
      // No consent set
      await trackInstall();

      // Should opt out capturing after sending install event
      expect(mockPosthog.opt_out_capturing).toHaveBeenCalled();
    });

    it("does not restore opt-out state when consent is granted", async () => {
      // Grant consent first
      await setTelemetryConsent("granted");
      vi.clearAllMocks(); // Clear the opt_in call from setTelemetryConsent

      await trackInstall();

      // Should NOT call opt_out_capturing when consent is granted
      expect(mockPosthog.opt_out_capturing).not.toHaveBeenCalled();
    });
  });

  describe("trackEvent", () => {
    it("does not send event when consent is not granted", async () => {
      await trackEvent("test_event", { foo: "bar" });
      expect(mockPosthog.capture).not.toHaveBeenCalled();
    });

    it("sends custom event when consent is granted", async () => {
      await setTelemetryConsent("granted");
      await trackEvent("custom_action", { button: "submit" });

      expect(mockPosthog.capture).toHaveBeenCalledWith("custom_action", {
        button: "submit",
      });
    });
  });

  describe("clearTelemetryData", () => {
    it("clears all telemetry data from localStorage", async () => {
      await setTelemetryConsent("granted");
      localStorage.setItem("openhands-telemetry-first-use", "true");

      await clearTelemetryData();

      expect(localStorage.getItem("openhands-telemetry-consent")).toBeNull();
      expect(localStorage.getItem("openhands-telemetry-first-use")).toBeNull();
    });
  });

  describe("PostHog integration", () => {
    it("calls opt_in_capturing when consent is granted", async () => {
      await setTelemetryConsent("granted");
      expect(mockPosthog.opt_in_capturing).toHaveBeenCalled();
    });

    it("calls opt_out_capturing when consent is denied", async () => {
      await setTelemetryConsent("denied");
      expect(mockPosthog.opt_out_capturing).toHaveBeenCalled();
    });
  });
});
