import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetActiveStoreForTests } from "#/api/backend-registry/active-store";
import {
  DEFAULT_LOCAL_BACKEND_ID,
  DEFAULT_LOCAL_BACKEND_NAME,
} from "#/api/backend-registry/default-backend";
import { MAX_CONSECUTIVE_FAILURES } from "#/api/backend-registry/health-storage";
import {
  __resetHealthStoreForTests,
  getBackendHealthEntry,
  recordBackendFailure,
} from "#/api/backend-registry/health-store";
import {
  ActiveBackendProvider,
  useActiveBackendContext,
} from "#/contexts/active-backend-context";

function makeWrapper(queryClient = new QueryClient()) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ActiveBackendProvider>{children}</ActiveBackendProvider>
      </QueryClientProvider>
    );
  }
  return Wrapper;
}

beforeEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  __resetHealthStoreForTests();
});

afterEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  __resetHealthStoreForTests();
  vi.restoreAllMocks();
});

describe("ActiveBackendProvider", () => {
  it("seeds the default local backend on first read and treats it as active", () => {
    const { result } = renderHook(() => useActiveBackendContext(), {
      wrapper: makeWrapper(),
    });

    expect(result.current.active.backend.id).toBe(DEFAULT_LOCAL_BACKEND_ID);
    expect(result.current.backends).toHaveLength(1);
    expect(result.current.backends[0]).toMatchObject({
      id: DEFAULT_LOCAL_BACKEND_ID,
      kind: "local",
    });
  });

  it("addBackend exposes new local backends alongside the seeded default", async () => {
    const { result } = renderHook(() => useActiveBackendContext(), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      await result.current.addBackend({
        name: "Local A",
        host: "http://localhost:9000",
        apiKey: "key-a",
        kind: "local",
      });
      await result.current.addBackend({
        name: "Local B",
        host: "http://localhost:9001",
        apiKey: "key-b",
        kind: "local",
      });
    });

    expect(result.current.backends.map((backend) => backend.name)).toEqual([
      DEFAULT_LOCAL_BACKEND_NAME,
      "Local A",
      "Local B",
    ]);
  });

  it("serializes concurrent backend additions", async () => {
    const { result } = renderHook(() => useActiveBackendContext(), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      await Promise.all([
        result.current.addBackend({
          name: "Local A",
          host: "http://localhost:9000",
          apiKey: "key-a",
          kind: "local",
        }),
        result.current.addBackend({
          name: "Local B",
          host: "http://localhost:9001",
          apiKey: "key-b",
          kind: "local",
        }),
      ]);
    });

    expect(result.current.backends.map((backend) => backend.name)).toEqual([
      DEFAULT_LOCAL_BACKEND_NAME,
      "Local A",
      "Local B",
    ]);
  });

  it("setActive switches the active backend without touching unrelated React Query cache entries", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["dummy"], { value: 1 });

    const { result } = renderHook(() => useActiveBackendContext(), {
      wrapper: makeWrapper(queryClient),
    });

    let added: { id: string } | null = null;
    await act(async () => {
      added = await result.current.addBackend({
        name: "Local 1",
        host: "http://localhost:9000",
        apiKey: "key-1",
        kind: "local",
      });
    });

    act(() => {
      result.current.setActive(added!.id);
    });

    expect(result.current.active.backend.id).toBe(added!.id);
    const dummyState = queryClient.getQueryState(["dummy"]);
    expect(dummyState?.isInvalidated).toBe(false);
    expect(queryClient.getQueryData(["dummy"])).toEqual({ value: 1 });
  });

  it("removeBackend falls back to the seeded default when the active backend is removed", async () => {
    const { result } = renderHook(() => useActiveBackendContext(), {
      wrapper: makeWrapper(),
    });

    let id = "";
    await act(async () => {
      id = (
        await result.current.addBackend({
          name: "Local 1",
          host: "http://localhost:9000",
          apiKey: "k",
          kind: "local",
        })
      ).id;
    });

    act(() => {
      result.current.setActive(id);
    });
    expect(result.current.active.backend.id).toBe(id);

    await act(async () => {
      await result.current.removeBackend(id);
    });
    expect(result.current.active.backend.id).toBe(DEFAULT_LOCAL_BACKEND_ID);
    expect(result.current.backends).toHaveLength(1);
    expect(result.current.backends[0].id).toBe(DEFAULT_LOCAL_BACKEND_ID);
  });

  it("removeBackend allows removing the seeded default and falls back to a synthesized env-derived backend", async () => {
    const { result } = renderHook(() => useActiveBackendContext(), {
      wrapper: makeWrapper(),
    });

    expect(result.current.backends).toHaveLength(1);

    await act(async () => {
      await result.current.removeBackend(DEFAULT_LOCAL_BACKEND_ID);
    });

    expect(result.current.backends).toEqual([]);
    expect(result.current.active.backend.id).toBe(DEFAULT_LOCAL_BACKEND_ID);
    expect(result.current.active.backend.kind).toBe("local");
  });

  it("throws if used outside the provider", () => {
    function HookConsumer() {
      useActiveBackendContext();
      return null;
    }
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<HookConsumer />)).toThrow(/ActiveBackendProvider/);
    errorSpy.mockRestore();
  });

  it("updateBackend applies multiple same-tick local updates without losing fields", async () => {
    const { result } = renderHook(() => useActiveBackendContext(), {
      wrapper: makeWrapper(),
    });

    let id = "";
    await act(async () => {
      id = (
        await result.current.addBackend({
          name: "Local",
          host: "http://localhost:9000",
          apiKey: "old-key",
          kind: "local",
        })
      ).id;
      await result.current.updateBackend(id, { name: "Renamed" });
      await result.current.updateBackend(id, { host: "http://localhost:9001" });
    });

    expect(
      result.current.backends.find((backend) => backend.id === id),
    ).toEqual(
      expect.objectContaining({
        name: "Renamed",
        host: "http://localhost:9001",
        apiKey: "old-key",
      }),
    );
  });

  it("updateBackend re-arms health polling when host or apiKey changes but leaves cosmetic edits alone", async () => {
    const { result } = renderHook(() => useActiveBackendContext(), {
      wrapper: makeWrapper(),
    });

    let id = "";
    await act(async () => {
      id = (
        await result.current.addBackend({
          name: "Stale",
          host: "http://localhost:9000",
          apiKey: "old-key",
          kind: "local",
        })
      ).id;
    });
    for (let i = 0; i < MAX_CONSECUTIVE_FAILURES; i += 1) {
      recordBackendFailure(id, new Error("timeout"));
    }
    expect(getBackendHealthEntry(id)?.disabled).toBe(true);

    await act(async () => {
      await result.current.updateBackend(id, { name: "Renamed" });
    });
    expect(getBackendHealthEntry(id)?.disabled).toBe(true);

    await act(async () => {
      await result.current.updateBackend(id, { host: "http://localhost:9001" });
    });

    expect(getBackendHealthEntry(id)).toBeNull();
  });

  it("removeBackend drops the backend's persisted health entry", async () => {
    const { result } = renderHook(() => useActiveBackendContext(), {
      wrapper: makeWrapper(),
    });
    let id = "";
    await act(async () => {
      id = (
        await result.current.addBackend({
          name: "Doomed",
          host: "http://localhost:9000",
          apiKey: "k",
          kind: "local",
        })
      ).id;
    });
    recordBackendFailure(id, new Error("boom"));
    expect(getBackendHealthEntry(id)).not.toBeNull();

    await act(async () => {
      await result.current.removeBackend(id);
    });

    expect(getBackendHealthEntry(id)).toBeNull();
  });
});
