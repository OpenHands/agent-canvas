import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetActiveStoreForTests } from "#/api/backend-registry/active-store";
import { BUNDLED_BACKEND_ID } from "#/api/backend-registry/types";
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
});

afterEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
});

describe("ActiveBackendProvider", () => {
  it("exposes the bundled backend by default", () => {
    const { result } = renderHook(() => useActiveBackendContext(), {
      wrapper: makeWrapper(),
    });

    expect(result.current.active.backend.id).toBe(BUNDLED_BACKEND_ID);
    expect(result.current.backends).toEqual([]);
  });

  it("addBackend persists and exposes the new backend", () => {
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

    expect(result.current.backends).toHaveLength(1);
    expect(result.current.backends[0]).toMatchObject({
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

  it("removeBackend falls back to bundled if the active was removed", () => {
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
    expect(result.current.active.backend.id).toBe(BUNDLED_BACKEND_ID);
    expect(result.current.backends).toEqual([]);
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
});
