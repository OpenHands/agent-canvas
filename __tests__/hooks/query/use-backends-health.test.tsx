import { ServerClient } from "@openhands/typescript-client/clients";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_LOCAL_BACKEND_ID } from "#/api/backend-registry/default-backend";
import {
  BACKEND_HEALTH_STORAGE_KEY,
  MAX_CONSECUTIVE_FAILURES,
} from "#/api/backend-registry/health-storage";
import {
  __resetHealthStoreForTests,
  resetBackendHealth,
} from "#/api/backend-registry/health-store";
import type { Backend } from "#/api/backend-registry/types";
import { useBackendsHealth } from "#/hooks/query/use-backends-health";

const getServerInfoMock = vi.fn();
const getCurrentCloudApiKeyMock = vi.fn();

vi.mock("@openhands/typescript-client/clients", () => ({
  ServerClient: vi.fn(function ServerClientMock() {
    return { getServerInfo: getServerInfoMock };
  }),
}));

vi.mock("#/api/cloud/organization-service.api", () => ({
  getCurrentCloudApiKey: (...args: unknown[]) =>
    getCurrentCloudApiKeyMock(...args),
}));

const localBackend: Backend = {
  id: DEFAULT_LOCAL_BACKEND_ID,
  name: "Local",
  host: "http://localhost:18000",
  apiKey: "",
  kind: "local",
};

const cloudBackend: Backend = {
  id: "cloud-1",
  name: "Production",
  host: "https://app.all-hands.dev",
  apiKey: "bearer",
  kind: "cloud",
};

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  getServerInfoMock.mockReset();
  getCurrentCloudApiKeyMock.mockReset();
  vi.mocked(ServerClient).mockClear();
  window.localStorage.clear();
  __resetHealthStoreForTests();
});

afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
  __resetHealthStoreForTests();
});

