import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  startDeviceFlow,
  pollForToken,
  isOpenHandsCloudHost,
  DeviceFlowError,
} from "../../src/api/device-flow-client";

// Mock the backend registry to avoid import issues
vi.mock("../../src/api/backend-registry/active-store", () => ({
  getEffectiveLocalBackend: () => ({
    host: "http://localhost:18000",
    apiKey: "test-api-key",
  }),
}));

vi.mock("../../src/api/backend-registry/auth", () => ({
  buildAuthHeaders: () => ({ "X-Session-API-Key": "test-api-key" }),
}));

const TEST_HOST_URL = "https://app.all-hands.dev";

describe("device-flow-client", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("isOpenHandsCloudHost", () => {
    it("returns true for all-hands.dev domains", () => {
      expect(isOpenHandsCloudHost("https://app.all-hands.dev")).toBe(true);
      expect(isOpenHandsCloudHost("https://staging.all-hands.dev")).toBe(true);
      expect(isOpenHandsCloudHost("app.all-hands.dev")).toBe(true);
      expect(isOpenHandsCloudHost("ALL-HANDS.DEV")).toBe(true);
      expect(isOpenHandsCloudHost("all-hands.dev")).toBe(true);
    });

    it("returns true for openhands.dev domains", () => {
      expect(isOpenHandsCloudHost("https://app.openhands.dev")).toBe(true);
      expect(isOpenHandsCloudHost("openhands.dev")).toBe(true);
    });

    it("returns false for other domains", () => {
      expect(isOpenHandsCloudHost("https://localhost:8000")).toBe(false);
      expect(isOpenHandsCloudHost("http://127.0.0.1")).toBe(false);
      expect(isOpenHandsCloudHost("https://example.com")).toBe(false);
      expect(isOpenHandsCloudHost("https://my-openhands-server.com")).toBe(
        false,
      );
    });

    it("prevents substring matching attacks", () => {
      // These should NOT be treated as trusted hosts
      expect(isOpenHandsCloudHost("https://all-hands.dev.evil.com")).toBe(
        false,
      );
      expect(isOpenHandsCloudHost("https://malicious-all-hands.dev")).toBe(
        false,
      );
      expect(isOpenHandsCloudHost("https://evil.com/all-hands.dev")).toBe(
        false,
      );
    });

    it("returns false for invalid URLs", () => {
      expect(isOpenHandsCloudHost("")).toBe(false);
      expect(isOpenHandsCloudHost("not-a-url")).toBe(false);
    });
  });

  describe("startDeviceFlow", () => {
    it("returns device authorization response on success", async () => {
      const mockResponse = {
        device_code: "device123",
        user_code: "USER-1234",
        verification_uri: `${TEST_HOST_URL}/device`,
        verification_uri_complete: `${TEST_HOST_URL}/device?user_code=USER-1234`,
        expires_in: 600,
        interval: 5,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await startDeviceFlow(TEST_HOST_URL);

      expect(result).toEqual(mockResponse);
      // Should call the local proxy endpoint
      expect(fetch).toHaveBeenCalledWith(
        "http://localhost:18000/api/cloud-proxy",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            "X-Session-API-Key": "test-api-key",
          }),
        }),
      );
    });

    it("normalizes host URL by removing trailing slashes", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            device_code: "dc",
            user_code: "uc",
            verification_uri: "v",
            verification_uri_complete: "vc",
            expires_in: 600,
            interval: 5,
          }),
      });

      await startDeviceFlow(`${TEST_HOST_URL}///`);

      // Verify the proxy body contains the normalized host
      const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.host).toBe(TEST_HOST_URL);
    });

    it("throws DeviceFlowError on HTTP error", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal Server Error"),
      });

      await expect(startDeviceFlow(TEST_HOST_URL)).rejects.toThrow(
        DeviceFlowError,
      );
      await expect(startDeviceFlow(TEST_HOST_URL)).rejects.toThrow(
        /Failed to start device flow.*500/,
      );
    });

    it("throws DeviceFlowError on missing required fields", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            device_code: "dc",
            // Missing other required fields
          }),
      });

      await expect(startDeviceFlow(TEST_HOST_URL)).rejects.toThrow(
        DeviceFlowError,
      );
      await expect(startDeviceFlow(TEST_HOST_URL)).rejects.toThrow(
        /missing required fields/,
      );
    });

    it("throws DeviceFlowError on network error", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network failed"));

      await expect(startDeviceFlow(TEST_HOST_URL)).rejects.toThrow(
        DeviceFlowError,
      );
      await expect(startDeviceFlow(TEST_HOST_URL)).rejects.toThrow(
        /Network failed/,
      );
    });
  });

  describe("pollForToken", () => {
    it("returns token response on immediate success", async () => {
      const mockTokenResponse = {
        access_token: "api-key-123",
        token_type: "Bearer",
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockTokenResponse),
      });

      const result = await pollForToken(TEST_HOST_URL, "device123", {
        interval: 5,
      });

      expect(result).toEqual(mockTokenResponse);
      // Should call the local proxy endpoint
      expect(fetch).toHaveBeenCalledWith(
        "http://localhost:18000/api/cloud-proxy",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            "X-Session-API-Key": "test-api-key",
          }),
        }),
      );
    });

    it("polls until authorization is complete", async () => {
      const pendingResponse = {
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: "authorization_pending",
            error_description: "User hasn't authorized yet",
          }),
      };
      const successResponse = {
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            access_token: "api-key-123",
            token_type: "Bearer",
          }),
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(pendingResponse)
        .mockResolvedValueOnce(successResponse);

      const pollPromise = pollForToken(TEST_HOST_URL, "device123", {
        interval: 1,
      });

      // Advance past the first poll interval
      await vi.advanceTimersByTimeAsync(1000);

      const result = await pollPromise;
      expect(result.access_token).toBe("api-key-123");
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("increases interval on slow_down error", async () => {
      const slowDownResponse = {
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: "slow_down",
            interval: 10,
          }),
      };
      const successResponse = {
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            access_token: "api-key-123",
            token_type: "Bearer",
          }),
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(slowDownResponse)
        .mockResolvedValueOnce(successResponse);

      const pollPromise = pollForToken(TEST_HOST_URL, "device123", {
        interval: 5,
      });

      // Advance by new interval (10 seconds)
      await vi.advanceTimersByTimeAsync(10000);

      const result = await pollPromise;
      expect(result.access_token).toBe("api-key-123");
    });

    it("throws on expired_token error", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: "expired_token",
          }),
      });

      await expect(
        pollForToken(TEST_HOST_URL, "device123", { interval: 1 }),
      ).rejects.toThrow(DeviceFlowError);
      await expect(
        pollForToken(TEST_HOST_URL, "device123", { interval: 1 }),
      ).rejects.toThrow(/expired/i);
    });

    it("throws on access_denied error", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: "access_denied",
          }),
      });

      await expect(
        pollForToken(TEST_HOST_URL, "device123", { interval: 1 }),
      ).rejects.toThrow(DeviceFlowError);
      await expect(
        pollForToken(TEST_HOST_URL, "device123", { interval: 1 }),
      ).rejects.toThrow(/denied/i);
    });

    it("respects abort signal", async () => {
      vi.useRealTimers(); // Use real timers for this test
      const controller = new AbortController();

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: "authorization_pending",
          }),
      });

      // Pre-abort the controller
      controller.abort();

      // Now the promise should reject immediately with cancelled
      await expect(
        pollForToken(TEST_HOST_URL, "device123", {
          interval: 1,
          signal: controller.signal,
        }),
      ).rejects.toThrow(/cancelled/i);
    });

    it("times out after specified duration", async () => {
      vi.useRealTimers(); // Use real timers for this test
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: "authorization_pending",
          }),
      });

      // Use very short timeout
      await expect(
        pollForToken(TEST_HOST_URL, "device123", {
          interval: 0.01, // 10ms interval
          timeout: 50, // 50ms timeout
        }),
      ).rejects.toThrow(/timeout/i);
    }, 10000);
  });
});
