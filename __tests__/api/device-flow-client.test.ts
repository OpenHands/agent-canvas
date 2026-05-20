import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DeviceFlowError,
  isOpenHandsCloudHost,
  pollForToken,
  startDeviceFlow,
} from "#/api/device-flow-client";

const CLOUD_HOST = "https://app.all-hands.dev";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("isOpenHandsCloudHost", () => {
  it("matches all-hands.dev / openhands.dev subdomains and apex (case-insensitive)", () => {
    // Arrange / Act / Assert — accepted hosts.
    expect(isOpenHandsCloudHost("https://app.all-hands.dev")).toBe(true);
    expect(isOpenHandsCloudHost("https://staging.all-hands.dev")).toBe(true);
    expect(isOpenHandsCloudHost("ALL-HANDS.DEV")).toBe(true);
    expect(isOpenHandsCloudHost("openhands.dev")).toBe(true);
  });

  it("rejects unrelated, substring-attack, and invalid hosts", () => {
    // Arrange / Act / Assert — these all look superficially similar but
    // must NOT be treated as trusted OpenHands hosts.
    expect(isOpenHandsCloudHost("https://example.com")).toBe(false);
    expect(isOpenHandsCloudHost("https://all-hands.dev.evil.com")).toBe(false);
    expect(isOpenHandsCloudHost("https://malicious-all-hands.dev")).toBe(false);
    expect(isOpenHandsCloudHost("")).toBe(false);
    expect(isOpenHandsCloudHost("not-a-url")).toBe(false);
  });
});