describe("useBackendsHealth", () => {
  it("probes local backends via getServerInfo and reports connected", async () => {
    getServerInfoMock.mockResolvedValue({ version: "1.18.0" });

    const { result } = renderHook(() => useBackendsHealth([localBackend]), {
      wrapper,
    });

    await waitFor(() =>
      expect(result.current[localBackend.id].isConnected).toBe(true),
    );
    expect(getServerInfoMock).toHaveBeenCalled();
    expect(getCurrentCloudApiKeyMock).not.toHaveBeenCalled();
  });

  it("reports disconnected when the local probe throws", async () => {
    getServerInfoMock.mockRejectedValue(new Error("ECONNREFUSED"));

    const { result } = renderHook(() => useBackendsHealth([localBackend]), {
      wrapper,
    });

    await waitFor(() =>
      expect(result.current[localBackend.id].isConnected).toBe(false),
    );
  });

  it("probes cloud backends via getCurrentCloudApiKey", async () => {
    getCurrentCloudApiKeyMock.mockResolvedValue({
      orgId: "org-1",
      isLegacyKey: false,
    });

    const { result } = renderHook(() => useBackendsHealth([cloudBackend]), {
      wrapper,
    });

    await waitFor(() =>
      expect(result.current[cloudBackend.id].isConnected).toBe(true),
    );
    expect(getCurrentCloudApiKeyMock).toHaveBeenCalledWith(cloudBackend);
    expect(getServerInfoMock).not.toHaveBeenCalled();
  });

  it("reports disconnected when the cloud probe throws", async () => {
    getCurrentCloudApiKeyMock.mockRejectedValue(new Error("401"));

    const { result } = renderHook(() => useBackendsHealth([cloudBackend]), {
      wrapper,
    });

    await waitFor(() =>
      expect(result.current[cloudBackend.id].isConnected).toBe(false),
    );
  });

  it("reports null while the first probe is still in flight", async () => {
    let resolveProbe!: () => void;
    getServerInfoMock.mockImplementation(
      () =>
        new Promise<unknown>((resolve) => {
          resolveProbe = () => resolve({ version: "1.18.0" });
        }),
    );

    const { result } = renderHook(() => useBackendsHealth([localBackend]), {
      wrapper,
    });

    expect(result.current[localBackend.id].isConnected).toBeNull();

    resolveProbe();
    await waitFor(() =>
      expect(result.current[localBackend.id].isConnected).toBe(true),
    );
  });

  it("records the failure count and last error to the health store after a failed probe", async () => {
    // Arrange
    getServerInfoMock.mockRejectedValue(new Error("ECONNREFUSED"));

    // Act
    const { result } = renderHook(() => useBackendsHealth([localBackend]), {
      wrapper,
    });

    // Assert — one failed probe surfaces the new metadata fields on
    // the hook's return value and persists them to localStorage; the
    // disabled flag stays false because we're below the cap.
    await waitFor(() =>
      expect(result.current[localBackend.id]).toMatchObject({
        isConnected: false,
        consecutiveFailures: 1,
        lastError: "ECONNREFUSED",
        disabled: false,
      }),
    );
    const persisted = JSON.parse(
      window.localStorage.getItem(BACKEND_HEALTH_STORAGE_KEY) ?? "{}",
    );
    expect(persisted[localBackend.id]).toMatchObject({
      consecutiveFailures: 1,
      disabled: false,
    });
  });

  it("does not probe a backend whose disabled state was persisted before the GUI mounted (refresh case)", async () => {
    // Arrange — simulate a prior session that already exhausted retries
    // by seeding localStorage before the hook subscribes.
    window.localStorage.setItem(
      BACKEND_HEALTH_STORAGE_KEY,
      JSON.stringify({
        [localBackend.id]: {
          consecutiveFailures: MAX_CONSECUTIVE_FAILURES,
          lastError: "ECONNREFUSED",
          lastFailureAt: Date.now(),
          disabled: true,
        },
      }),
    );
    __resetHealthStoreForTests();
    getServerInfoMock.mockResolvedValue({ version: "1.18.0" });

    // Act
    const { result } = renderHook(() => useBackendsHealth([localBackend]), {
      wrapper,
    });
    // Let any microtasks drain so a stray probe would have fired by now.
    await act(async () => {
      await Promise.resolve();
    });

    // Assert — polling is gated off; no probe goes out.
    expect(getServerInfoMock).not.toHaveBeenCalled();
    expect(result.current[localBackend.id]).toMatchObject({
      isConnected: false,
      disabled: true,
    });
  });

  it("re-arms polling after the user edits the backend (resetBackendHealth clears the disabled flag)", async () => {
    // Arrange — start from the persisted-disabled state.
    window.localStorage.setItem(
      BACKEND_HEALTH_STORAGE_KEY,
      JSON.stringify({
        [localBackend.id]: {
          consecutiveFailures: MAX_CONSECUTIVE_FAILURES,
          lastError: "ECONNREFUSED",
          lastFailureAt: Date.now(),
          disabled: true,
        },
      }),
    );
    __resetHealthStoreForTests();
    getServerInfoMock.mockResolvedValue({ version: "1.18.0" });

    const { result } = renderHook(() => useBackendsHealth([localBackend]), {
      wrapper,
    });
    expect(getServerInfoMock).not.toHaveBeenCalled();

    // Act — the active-backend-context calls resetBackendHealth when
    // host or apiKey changes; do that directly so we don't have to
    // spin up the whole context.
    act(() => {
      resetBackendHealth(localBackend.id);
    });

    // Assert — a fresh probe fires and the hook reports connected.
    await waitFor(() =>
      expect(result.current[localBackend.id].isConnected).toBe(true),
    );
    expect(getServerInfoMock).toHaveBeenCalled();
  });

  it("re-probes a persisted-disabled backend when explicitly asked and clears the stale health entry on success", async () => {
    window.localStorage.setItem(
      BACKEND_HEALTH_STORAGE_KEY,
      JSON.stringify({
        [localBackend.id]: {
          consecutiveFailures: MAX_CONSECUTIVE_FAILURES,
          lastError: "Network Error",
          lastFailureAt: Date.now(),
          disabled: true,
        },
      }),
    );
    __resetHealthStoreForTests();
    getServerInfoMock.mockResolvedValue({ version: "1.18.0" });

    const { result } = renderHook(
      () => useBackendsHealth([localBackend], { probeDisabledOnce: true }),
      {
        wrapper,
      },
    );

    await waitFor(() =>
      expect(result.current[localBackend.id]).toMatchObject({
        isConnected: true,
        disabled: false,
      }),
    );
    expect(getServerInfoMock).toHaveBeenCalled();
    expect(window.localStorage.getItem(BACKEND_HEALTH_STORAGE_KEY)).toBeNull();
  });
});
