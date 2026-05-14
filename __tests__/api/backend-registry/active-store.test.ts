import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetActiveStoreForTests,
  getActiveBackend,
  setActiveSelection,
  setRegisteredBackends,
  subscribeActiveBackend,
} from "#/api/backend-registry/active-store";
import { DEFAULT_LOCAL_BACKEND_ID } from "#/api/backend-registry/default-backend";
import type { Backend } from "#/api/backend-registry/types";

beforeEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
});

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllEnvs();
  __resetActiveStoreForTests();
});

const cloudBackend: Backend = {
  id: "prod",
  name: "Production",
  host: "https://app.all-hands.dev",
  apiKey: "bearer-key",
  kind: "cloud",
};

const localBackend: Backend = {
  id: "local-1",
  name: "Local 1",
  host: "http://localhost:9000",
  apiKey: "k",
  kind: "local",
};

describe("active-store", () => {
  it("seeds the registry with a default local backend on first read and uses it as the active backend", () => {
    const { backend, orgId } = getActiveBackend();
    expect(backend.id).toBe(DEFAULT_LOCAL_BACKEND_ID);
    expect(backend.kind).toBe("local");
    expect(orgId).toBeNull();
  });

  it("returns the registered backend matching the active selection", () => {
    setRegisteredBackends([cloudBackend]);
    setActiveSelection({ backendId: cloudBackend.id, orgId: "org-2" });

    const { backend, orgId } = getActiveBackend();
    expect(backend).toEqual(cloudBackend);
    expect(orgId).toBe("org-2");
  });

  it("falls back to the first local backend when the active selection points at a removed entry", () => {
    setRegisteredBackends([cloudBackend, localBackend]);
    setActiveSelection({ backendId: cloudBackend.id, orgId: null });
    setRegisteredBackends([localBackend]);

    expect(getActiveBackend().backend).toEqual(localBackend);
    expect(getActiveBackend().orgId).toBeNull();
  });

  it("falls back to a synthetic env-derived backend when the registry has no local entry", () => {
    setRegisteredBackends([cloudBackend]);
    setActiveSelection(null);

    const { backend } = getActiveBackend();
    expect(backend.kind).toBe("local");
    expect(backend.id).toBe(DEFAULT_LOCAL_BACKEND_ID);
  });

  it("notifies subscribers when selection changes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeActiveBackend(listener);

    setRegisteredBackends([cloudBackend]);
    setActiveSelection({ backendId: cloudBackend.id });

    expect(listener).toHaveBeenCalled();

    unsubscribe();
    listener.mockClear();
    setActiveSelection(null);
    expect(listener).not.toHaveBeenCalled();
  });
});