describe("device-flow-client direct cloud calls", () => {
  it("startDeviceFlow POSTs /oauth/device/authorize directly to the cloud host", async () => {
    // Arrange
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          device_code: "device123",
          user_code: "USER-1234",
          verification_uri: `${CLOUD_HOST}/device`,
          expires_in: 600,
          interval: 5,
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    // Act
    const result = await startDeviceFlow(`${CLOUD_HOST}///`);

    // Assert — direct call to the cloud (no /api/cloud-proxy hop),
    // trailing slashes normalized, content-type set for JSON.
    expect(fetchMock).toHaveBeenCalledWith(
      `${CLOUD_HOST}/oauth/device/authorize`,
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(result.device_code).toBe("device123");
  });

  it("startDeviceFlow surfaces HTTP errors as DeviceFlowError with a sanitized message", async () => {
    // Arrange — the upstream returns 500; the client must not leak any
    // server body content.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal Server Error"),
    });
    vi.stubGlobal("fetch", fetchMock);

    // Act + Assert
    await expect(startDeviceFlow(CLOUD_HOST)).rejects.toThrow(DeviceFlowError);
    await expect(startDeviceFlow(CLOUD_HOST)).rejects.toThrow(
      /Failed to start device flow.*500/,
    );
  });

  it("startDeviceFlow rejects when required RFC 8628 fields are missing", async () => {
    // Arrange — response is technically 200 OK but is missing the required
    // user_code / verification_uri fields.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ device_code: "dc" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    // Act + Assert
    await expect(startDeviceFlow(CLOUD_HOST)).rejects.toThrow(
      /missing required fields/,
    );
  });

  it("startDeviceFlow wraps network errors in DeviceFlowError", async () => {
    // Arrange
    const fetchMock = vi.fn().mockRejectedValue(new Error("Network failed"));
    vi.stubGlobal("fetch", fetchMock);

    // Act + Assert
    await expect(startDeviceFlow(CLOUD_HOST)).rejects.toThrow(
      /Network failed/,
    );
  });

  it("pollForToken POSTs the form-encoded device_code body to the cloud's /oauth/device/token", async () => {
    // Arrange
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: "api-key-xyz",
          token_type: "Bearer",
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    // Act
    const result = await pollForToken(CLOUD_HOST, "device123", {
      interval: 5,
    });

    // Assert
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${CLOUD_HOST}/oauth/device/token`);
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/x-www-form-urlencoded",
    });
    // Body is form-encoded per RFC 8628.
    expect(String(init.body)).toContain(
      "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code",
    );
    expect(String(init.body)).toContain("device_code=device123");
    expect(result.access_token).toBe("api-key-xyz");
  });

  it("pollForToken keeps polling on authorization_pending and resolves when authorization completes", async () => {
    // Arrange — first response is the RFC 8628 "user still authorizing"
    // state, second response succeeds.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: "authorization_pending" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ access_token: "api-key-xyz", token_type: "Bearer" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    // Act
    const pollPromise = pollForToken(CLOUD_HOST, "device123", { interval: 1 });
    await vi.advanceTimersByTimeAsync(1000);
    const result = await pollPromise;

    // Assert
    expect(result.access_token).toBe("api-key-xyz");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("pollForToken honors a server-provided slow_down interval (capped at 30s)", async () => {
    // Arrange — server asks us to back off to 999_999s, which is a DoS
    // attempt; the client must cap at 30s per the RFC ceiling.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: "slow_down", interval: 999_999 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ access_token: "api-key-xyz", token_type: "Bearer" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    // Act
    const pollPromise = pollForToken(CLOUD_HOST, "device123", { interval: 5 });
    await vi.advanceTimersByTimeAsync(30_000);
    const result = await pollPromise;

    // Assert
    expect(result.access_token).toBe("api-key-xyz");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("pollForToken falls back to RFC +5s when slow_down interval is non-numeric (type confusion)", async () => {
    // Arrange — attacker sends interval: "pwned"; client must ignore it
    // and add the RFC-mandated 5 seconds to the previous interval.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: "slow_down", interval: "pwned" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ access_token: "ok", token_type: "Bearer" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    // Act — 5s start → 10s after fallback.
    const pollPromise = pollForToken(CLOUD_HOST, "device123", { interval: 5 });
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await pollPromise;

    // Assert
    expect(result.access_token).toBe("ok");
  });

  it("pollForToken throws DeviceFlowError with code 'expired_token' when the device code expires", async () => {
    // Arrange
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: "expired_token" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    // Act + Assert
    await expect(
      pollForToken(CLOUD_HOST, "device123", { interval: 1 }),
    ).rejects.toThrow(/expired/i);
  });

  it("pollForToken throws DeviceFlowError with code 'access_denied' when the user denies the request", async () => {
    // Arrange
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: "access_denied" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    // Act + Assert
    await expect(
      pollForToken(CLOUD_HOST, "device123", { interval: 1 }),
    ).rejects.toThrow(/denied/i);
  });

  it("pollForToken throws 'cancelled' when the abort signal fires before the first poll", async () => {
    // Arrange — real timers so the abort path can resolve naturally.
    vi.useRealTimers();
    const controller = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: "authorization_pending" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    controller.abort();

    // Act + Assert
    await expect(
      pollForToken(CLOUD_HOST, "device123", {
        interval: 1,
        signal: controller.signal,
      }),
    ).rejects.toThrow(/cancelled/i);
  });

  it("pollForToken throws a timeout DeviceFlowError when the deadline passes", async () => {
    // Arrange — short timeout + perpetual authorization_pending so we hit
    // the deadline.
    vi.useRealTimers();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: "authorization_pending" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    // Act + Assert
    await expect(
      pollForToken(CLOUD_HOST, "device123", { interval: 0.01, timeout: 50 }),
    ).rejects.toThrow(/timeout/i);
  }, 10_000);

  it("pollForToken survives transient network errors and retries until success", async () => {
    // Arrange — first attempt throws, second succeeds. A 10-minute flow
    // shouldn't die on a single hiccup.
    const networkError = new Error("Network failed");
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ access_token: "api-key-xyz", token_type: "Bearer" }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Act
    const pollPromise = pollForToken(CLOUD_HOST, "device123", { interval: 1 });
    await vi.advanceTimersByTimeAsync(1000);
    const result = await pollPromise;

    // Assert
    expect(result.access_token).toBe("api-key-xyz");
    expect(consoleSpy).toHaveBeenCalledWith(
      "Network error during polling, retrying:",
      networkError,
    );
    consoleSpy.mockRestore();
  });
});
