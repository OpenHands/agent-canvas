import axios from "axios";
import type { Mock } from "vitest";
import { vi } from "vitest";

/**
 * Shape of an "upstream request" — what tests want to assert on regardless
 * of whether `callCloudProxy` is making a direct browser call or wrapping
 * the request in an envelope POSTed to /api/cloud-proxy.
 *
 * Matches the subset of AxiosRequestConfig that existing cloud-service
 * tests care about.
 */
export interface UpstreamRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  data: unknown;
  /**
   * Mirrors AxiosRequestConfig.responseType. In the new envelope-based
   * flow, `responseType` is set on the OUTER axios.post call (the one to
   * /api/cloud-proxy) rather than on the upstream request itself. This
   * field surfaces it so tests asserting "this is a binary download"
   * remain meaningful.
   */
  responseType?: "blob";
}

/**
 * Extract the upstream request from a captured `axios.post(...)` call
 * targeted at /api/cloud-proxy. Use this in any test that wants to assert
 * on what the cloud backend was supposed to receive — without caring that
 * `callCloudProxy` wraps every upstream request in an envelope and POSTs
 * to the local agent-server's /api/cloud-proxy endpoint.
 *
 * Why this shim exists: PR #1046 collapsed `callCloudProxy` to a direct
 * `axios.request` for cloud-host calls, then a follow-up reverted that to
 * always envelope-POST through /api/cloud-proxy (CORS regression fix —
 * the cloud only allows CORS from `https://app.all-hands.dev` itself, so
 * direct browser→cloud calls fail from every other origin). Existing
 * tests were written against the direct-call shape (`axios.request.mock.
 * calls[0][0]` = AxiosRequestConfig). Rewriting all 13+ cloud-service
 * tests by hand to inspect the envelope shape would obscure what each
 * test actually asserts. This helper lets them keep asserting on
 * url/method/headers/data with one line of plumbing.
 */
export function capturedUpstreamRequest(callIndex = 0): UpstreamRequest {
  const calls = (axios.post as unknown as Mock).mock.calls;
  if (!calls[callIndex]) {
    throw new Error(
      `capturedUpstreamRequest: no axios.post call at index ${callIndex} ` +
        `(only ${calls.length} call(s) recorded). Did you forget to await ` +
        `the callCloudProxy invocation, or to mockResolvedValueOnce?`,
    );
  }
  const [proxyUrl, envelope, outerConfig] = calls[callIndex] as [
    string,
    {
      host: string;
      method: string;
      path: string;
      headers: Record<string, string>;
      body: unknown;
    },
    { responseType?: "blob" } | undefined,
  ];
  // Sanity check: every envelope must target /api/cloud-proxy.
  // If a test accidentally captures a non-proxy axios.post call, fail
  // loudly so the failure message points at the real culprit.
  if (!proxyUrl.endsWith("/api/cloud-proxy")) {
    throw new Error(
      `capturedUpstreamRequest: expected axios.post[${callIndex}] to target ` +
        `/api/cloud-proxy, got "${proxyUrl}". This helper only adapts ` +
        `cloud-proxy envelopes.`,
    );
  }
  return {
    url: `${envelope.host.replace(/\/+$/, "")}${envelope.path}`,
    method: envelope.method,
    headers: envelope.headers,
    data: envelope.body,
    ...(outerConfig?.responseType
      ? { responseType: outerConfig.responseType }
      : {}),
  };
}

/**
 * Stub the next `callCloudProxy` invocation to resolve with the given
 * upstream response body. Pair with `capturedUpstreamRequest()` to fully
 * abstract over the cloud-proxy envelope plumbing.
 */
export function mockUpstreamResponse(responseBody: unknown): void {
  vi.mocked(axios.post).mockResolvedValueOnce({ data: responseBody });
}

/**
 * Stub the next `callCloudProxy` invocation to reject. The error is
 * thrown out of `callCloudProxy` unchanged — most service-layer code
 * either rethrows or maps it to a domain error.
 */
export function mockUpstreamFailure(err: unknown): void {
  vi.mocked(axios.post).mockRejectedValueOnce(err);
}

/**
 * Convenience: reset the axios.post mock between tests. Equivalent to
 * `vi.mocked(axios.post).mockReset()` but spelled in a way that reads at
 * the call site as "reset the cloud-proxy plumbing".
 */
export function resetCloudProxyMock(): void {
  vi.mocked(axios.post).mockReset();
}
