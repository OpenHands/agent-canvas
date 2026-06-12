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

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
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

  it("does not seed the default Local backend when launcher details are missing", () => {
    vi.stubEnv("VITE_SESSION_API_KEY", "");
    expect(window.localStorage.getItem(BACKENDS_STORAGE_KEY)).toBeNull();

    expect(readStoredBackends()).toEqual([]);
    expect(window.localStorage.getItem(BACKENDS_STORAGE_KEY)).toBeNull();
  });

  it("seeds the default Local backend when host and API key are available", () => {
    vi.stubEnv("VITE_BACKEND_BASE_URL", "http://localhost:9000");
    vi.stubEnv("VITE_SESSION_API_KEY", "fresh-session-key");

    const result = readStoredBackends();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "default-local",
      host: "http://localhost:9000",
      apiKey: "fresh-session-key",
      kind: "local",
    });
    expect(window.localStorage.getItem(BACKENDS_STORAGE_KEY)).not.toBeNull();
    expect(readStoredBackends()).toEqual(result);
  });

  it("migrates legacy agent-server config into the backend registry on first read", () => {
    window.localStorage.setItem(
      "openhands-agent-server-config",
      JSON.stringify({
        baseUrl: "localhost:18000/",
        sessionApiKey: "legacy-session-key",
      }),
    );

    const result = readStoredBackends();

    expect(result).toEqual([
      {
        id: "default-local",
        name: "Local",
        host: "http://localhost:18000",
        apiKey: "legacy-session-key",
        kind: "local",
      },
    ]);
    expect(window.localStorage.getItem(BACKENDS_STORAGE_KEY)).not.toBeNull();
    expect(
      window.localStorage.getItem("openhands-agent-server-config"),
    ).toBeNull();
  });

  it("re-seeds the default Local backend when storage holds an empty array and launcher details are available", () => {
    vi.stubEnv("VITE_BACKEND_BASE_URL", "http://localhost:9000");
    vi.stubEnv("VITE_SESSION_API_KEY", "fresh-session-key");
    window.localStorage.setItem(BACKENDS_STORAGE_KEY, JSON.stringify([]));

    const result = readStoredBackends();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "default-local", kind: "local" });
  });

  it("re-seeds the default Local backend when every stored entry is invalid and launcher details are available", () => {
    vi.stubEnv("VITE_BACKEND_BASE_URL", "http://localhost:9000");
    vi.stubEnv("VITE_SESSION_API_KEY", "fresh-session-key");
    window.localStorage.setItem(
      BACKENDS_STORAGE_KEY,
      JSON.stringify([{ kind: "cloud" }, "not-an-object"]),
    );

    const result = readStoredBackends();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "default-local", kind: "local" });
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

  it("preserves stored backends without API keys", () => {
    vi.stubEnv("VITE_SESSION_API_KEY", "");
    const storedBackend: Backend = {
      id: "default-local",
      name: "Local",
      host: window.location.origin,
      apiKey: "",
      kind: "local",
    };
    window.localStorage.setItem(
      BACKENDS_STORAGE_KEY,
      JSON.stringify([storedBackend]),
    );

    expect(readStoredBackends()).toEqual([storedBackend]);
  });

  it("syncs a stale default Local API key from env defaults", () => {
    vi.stubEnv("VITE_SESSION_API_KEY", "fresh-session-key");
    window.localStorage.setItem(
      BACKENDS_STORAGE_KEY,
      JSON.stringify([
        {
          id: "default-local",
          name: "Local",
          host: window.location.origin,
          apiKey: "stored-session-key",
          kind: "local",
        },
      ]),
    );

    expect(readStoredBackends()[0]).toMatchObject({
      id: "default-local",
      apiKey: "fresh-session-key",
    });
  });

  it("syncs a stale default Local API key across localhost and 127.0.0.1", () => {
    vi.stubEnv("VITE_BACKEND_BASE_URL", "http://127.0.0.1:8000");
    vi.stubEnv("VITE_SESSION_API_KEY", "fresh-session-key");
    window.localStorage.setItem(
      BACKENDS_STORAGE_KEY,
      JSON.stringify([
        {
          id: "default-local",
          name: "Local",
          host: "http://localhost:8000",
          apiKey: "stored-session-key",
          kind: "local",
        },
      ]),
    );

    expect(readStoredBackends()[0]).toMatchObject({
      id: "default-local",
      host: "http://localhost:8000",
      apiKey: "fresh-session-key",
    });
  });

  it("preserves a custom backend API key instead of syncing from env defaults", () => {
    vi.stubEnv("VITE_SESSION_API_KEY", "fresh-session-key");
    const storedBackend: Backend = {
      id: "custom-local",
      name: "Custom Local",
      host: window.location.origin,
      apiKey: "stored-session-key",
      kind: "local",
    };
    window.localStorage.setItem(
      BACKENDS_STORAGE_KEY,
      JSON.stringify([storedBackend]),
    );

    expect(readStoredBackends()[0]).toMatchObject({
      id: "custom-local",
      apiKey: "stored-session-key",
    });
  });

  it("preserves a user-edited non-loopback default Local backend API key", () => {
    vi.stubEnv("VITE_SESSION_API_KEY", "fresh-session-key");
    const storedBackend: Backend = {
      id: "default-local",
      name: "Edited Local",
      host: "https://example.com",
      apiKey: "stored-session-key",
      kind: "local",
    };
    window.localStorage.setItem(
      BACKENDS_STORAGE_KEY,
      JSON.stringify([storedBackend]),
    );

    expect(readStoredBackends()[0]).toMatchObject({
      id: "default-local",
      host: "https://example.com",
      apiKey: "stored-session-key",
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

  it("prefers the tab-scoped active selection over the global fallback", () => {
    window.localStorage.setItem(
      ACTIVE_BACKEND_STORAGE_KEY,
      JSON.stringify({ backendId: "global-backend", orgId: null }),
    );
    window.sessionStorage.setItem(
      ACTIVE_BACKEND_STORAGE_KEY,
      JSON.stringify({ backendId: "tab-backend", orgId: "org-1" }),
    );

    expect(readStoredActiveBackend()).toEqual({
      backendId: "tab-backend",
      orgId: "org-1",
    });
  });

  it("falls back to the global active selection for new tabs", () => {
    window.localStorage.setItem(
      ACTIVE_BACKEND_STORAGE_KEY,
      JSON.stringify({ backendId: "global-backend", orgId: null }),
    );

    expect(readStoredActiveBackend()).toEqual({
      backendId: "global-backend",
      orgId: null,
    });
  });

  it("clears storage when active selection is set to null", () => {
    writeStoredActiveBackend({ backendId: "xyz", orgId: "o" });
    writeStoredActiveBackend(null);

    expect(
      window.sessionStorage.getItem(ACTIVE_BACKEND_STORAGE_KEY),
    ).toBeNull();
    expect(window.localStorage.getItem(ACTIVE_BACKEND_STORAGE_KEY)).toBeNull();
    expect(readStoredActiveBackend()).toBeNull();
  });

  it("returns null active selection when storage is malformed", () => {
    window.localStorage.setItem(ACTIVE_BACKEND_STORAGE_KEY, "{broken");
    expect(readStoredActiveBackend()).toBeNull();
  });

  describe("deployment default backends", () => {
    type MutableWindow = Record<string, unknown>;

    function setDeploymentBackends(value: unknown): void {
      (window as unknown as MutableWindow).__AGENT_CANVAS_DEFAULT_BACKENDS__ =
        value;
    }

    afterEach(() => {
      delete (window as unknown as MutableWindow)
        .__AGENT_CANVAS_DEFAULT_BACKENDS__;
    });

    it("seeds deployment defaults on first read even without a launcher local backend", () => {
      vi.stubEnv("VITE_SESSION_API_KEY", "");
      setDeploymentBackends([
        { host: "http://10.0.0.5:8000", apiKey: "fleet-key", name: "Fleet A" },
      ]);

      const result = readStoredBackends();

      expect(result).toEqual([
        {
          id: "deployment:http://10.0.0.5:8000",
          name: "Fleet A",
          host: "http://10.0.0.5:8000",
          apiKey: "fleet-key",
          kind: "local",
        },
      ]);
      // Persisted so the rest of the app sees the same registry.
      expect(window.localStorage.getItem(BACKENDS_STORAGE_KEY)).not.toBeNull();
    });

    it("merges deployment defaults into an existing registry and persists", () => {
      const existing: Backend = {
        id: "user-1",
        name: "My Box",
        host: "http://192.168.1.50:8000",
        apiKey: "user-key",
        kind: "local",
      };
      window.localStorage.setItem(
        BACKENDS_STORAGE_KEY,
        JSON.stringify([existing]),
      );
      setDeploymentBackends([
        { host: "http://10.0.0.5:8000", apiKey: "fleet-key", name: "Fleet A" },
      ]);

      const result = readStoredBackends();

      expect(result.map((b) => b.host)).toEqual([
        "http://192.168.1.50:8000",
        "http://10.0.0.5:8000",
      ]);
      const persisted = JSON.parse(
        window.localStorage.getItem(BACKENDS_STORAGE_KEY) as string,
      );
      expect(persisted.map((b: Backend) => b.host)).toEqual([
        "http://192.168.1.50:8000",
        "http://10.0.0.5:8000",
      ]);
    });

    it("does not duplicate a deployment default whose host is already registered", () => {
      const existing: Backend = {
        id: "user-edited",
        name: "Renamed Fleet A",
        host: "http://10.0.0.5:8000",
        apiKey: "user-key",
        kind: "local",
      };
      window.localStorage.setItem(
        BACKENDS_STORAGE_KEY,
        JSON.stringify([existing]),
      );
      setDeploymentBackends([
        { host: "http://10.0.0.5:8000", apiKey: "fleet-key", name: "Fleet A" },
      ]);

      // User's own entry (name + key) is preserved, no duplicate added.
      expect(readStoredBackends()).toEqual([existing]);
    });
  });
});
