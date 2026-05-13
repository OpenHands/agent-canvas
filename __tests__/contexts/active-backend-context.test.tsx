import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetActiveStoreForTests } from "#/api/backend-registry/active-store";
import { DEFAULT_LOCAL_BACKEND_ID } from "#/api/backend-registry/default-backend";
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

  it("addBackend persists and exposes the new backend alongside the seeded default", () => {
    const { result } = renderHook(() => useActiveBackendContext(), {
      wrapper: makeWrapper(),
    });

    act(() => {
      result.current.addBackend({
        name: "Production",
        host: "https://app.all-hands.dev",
        apiKey: "bearer-1",
        kind: "cloud",
      });
    });

    // Seed entry plus the new one.
    expect(result.current.backends).toHaveLength(2);
    expect(
      result.current.backends.find((b) => b.name === "Production"),
    ).toMatchObject({
      name: "Production",
      kind: "cloud",
    });
  });

  it("setActive switches the active backend without touching unrelated React Query cache entries", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["dummy"], { value: 1 });

    const { result } = renderHook(() => useActiveBackendContext(), {
      wrapper: makeWrapper(queryClient),
    });

    let added: { id: string } | null = null;
    act(() => {
      added = result.current.addBackend({
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
    // No blanket cache mutation: long-lived hooks include the active
    // backend identity in their query keys, so refetches happen via
    // key change rather than via an explicit invalidate from setActive.
    const dummyState = queryClient.getQueryState(["dummy"]);
    expect(dummyState?.isInvalidated).toBe(false);
    expect(queryClient.getQueryData(["dummy"])).toEqual({ value: 1 });
  });

  it("removeBackend falls back to the seeded default when the active backend is removed", () => {
    const { result } = renderHook(() => useActiveBackendContext(), {
      wrapper: makeWrapper(),
    });

    let id = "";
    act(() => {
      id = result.current.addBackend({
        name: "Local 1",
        host: "http://localhost:9000",
        apiKey: "k",
        kind: "local",
      }).id;
    });

    act(() => {
      result.current.setActive(id);
    });
    expect(result.current.active.backend.id).toBe(id);

    act(() => {
      result.current.removeBackend(id);
    });
    expect(result.current.active.backend.id).toBe(DEFAULT_LOCAL_BACKEND_ID);
    expect(result.current.backends).toHaveLength(1);
    expect(result.current.backends[0].id).toBe(DEFAULT_LOCAL_BACKEND_ID);
  });

  it("removeBackend allows removing the seeded default and falls back to a synthesized env-derived backend", () => {
    const { result } = renderHook(() => useActiveBackendContext(), {
      wrapper: makeWrapper(),
    });

    expect(result.current.backends).toHaveLength(1);

    act(() => {
      result.current.removeBackend(DEFAULT_LOCAL_BACKEND_ID);
    });

    expect(result.current.backends).toEqual([]);
    // No registered backend remains, so the active store synthesizes
    // an env-derived local backend (with the well-known default id) so
    // synchronous call sites never have to handle a null backend.
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

  it("updateBackend re-arms health polling when host or apiKey changes but leaves cosmetic edits alone", () => {
    // Arrange — register a backend that has hit the failure cap.
    const { result } = renderHook(() => useActiveBackendContext(), {
      wrapper: makeWrapper(),
    });

    let id = "";
    act(() => {
      id = result.current.addBackend({
        name: "Stale",
        host: "http://localhost:9000",
        apiKey: "old-key",
        kind: "local",
      }).id;
    });
    for (let i = 0; i < MAX_CONSECUTIVE_FAILURES; i += 1) {
      recordBackendFailure(id, new Error("timeout"));
    }
    expect(getBackendHealthEntry(id)?.disabled).toBe(true);

    // Act — renaming is cosmetic; it must NOT silently re-enable
    // polling against an unreachable backend.
    act(() => {
      result.current.updateBackend(id, { name: "Renamed" });
    });
    expect(getBackendHealthEntry(id)?.disabled).toBe(true);

    // Act — changing host is the explicit "fix the config" signal and
    // must clear the entry so polling resumes.
    act(() => {
      result.current.updateBackend(id, { host: "http://localhost:9001" });
    });

    // Assert
    expect(getBackendHealthEntry(id)).toBeNull();
  });

  it("removeBackend drops the backend's persisted health entry", () => {
    // Arrange
    const { result } = renderHook(() => useActiveBackendContext(), {
      wrapper: makeWrapper(),
    });
    let id = "";
    act(() => {
      id = result.current.addBackend({
        name: "Doomed",
        host: "http://localhost:9000",
        apiKey: "k",
        kind: "local",
      }).id;
    });
    recordBackendFailure(id, new Error("boom"));
    expect(getBackendHealthEntry(id)).not.toBeNull();

    // Act
    act(() => {
      result.current.removeBackend(id);
    });

    // Assert
    expect(getBackendHealthEntry(id)).toBeNull();
  });
});
