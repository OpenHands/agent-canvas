import { afterEach, describe, expect, it, vi } from "vitest";

import { toAppConversation } from "#/api/agent-server-adapter";
import {
  __resetActiveStoreForTests,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import { DEFAULT_LOCAL_BACKEND_ID } from "#/api/backend-registry/default-backend";

const directInfo = (id: string) => ({
  id,
  created_at: "2026-05-05T00:00:00Z",
  updated_at: "2026-05-05T00:00:00Z",
});

afterEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  vi.unstubAllEnvs();
});

describe("toAppConversation session_api_key hydration", () => {
  it("prefers the configured VITE_SESSION_API_KEY over a stale stored default-local apiKey", () => {
    vi.stubEnv("VITE_SESSION_API_KEY", "fresh-session-key");

    setRegisteredBackends([
      {
        id: DEFAULT_LOCAL_BACKEND_ID,
        name: "Local",
        host: window.location.origin,
        apiKey: "stale-session-key",
        kind: "local",
      },
    ]);

    const conversation = toAppConversation(directInfo("conv-1"));
    expect(conversation.session_api_key).toBe("fresh-session-key");
  });
});
