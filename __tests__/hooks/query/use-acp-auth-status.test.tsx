import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAcpAuthStatus } from "#/hooks/query/use-acp-auth-status";
import type { ACPAuthStatusResponse } from "@openhands/typescript-client";

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

const getAuthStatus = vi.hoisted(() => vi.fn());
vi.mock("#/api/acp-service/acp-service.api", () => ({
  default: {
    getAuthStatus: (...args: unknown[]) => getAuthStatus(...args),
  },
}));

// Build a full ACPAuthStatusResponse with the given status; the hook only
// reads ``.status`` but the service returns the whole record.
function authResponse(
  status: ACPAuthStatusResponse["status"],
): ACPAuthStatusResponse {
  return {
    server: "claude-code",
    status,
    auth_methods: [],
    agent_name: "",
    agent_version: "",
    detail: null,
  };
}

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
});

describe("useAcpAuthStatus", () => {
  it("reports authenticated when the probe endpoint says so", async () => {
    getAuthStatus.mockResolvedValue(authResponse("authenticated"));

    const { result } = renderHook(() => useAcpAuthStatus("claude-code"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    // The provider key parameterizes the probe.
    expect(getAuthStatus).toHaveBeenCalledTimes(1);
    expect(getAuthStatus).toHaveBeenCalledWith("claude-code");
  });

  it("reports unauthenticated when the endpoint reports auth_required", async () => {
    getAuthStatus.mockResolvedValue(authResponse("unauthenticated"));

    const { result } = renderHook(() => useAcpAuthStatus("codex"), { wrapper });

    await waitFor(() => expect(result.current.status).toBe("unauthenticated"));
    expect(getAuthStatus).toHaveBeenCalledWith("codex");
  });

  it("falls back to unknown when the probe call rejects", async () => {
    getAuthStatus.mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => useAcpAuthStatus("claude-code"), {
      wrapper,
    });

    // A rejected probe must not be read as "not logged in" — it stays unknown
    // so the caller keeps showing the API-key fields.
    await waitFor(() => expect(result.current.isChecking).toBe(false));
    expect(result.current.status).toBe("unknown");
  });

  it("surfaces an unknown status from the endpoint verbatim", async () => {
    getAuthStatus.mockResolvedValue(authResponse("unknown"));

    const { result } = renderHook(() => useAcpAuthStatus("claude-code"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isChecking).toBe(false));
    expect(result.current.status).toBe("unknown");
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
    expect(getAuthStatus).not.toHaveBeenCalled();
  });

  it("probes credential-less providers too (e.g. gemini-cli, OAuth login)", async () => {
    // Eligibility is not tied to having API-key fields — the server can detect
    // subscription/OAuth providers like Gemini, so the hook must still probe.
    getAuthStatus.mockResolvedValue(authResponse("authenticated"));

    const { result } = renderHook(() => useAcpAuthStatus("gemini-cli"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    expect(result.current.isSupported).toBe(true);
    expect(getAuthStatus).toHaveBeenCalledWith("gemini-cli");
  });

  it("does not probe when disabled (e.g. the step is not the active slide)", async () => {
    const { result } = renderHook(
      () => useAcpAuthStatus("claude-code", { enabled: false }),
      { wrapper },
    );

    await Promise.resolve();
    expect(result.current.status).toBe("unknown");
    expect(getAuthStatus).not.toHaveBeenCalled();
  });
});
