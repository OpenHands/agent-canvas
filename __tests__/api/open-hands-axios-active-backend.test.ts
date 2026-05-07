import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openHands } from "#/api/open-hands-axios";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import type { Backend } from "#/api/backend-registry/types";

const localBackend: Backend = {
  id: "local-1",
  name: "Local 1",
  host: "http://localhost:9099",
  apiKey: "session-key-local",
  kind: "local",
};

const cloudBackend: Backend = {
  id: "prod",
  name: "Production",
  host: "https://app.all-hands.dev",
  apiKey: "bearer-token-cloud",
  kind: "cloud",
};

beforeEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
});

afterEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
});

async function runInterceptors() {
  const { AxiosHeaders } = await import("axios");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const config: any = { headers: new AxiosHeaders({}) };

  // Walk the registered request handlers; axios stores them as
  // { fulfilled, rejected } objects on the manager.
  const { handlers } = openHands.interceptors.request as unknown as {
    handlers: Array<{
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fulfilled: (c: any) => any;
    } | null>;
  };
  let next = config;
  for (const handler of handlers) {
    if (handler && typeof handler.fulfilled === "function") {
      // Interceptors are an explicit chain — each input depends on the prior
      // output, so awaiting in order is correct here.
      // eslint-disable-next-line no-await-in-loop
      next = await handler.fulfilled(next);
    }
  }
  return next;
}

describe("openHands axios — active backend interceptor", () => {
  it("rewrites baseURL + sends X-Session-API-Key for a local backend", async () => {
    setRegisteredBackends([localBackend]);
    setActiveSelection({ backendId: localBackend.id });

    const config = await runInterceptors();

    expect(config.baseURL).toBe(localBackend.host);
    expect(config.headers.get("X-Session-API-Key")).toBe(localBackend.apiKey);
    expect(config.headers.get("Authorization")).toBeFalsy();
  });

  it("falls back to the bundled local backend when active is cloud (cloud calls go via callCloudProxy)", async () => {
    setRegisteredBackends([cloudBackend]);
    setActiveSelection({ backendId: cloudBackend.id });

    const config = await runInterceptors();

    // Must NOT route default openHands traffic to the cloud host — those
    // endpoints don't exist on the SaaS and would CORS-fail. Cloud-only
    // calls use callCloudProxy directly and bypass this interceptor.
    expect(config.baseURL).not.toBe(cloudBackend.host);
    expect(config.baseURL).not.toContain("all-hands.dev");
    expect(config.headers.get("Authorization")).toBeFalsy();
  });
});
