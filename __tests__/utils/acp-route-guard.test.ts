import { describe, it, expect, vi, afterEach } from "vitest";
import { redirectIfAcpActive } from "#/utils/acp-route-guard";
import { getQueryClient } from "#/query-client-config";

// `queryClient` (used by the guard) is a Proxy around the lazily-created
// singleton — spy on the real underlying client instance so vi.spyOn can find
// an actual own property to wrap.
const queryClient = getQueryClient();

describe("redirectIfAcpActive", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the shared no-retry policy for the agent-profiles fetch (#1571 review)", async () => {
    // An older backend without /api/agent-profiles must fail this fast rather
    // than sitting through the default exponential backoff on every settings
    // navigation — the retry policy is shared with useAgentProfiles and the
    // launch path in useCreateConversation so it can't drift between them.
    const fetchQuerySpy = vi
      .spyOn(queryClient, "fetchQuery")
      .mockResolvedValueOnce({
        profiles: [
          {
            id: "p1",
            name: "default",
            agent_kind: "openhands",
            revision: 1,
            llm_profile_ref: "gpt",
            mcp_server_refs: null,
          },
        ],
        active_agent_profile_id: "p1",
      } as never);

    await redirectIfAcpActive();

    expect(fetchQuerySpy).toHaveBeenCalledTimes(1);
    expect(fetchQuerySpy.mock.calls[0]?.[0]).toMatchObject({ retry: false });
  });

  it("falls through to the settings fallback (default retry policy) when the profile list can't resolve isAcp", async () => {
    const fetchQuerySpy = vi
      .spyOn(queryClient, "fetchQuery")
      .mockResolvedValueOnce({ profiles: [], active_agent_profile_id: null })
      .mockResolvedValueOnce({ agent_settings: { agent_kind: "openhands" } });

    const result = await redirectIfAcpActive();

    expect(result).toBeNull();
    expect(fetchQuerySpy).toHaveBeenCalledTimes(2);
    // The settings fallback isn't part of the shared agent-profiles retry
    // policy — it's a different (always-available) surface.
    expect(fetchQuerySpy.mock.calls[1]?.[0]).not.toHaveProperty("retry");
  });
});
