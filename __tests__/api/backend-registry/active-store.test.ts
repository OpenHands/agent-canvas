import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetActiveStoreForTests,
  getActiveBackend,
  setActiveSelection,
  setRegisteredBackends,
  subscribeActiveBackend,
} from "#/api/backend-registry/active-store";
import { BUNDLED_BACKEND_ID } from "#/api/backend-registry/types";
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

describe("active-store", () => {
  it("falls back to the bundled backend when nothing is selected", () => {
    const { backend, orgId } = getActiveBackend();
    expect(backend.id).toBe(BUNDLED_BACKEND_ID);
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

  it("falls back to bundled when the active backend was removed", () => {
    setRegisteredBackends([cloudBackend]);
    setActiveSelection({ backendId: cloudBackend.id, orgId: null });
    setRegisteredBackends([]);

    expect(getActiveBackend().backend.id).toBe(BUNDLED_BACKEND_ID);
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
