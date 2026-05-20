import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useSwitchLlmProfile } from "#/hooks/mutation/use-switch-llm-profile";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import SettingsService from "#/api/settings-service/settings-service.api";
import {
  LLM_PROFILES_QUERY_KEYS,
  SETTINGS_QUERY_KEYS,
} from "#/hooks/query/query-keys";

vi.mock(
  "#/api/conversation-service/agent-server-conversation-service.api",
  () => ({
    default: {
      switchProfile: vi.fn(),
    },
  }),
);

const renderSwitchHook = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");
  const { result } = renderHook(() => useSwitchLlmProfile(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
  return { result, invalidateQueriesSpy };
};

describe("useSwitchLlmProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    SettingsService.invalidateCache();
  });

  it("invalidates the settings cache on the home-page activate path (conversationId === null)", async () => {
    vi.mocked(AgentServerConversationService.switchProfile).mockResolvedValue(
      undefined as never,
    );
    const invalidateCacheSpy = vi.spyOn(SettingsService, "invalidateCache");

    const { result, invalidateQueriesSpy } = renderSwitchHook();

    result.current.mutate({ conversationId: null, profileName: "my-profile" });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(AgentServerConversationService.switchProfile).toHaveBeenCalledWith(
      null,
      "my-profile",
    );
    // The stale settings cache must be cleared so conversation-start uses the
    // newly activated profile's LLM (the core of bug #640).
    expect(invalidateCacheSpy).toHaveBeenCalled();
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: LLM_PROFILES_QUERY_KEYS.all,
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: SETTINGS_QUERY_KEYS.personal(),
    });

    invalidateCacheSpy.mockRestore();
  });

  it("does not touch the settings cache for the per-conversation switch path", async () => {
    vi.mocked(AgentServerConversationService.switchProfile).mockResolvedValue(
      undefined as never,
    );
    const invalidateCacheSpy = vi.spyOn(SettingsService, "invalidateCache");

    const { result, invalidateQueriesSpy } = renderSwitchHook();

    result.current.mutate({
      conversationId: "conv-1",
      profileName: "my-profile",
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(invalidateCacheSpy).not.toHaveBeenCalled();
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: LLM_PROFILES_QUERY_KEYS.all,
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["user", "conversation", "conv-1"],
    });
    expect(invalidateQueriesSpy).not.toHaveBeenCalledWith({
      queryKey: SETTINGS_QUERY_KEYS.personal(),
    });

    invalidateCacheSpy.mockRestore();
  });

  it("does not invalidate the settings cache when the switch fails", async () => {
    vi.mocked(AgentServerConversationService.switchProfile).mockRejectedValue(
      new Error("boom"),
    );
    const invalidateCacheSpy = vi.spyOn(SettingsService, "invalidateCache");

    const { result } = renderSwitchHook();

    result.current.mutate({ conversationId: null, profileName: "my-profile" });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(invalidateCacheSpy).not.toHaveBeenCalled();

    invalidateCacheSpy.mockRestore();
  });
});
