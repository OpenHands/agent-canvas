import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { useDeviceFlow } from "../../src/hooks/use-device-flow";
import { server } from "../../src/mocks/node";

interface CloudProxyRequest {
  path?: string;
}

interface DeviceAuthorizationResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

interface DeviceTokenResponse {
  access_token: string;
  token_type: string;
}

function makeAuthorizationResponse(): DeviceAuthorizationResponse {
  return {
    device_code: "device123",
    user_code: "USER-1234",
    verification_uri: "https://app.all-hands.dev/device",
    verification_uri_complete:
      "https://app.all-hands.dev/device?user_code=USER-1234",
    expires_in: 600,
    interval: 5,
  };
}

function makeTokenResponse(): DeviceTokenResponse {
  return {
    access_token: "api-key-123",
    token_type: "Bearer",
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

function mockDeviceFlowProxy({
  authorize = async () => HttpResponse.json(makeAuthorizationResponse()),
  token = async () => HttpResponse.json(makeTokenResponse()),
}: {
  authorize?: () => Promise<Response> | Response;
  token?: () => Promise<Response> | Response;
} = {}) {
  server.use(
    http.post("*/api/cloud-proxy", async ({ request }) => {
      const body = (await request.json()) as CloudProxyRequest;

      if (body.path === "/oauth/device/authorize") {
        return authorize();
      }

      if (body.path === "/oauth/device/token") {
        return token();
      }

      return HttpResponse.json({ error: "unexpected path" }, { status: 500 });
    }),
  );
}

describe("useDeviceFlow", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("initializes with idle state", () => {
    const { result } = renderHook(() => useDeviceFlow());

    expect(result.current.status).toBe("idle");
    expect(result.current.verificationUrl).toBeNull();
    expect(result.current.userCode).toBeNull();
    expect(result.current.apiKey).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("transitions through states on successful auth", async () => {
    const authResponse = makeAuthorizationResponse();
    const tokenResponse = makeTokenResponse();
    const tokenGate = deferred<Response>();
    mockDeviceFlowProxy({
      authorize: () => HttpResponse.json(authResponse),
      token: () => tokenGate.promise,
    });

    const { result } = renderHook(() => useDeviceFlow());

    act(() => {
      result.current.start("https://app.all-hands.dev");
    });

    expect(result.current.status).toBe("starting");

    await waitFor(() => {
      expect(result.current.status).toBe("awaiting_authorization");
    });
    expect(result.current.verificationUrl).toBe(
      "https://app.all-hands.dev/device?user_code=USER-1234",
    );
    expect(result.current.userCode).toBe("USER-1234");

    await act(async () => {
      tokenGate.resolve(HttpResponse.json(tokenResponse));
      await tokenGate.promise;
    });

    await waitFor(() => {
      expect(result.current.status).toBe("success");
    });
    expect(result.current.apiKey).toBe("api-key-123");
  });

  it("handles startDeviceFlow error", async () => {
    mockDeviceFlowProxy({
      authorize: () => HttpResponse.json({ error: "denied" }, { status: 403 }),
    });

    const { result } = renderHook(() => useDeviceFlow());

    act(() => {
      result.current.start("https://app.all-hands.dev");
    });

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });

    expect(result.current.error).toBe(
      "Failed to start device flow: Server returned 403",
    );
  });

  it("handles pollForToken error", async () => {
    mockDeviceFlowProxy({
      token: () =>
        HttpResponse.json({ error: "access_denied" }, { status: 400 }),
    });

    const { result } = renderHook(() => useDeviceFlow());

    act(() => {
      result.current.start("https://app.all-hands.dev");
    });

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });

    expect(result.current.error).toBe("Authorization request was denied.");
    expect(result.current.errorCode).toBe("access_denied");
  });

  it("cancels flow and resets to idle", async () => {
    mockDeviceFlowProxy({
      token: () => new Promise<Response>(() => {}),
    });

    const { result } = renderHook(() => useDeviceFlow());

    act(() => {
      result.current.start("https://app.all-hands.dev");
    });

    await waitFor(() => {
      expect(result.current.status).toBe("awaiting_authorization");
    });

    act(() => {
      result.current.cancel();
    });

    expect(result.current.status).toBe("idle");
    expect(result.current.verificationUrl).toBeNull();
  });

  it("resets to idle state", async () => {
    mockDeviceFlowProxy();

    const { result } = renderHook(() => useDeviceFlow());

    act(() => {
      result.current.start("https://app.all-hands.dev");
    });

    await waitFor(() => {
      expect(result.current.status).toBe("success");
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.status).toBe("idle");
    expect(result.current.apiKey).toBeNull();
  });

  it("cancels previous flow when starting a new one", async () => {
    mockDeviceFlowProxy({
      token: () => new Promise<Response>(() => {}),
    });

    const { result } = renderHook(() => useDeviceFlow());

    act(() => {
      result.current.start("https://app.all-hands.dev");
    });

    await waitFor(() => {
      expect(result.current.status).toBe("awaiting_authorization");
    });

    act(() => {
      result.current.start("https://staging.all-hands.dev");
    });

    expect(result.current.status).toBe("starting");
  });

  it("cleans up on unmount without state update warnings", async () => {
    mockDeviceFlowProxy({
      token: () => new Promise<Response>(() => {}),
    });

    const { result, unmount } = renderHook(() => useDeviceFlow());

    act(() => {
      result.current.start("https://app.all-hands.dev");
    });

    await waitFor(() => {
      expect(result.current.status).toBe("awaiting_authorization");
    });

    unmount();
  });
});
