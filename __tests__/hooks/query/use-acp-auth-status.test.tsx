import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAcpAuthStatus } from "#/hooks/query/use-acp-auth-status";

// Active backend is swapped per-test (local vs cloud) via this mutable holder.
const backendMock = vi.hoisted(() => ({
  current: {
    backend: { id: "local-1", kind: "local" as "local" | "cloud" },
    orgId: null as string | null,
  },
}));
vi.mock("#/contexts/active-backend-context", () => ({
  useActiveBackend: () => backendMock.current,
}));

const createConversation = vi.hoisted(() => vi.fn());
const deleteConversation = vi.hoisted(() => vi.fn());
vi.mock(
  "#/api/conversation-service/agent-server-conversation-service.api",
  () => ({
    default: {
      createConversation: (...args: unknown[]) => createConversation(...args),
      deleteConversation: (...args: unknown[]) => deleteConversation(...args),
    },
  }),
);

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  backendMock.current = {
    backend: { id: "local-1", kind: "local" },
    orgId: null,
  };
  deleteConversation.mockResolvedValue(undefined);
});

describe("useAcpAuthStatus", () => {
  it("reports authenticated and tears down the probe conversation when create succeeds", async () => {
    createConversation.mockResolvedValue({ id: "probe-1" });

    const { result } = renderHook(() => useAcpAuthStatus("claude-code"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    expect(createConversation).toHaveBeenCalledTimes(1);
    // Probe conversation is deleted (subprocess torn down) — best effort.
    await waitFor(() =>
      expect(deleteConversation).toHaveBeenCalledWith("probe-1"),
    );
  });

  it("reports unauthenticated (and deletes nothing) when create fails", async () => {
    createConversation.mockRejectedValue(new Error("auth required"));

    const { result } = renderHook(() => useAcpAuthStatus("codex"), { wrapper });

    await waitFor(() => expect(result.current.status).toBe("unauthenticated"));
    expect(deleteConversation).not.toHaveBeenCalled();
  });

  it("does not probe on a cloud backend", async () => {
    backendMock.current = {
      backend: { id: "cloud-1", kind: "cloud" },
      orgId: null,
    };

    const { result } = renderHook(() => useAcpAuthStatus("claude-code"), {
      wrapper,
    });

    await Promise.resolve();
    expect(result.current.status).toBe("unknown");
    expect(result.current.isSupported).toBe(false);
    expect(createConversation).not.toHaveBeenCalled();
  });

  it("does not probe for a provider with no credential fields (gemini-cli)", async () => {
    const { result } = renderHook(() => useAcpAuthStatus("gemini-cli"), {
      wrapper,
    });

    await Promise.resolve();
    expect(result.current.isSupported).toBe(false);
    expect(createConversation).not.toHaveBeenCalled();
  });

  it("does not probe when disabled (e.g. the step is not the active slide)", async () => {
    const { result } = renderHook(
      () => useAcpAuthStatus("claude-code", { enabled: false }),
      { wrapper },
    );

    await Promise.resolve();
    expect(result.current.status).toBe("unknown");
    expect(createConversation).not.toHaveBeenCalled();
  });
});
