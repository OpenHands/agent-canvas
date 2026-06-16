import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useSwitchAcpModel } from "#/hooks/mutation/use-switch-acp-model";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import SettingsService from "#/api/settings-service/settings-service.api";
import { SETTINGS_QUERY_KEYS } from "#/hooks/query/query-keys";

vi.mock(
  "#/api/conversation-service/agent-server-conversation-service.api",
  () => ({
    default: {
      switchAcpModel: vi.fn(),
    },
  }),
);

vi.mock("#/api/settings-service/settings-service.api", () => ({
  default: {
    saveSettings: vi.fn(),
    invalidateCache: vi.fn(),
  },
}));

const renderSwitchHook = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");
  const { result } = renderHook(() => useSwitchAcpModel(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
  return { result, invalidateQueriesSpy };
};

describe("useSwitchAcpModel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("live-switches the ACP model for an active conversation and invalidates conversation queries", async () => {
    vi.mocked(AgentServerConversationService.switchAcpModel).mockResolvedValue(
      undefined,
    );

    const { result, invalidateQueriesSpy } = renderSwitchHook();

    result.current.mutate({
      conversationId: "conv-1",
      model: "claude-sonnet-4-6",
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(AgentServerConversationService.switchAcpModel).toHaveBeenCalledWith(
      "conv-1",
      "claude-sonnet-4-6",
    );
    // Does NOT write to settings on the per-conversation path.
    expect(SettingsService.saveSettings).not.toHaveBeenCalled();
    expect(SettingsService.invalidateCache).not.toHaveBeenCalled();
    // Refreshes the conversation caches so the model chip updates.
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["user", "conversation", "conv-1"],
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["user", "conversations"],
    });
  });

  it("persists the model as the agent-settings default on the home page (conversationId === null)", async () => {
    vi.mocked(SettingsService.saveSettings).mockResolvedValue(true);

    const { result, invalidateQueriesSpy } = renderSwitchHook();

    result.current.mutate({ conversationId: null, model: "gemini-2.5-pro" });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // The home-page default is written via a scalar acp_model diff (deep-merged
    // into agent_settings so the provider + command are preserved).
    expect(SettingsService.saveSettings).toHaveBeenCalledWith({
      agent_settings_diff: { acp_model: "gemini-2.5-pro" },
    });
    expect(
      AgentServerConversationService.switchAcpModel,
    ).not.toHaveBeenCalled();
    // Clears the stale settings cache + refetches so the next conversation and
    // the home chip read the new default.
    expect(SettingsService.invalidateCache).toHaveBeenCalled();
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: SETTINGS_QUERY_KEYS.personal(),
    });
  });

  it("does not invalidate caches when the live switch fails", async () => {
    vi.mocked(AgentServerConversationService.switchAcpModel).mockRejectedValue(
      new Error("boom"),
    );

    const { result, invalidateQueriesSpy } = renderSwitchHook();

    result.current.mutate({ conversationId: "conv-1", model: "x" });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(invalidateQueriesSpy).not.toHaveBeenCalledWith({
      queryKey: ["user", "conversation", "conv-1"],
    });
  });

  it("errors (does not silently persist to settings) on a pre-session 409 in-conversation switch", async () => {
    // Before the first message there's no ACP session → agent-server 409.
    // The switch can't apply to this conversation, and persisting to settings
    // would only change the next conversation's default — so surface an error
    // instead of a misleading success (until software-agent-sdk#3763).
    const conflict = Object.assign(new Error("Conflict"), { status: 409 });
    vi.mocked(AgentServerConversationService.switchAcpModel).mockRejectedValue(
      conflict,
    );

    const { result, invalidateQueriesSpy } = renderSwitchHook();

    result.current.mutate({
      conversationId: "conv-1",
      model: "claude-opus-4-8",
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    // No silent fallback to the agent-settings default for an existing
    // conversation, and no cache invalidation (nothing changed).
    expect(SettingsService.saveSettings).not.toHaveBeenCalled();
    expect(invalidateQueriesSpy).not.toHaveBeenCalledWith({
      queryKey: ["user", "conversation", "conv-1"],
    });
  });

  it("detects the 409 from the axios cloud-proxy error shape (response.status)", async () => {
    // The cloud backend routes through axios, which exposes the status as
    // ``error.response.status`` (not a top-level ``status``). getErrorStatus
    // handles both, so the friendly pre-session error fires here too.
    const conflict = Object.assign(new Error("Request failed"), {
      isAxiosError: true,
      response: { status: 409 },
    });
    vi.mocked(AgentServerConversationService.switchAcpModel).mockRejectedValue(
      conflict,
    );

    const { result } = renderSwitchHook();

    result.current.mutate({
      conversationId: "conv-1",
      model: "claude-opus-4-8",
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    // Surfaced as the friendly "requires session" message, not the raw axios
    // error — and never persisted to settings.
    expect(result.current.error?.message).not.toBe("Request failed");
    expect(SettingsService.saveSettings).not.toHaveBeenCalled();
  });
});
