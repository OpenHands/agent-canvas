import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import posthog from "posthog-js";
import { trackError } from "#/utils/error-handler";

vi.mock("posthog-js", () => ({
  default: {
    captureException: vi.fn(),
  },
}));

describe("Error Handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("trackError", () => {
    it("should send error to PostHog with basic info", () => {
      const error = {
        message: "Test error",
        source: "test",
        posthog,
      };

      trackError(error);

      expect(posthog.captureException).toHaveBeenCalledWith(
        new Error("Test error"),
        {
          error_source: "test",
        },
      );
    });

    it("should include additional metadata in PostHog event", () => {
      const error = {
        message: "Test error",
        source: "test",
        metadata: {
          extra: "info",
          details: { foo: "bar" },
        },
        posthog,
      };

      trackError(error);

      expect(posthog.captureException).toHaveBeenCalledWith(
        new Error("Test error"),
        {
          error_source: "test",
          extra: "info",
          details: { foo: "bar" },
        },
      );
    });
  });
});
