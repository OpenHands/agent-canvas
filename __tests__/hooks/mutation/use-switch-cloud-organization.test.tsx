import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, act, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSwitchCloudOrganization } from "#/hooks/mutation/use-switch-cloud-organization";

vi.mock("#/api/cloud/organization-service.api", () => ({
  switchCloudOrganization: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("useSwitchCloudOrganization", () => {
  it("on success removes per-conversation queries and leaves unrelated cache entries untouched", async () => {
    const orgId = "fd950a0a-25bc-48ff-b4dd-ad53a990fb82";
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    queryClient.setQueryData(["user", "conversation", "abc"], { dummy: 1 });
    queryClient.setQueryData(["unrelated"], { dummy: 1 });

    const { result } = renderHook(() => useSwitchCloudOrganization(), {
      wrapper: makeWrapper(queryClient),
    });

    act(() => {
      result.current.mutate({ orgId });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // Per-conversation queries must be physically removed (their org
    // context is stale).
    expect(
      queryClient.getQueryData(["user", "conversation", "abc"]),
    ).toBeUndefined();
    // Other queries are NOT invalidated by this hook — they refetch via
    // the active-backend key change driven by `setActive` in the caller.
    expect(queryClient.getQueryData(["unrelated"])).toEqual({ dummy: 1 });
  });
});
