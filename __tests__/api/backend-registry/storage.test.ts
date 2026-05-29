import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ACTIVE_BACKEND_STORAGE_KEY,
  BACKENDS_STORAGE_KEY,
  readStoredActiveBackend,
  readStoredBackends,
  writeStoredActiveBackend,
  writeStoredBackends,
} from "#/api/backend-registry/storage";
import type { Backend } from "#/api/backend-registry/types";

function stubBackendDefaults() {
  vi.stubEnv("VITE_BACKEND_BASE_URL", "http://127.0.0.1:8000");
}

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllEnvs();
});

describe("backend-registry storage", () => {
  it("round-trips a list of backends", () => {
    const backends: Backend[] = [
      {
        id: "abc",
        name: "Local 1",
        host: "http://127.0.0.1:9000",
        apiKey: "key-1",
        kind: "local",
      },
      {
        id: "xyz",
        name: "Production",
        host: "https://app.all-hands.dev",
        apiKey: "bearer-2",
        kind: "cloud",
      },
    ];

    writeStoredBackends(backends);

    expect(readStoredBackends()).toEqual(backends);
  });

  it("returns empty list when storage is malformed", () => {
    window.localStorage.setItem(BACKENDS_STORAGE_KEY, "{not-json");
    expect(readStoredBackends()).toEqual([]);
  });

  it("does not seed a default Local backend when no backend defaults are configured", () => {
    expect(window.localStorage.getItem(BACKENDS_STORAGE_KEY)).toBeNull();

    expect(readStoredBackends()).toEqual([]);
    expect(window.localStorage.getItem(BACKENDS_STORAGE_KEY)).toBeNull();
  });

  it("does not seed a default Local backend from a session key alone", () => {
    vi.stubEnv("VITE_SESSION_API_KEY", "fresh-session-key");
    expect(window.localStorage.getItem(BACKENDS_STORAGE_KEY)).toBeNull();

    expect(readStoredBackends()).toEqual([]);
    expect(window.localStorage.getItem(BACKENDS_STORAGE_KEY)).toBeNull();
  });

  it("seeds the default Local backend when storage key is missing and backend defaults are configured", () => {
    stubBackendDefaults();
    expect(window.localStorage.getItem(BACKENDS_STORAGE_KEY)).toBeNull();

    const result = readStoredBackends();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "default-local", kind: "local" });
    // Persists the seed so a subsequent read returns the same entry.
    expect(window.localStorage.getItem(BACKENDS_STORAGE_KEY)).not.toBeNull();
    expect(readStoredBackends()).toEqual(result);
  });

  it("re-seeds the default Local backend when storage holds an empty array", () => {
    stubBackendDefaults();
    window.localStorage.setItem(BACKENDS_STORAGE_KEY, JSON.stringify([]));

    const result = readStoredBackends();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "default-local", kind: "local" });
  });

  it("re-seeds the default Local backend when every stored entry is invalid", () => {
    stubBackendDefaults();
    window.localStorage.setItem(
      BACKENDS_STORAGE_KEY,
      JSON.stringify([{ kind: "cloud" }, "not-an-object"]),
    );

    const result = readStoredBackends();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "default-local", kind: "local" });
  });

  it("removes a stale auto-seeded default Local backend when backend defaults are no longer configured", () => {
    window.localStorage.setItem(
      BACKENDS_STORAGE_KEY,
      JSON.stringify([
        {
          id: "default-local",
          name: "Local",
          host: "http://127.0.0.1:8000",
          apiKey: "",
          kind: "local",
        },
      ]),
    );

    expect(readStoredBackends()).toEqual([]);
    expect(window.localStorage.getItem(BACKENDS_STORAGE_KEY)).toBe("[]");
  });

  it("keeps a stored default Local backend with a session key when backend defaults are no longer configured", () => {
    const backend = {
      id: "default-local",
      name: "Local",
      host: "http://127.0.0.1:8000",
      apiKey: "existing-session-key",
      kind: "local",
    };
    window.localStorage.setItem(BACKENDS_STORAGE_KEY, JSON.stringify([backend]));

    expect(readStoredBackends()).toEqual([backend]);
  });

  it("filters out backends with invalid shape", () => {
    window.localStorage.setItem(
      BACKENDS_STORAGE_KEY,
      JSON.stringify([
        { id: "ok", name: "x", host: "y", apiKey: "z", kind: "local" },
        { id: "missing-kind", name: "x", host: "y", apiKey: "z" },
        { kind: "cloud" },
        "not-an-object",
      ]),
    );

    expect(readStoredBackends()).toEqual([
      { id: "ok", name: "x", host: "y", apiKey: "z", kind: "local" },
    ]);
  });

  it("fills a missing API key on the default Local backend from env defaults", () => {
    stubBackendDefaults();
    vi.stubEnv("VITE_SESSION_API_KEY", "fresh-session-key");
    window.localStorage.setItem(
      BACKENDS_STORAGE_KEY,
      JSON.stringify([
        {
          id: "default-local",
          name: "Local",
          host: window.location.origin,
          apiKey: "",
          kind: "local",
        },
      ]),
    );

    const result = readStoredBackends();

    expect(result[0]).toMatchObject({
      id: "default-local",
      apiKey: "fresh-session-key",
    });
    expect(
      JSON.parse(window.localStorage.getItem(BACKENDS_STORAGE_KEY)!)[0],
    ).toMatchObject({
      id: "default-local",
      apiKey: "fresh-session-key",
    });
  });


  it("refreshes a stale API key on the default Local backend from env defaults", () => {
    stubBackendDefaults();
    vi.stubEnv("VITE_SESSION_API_KEY", "fresh-session-key");
    window.localStorage.setItem(
      BACKENDS_STORAGE_KEY,
      JSON.stringify([
        {
          id: "default-local",
          name: "Local",
          host: window.location.origin,
          apiKey: "stale-session-key",
          kind: "local",
        },
      ]),
    );

    const result = readStoredBackends();

    expect(result[0]).toMatchObject({
      id: "default-local",
      apiKey: "fresh-session-key",
    });
    expect(
      JSON.parse(window.localStorage.getItem(BACKENDS_STORAGE_KEY) ?? "[]")[0],
    ).toMatchObject({
      id: "default-local",
      apiKey: "fresh-session-key",
    });
  });

  it("does not fill the default Local backend API key after its host is edited", () => {
    vi.stubEnv("VITE_SESSION_API_KEY", "fresh-session-key");
    window.localStorage.setItem(
      BACKENDS_STORAGE_KEY,
      JSON.stringify([
        {
          id: "default-local",
          name: "Local",
          host: "http://127.0.0.1:9999",
          apiKey: "",
          kind: "local",
        },
      ]),
    );

    expect(readStoredBackends()[0]).toMatchObject({
      id: "default-local",
      host: "http://127.0.0.1:9999",
      apiKey: "",
    });
  });

  it("round-trips active selection with orgId", () => {
    writeStoredActiveBackend({ backendId: "xyz", orgId: "org-1" });
    expect(readStoredActiveBackend()).toEqual({
      backendId: "xyz",
      orgId: "org-1",
    });
  });

  it("normalizes missing orgId to null", () => {
    writeStoredActiveBackend({ backendId: "xyz" });
    expect(readStoredActiveBackend()).toEqual({
      backendId: "xyz",
      orgId: null,
    });
  });

  it("clears storage when active selection is set to null", () => {
    writeStoredActiveBackend({ backendId: "xyz", orgId: "o" });
    writeStoredActiveBackend(null);

    expect(window.localStorage.getItem(ACTIVE_BACKEND_STORAGE_KEY)).toBeNull();
    expect(readStoredActiveBackend()).toBeNull();
  });

  it("returns null active selection when storage is malformed", () => {
    window.localStorage.setItem(ACTIVE_BACKEND_STORAGE_KEY, "{broken");
    expect(readStoredActiveBackend()).toBeNull();
  });
});
