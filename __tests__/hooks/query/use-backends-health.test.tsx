import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_LOCAL_BACKEND_ID } from "#/api/backend-registry/default-backend";
import type { Backend } from "#/api/backend-registry/types";
import { useBackendsHealth } from "#/hooks/query/use-backends-health";

const getServerInfoMock = vi.fn();
const getCurrentCloudApiKeyMock = vi.fn();

vi.mock("#/api/typescript-client", () => ({
  createServerClient: () => ({ getServerInfo: getServerInfoMock }),
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
  return (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  getServerInfoMock.mockReset();
  getCurrentCloudApiKeyMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
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
});
