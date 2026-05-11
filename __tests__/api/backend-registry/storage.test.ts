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

const ORIGINAL_LOCATION = window.location;

function mockWindowLocation(url: string) {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: new URL(url),
  });
}

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllEnvs();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: ORIGINAL_LOCATION,
  });
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

  it("seeds the default Local backend when storage key is missing", () => {
    expect(window.localStorage.getItem(BACKENDS_STORAGE_KEY)).toBeNull();

    const result = readStoredBackends();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "default-local", kind: "local" });
    // Persists the seed so a subsequent read returns the same entry.
    expect(window.localStorage.getItem(BACKENDS_STORAGE_KEY)).not.toBeNull();
    expect(readStoredBackends()).toEqual(result);
  });

  it("migrates a stale origin-seeded Vercel default backend to an unset host", () => {
    mockWindowLocation(
      "https://agent-canvas-git-use-typescript-client-api-wrappers-openhands.vercel.app",
    );
    const staleBackend: Backend = {
      id: "default-local",
      name: "Local",
      host: window.location.origin,
      apiKey: "",
      kind: "local",
    };
    window.localStorage.setItem(
      BACKENDS_STORAGE_KEY,
      JSON.stringify([staleBackend]),
    );

    const result = readStoredBackends();

    expect(result[0]).toMatchObject({
      id: "default-local",
      host: "",
    });
    expect(
      JSON.parse(window.localStorage.getItem(BACKENDS_STORAGE_KEY) ?? "[]"),
    ).toEqual(result);
  });

  it("seeds the default Local backend from VITE_BACKEND_BASE_URL when configured", () => {
    vi.stubEnv("VITE_BACKEND_BASE_URL", "https://agent.example.com/");

    const result = readStoredBackends();

    expect(result[0]).toMatchObject({
      id: "default-local",
      host: "https://agent.example.com",
    });
  });

  it("re-seeds the default Local backend when storage holds an empty array", () => {
    window.localStorage.setItem(BACKENDS_STORAGE_KEY, JSON.stringify([]));

    const result = readStoredBackends();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "default-local", kind: "local" });
  });

  it("re-seeds the default Local backend when every stored entry is invalid", () => {
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
