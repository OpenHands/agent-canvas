import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLlmProfiles, LLM_PROFILES_QUERY_KEYS } from "#/hooks/query/use-llm-profiles";
import ProfilesService from "#/api/profiles-service/profiles-service.api";

vi.mock("#/api/profiles-service/profiles-service.api");

describe("useLlmProfiles", () => {
  let queryClient: QueryClient;
  let wrapper: ({ children }: { children: React.ReactNode }) => React.ReactElement;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        children,
      );
  });

  afterEach(() => {
    queryClient.clear();
    vi.clearAllMocks();
  });

  it("fetches profiles from ProfilesService.listProfiles", async () => {
    const mockProfiles = {
      profiles: [
        { name: "profile-1", model: "openai/gpt-4", base_url: null, api_key_set: true },
        { name: "profile-2", model: "anthropic/claude-3", base_url: null, api_key_set: false },
      ],
      active_profile: "profile-1",
    };

    vi.mocked(ProfilesService.listProfiles).mockResolvedValue(mockProfiles);

    const { result } = renderHook(() => useLlmProfiles(), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(ProfilesService.listProfiles).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual(mockProfiles);
    expect(result.current.data?.profiles).toHaveLength(2);
  });

  it("uses the correct query key", async () => {
    vi.mocked(ProfilesService.listProfiles).mockResolvedValue({ profiles: [], active_profile: null });

    const { result } = renderHook(() => useLlmProfiles(), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const queries = queryClient.getQueryCache().findAll({
      queryKey: LLM_PROFILES_QUERY_KEYS.all,
    });
    expect(queries).toHaveLength(1);
  });

  it("has staleTime of 5 minutes", async () => {
    vi.mocked(ProfilesService.listProfiles).mockResolvedValue({ profiles: [], active_profile: null });

    const { result } = renderHook(() => useLlmProfiles(), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const queries = queryClient.getQueryCache().findAll({
      queryKey: LLM_PROFILES_QUERY_KEYS.all,
    });
    expect(queries).toHaveLength(1);
    expect((queries[0].options as Record<string, unknown>).staleTime).toBe(
      1000 * 60 * 5,
    );
  });

  it("has gcTime of 15 minutes", async () => {
    vi.mocked(ProfilesService.listProfiles).mockResolvedValue({ profiles: [], active_profile: null });

    const { result } = renderHook(() => useLlmProfiles(), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const queries = queryClient.getQueryCache().findAll({
      queryKey: LLM_PROFILES_QUERY_KEYS.all,
    });
    expect(queries).toHaveLength(1);
    expect(queries[0].options.gcTime).toBe(1000 * 60 * 15);
  });

  it("disables toast notifications via meta", async () => {
    vi.mocked(ProfilesService.listProfiles).mockResolvedValue({ profiles: [], active_profile: null });

    const { result } = renderHook(() => useLlmProfiles(), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const queries = queryClient.getQueryCache().findAll({
      queryKey: LLM_PROFILES_QUERY_KEYS.all,
    });
    expect((queries[0].options as Record<string, unknown>).meta).toEqual({
      disableToast: true,
    });
  });

  it("handles API errors gracefully", async () => {
    const error = new Error("Network error");
    vi.mocked(ProfilesService.listProfiles).mockRejectedValue(error);

    const { result } = renderHook(() => useLlmProfiles(), { wrapper });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBe(error);
    expect(result.current.data).toBeUndefined();
  });
});
