import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "#/services/settings";
import { buildStartConversationRequest } from "./agent-server-adapter";

describe("buildStartConversationRequest", () => {
  it("omits persisted agent_context.current_datetime so the backend can refresh it", () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.agent_settings = {
      ...settings.agent_settings,
      agent_context: {
        current_datetime: "2026-06-03T09:03:50",
        custom_context: "keep-me",
        skills: [
          {
            name: "custom-skill",
            content: "Use the custom workflow.",
            trigger: null,
            source: "user",
            is_agentskills_format: true,
          },
        ],
      },
    };

    const payload = buildStartConversationRequest({
      settings,
      query: "hello",
    });

    const agentContext = payload.agent_settings.agent_context as Record<
      string,
      unknown
    >;
    const skills = agentContext.skills as Array<Record<string, unknown>>;

    expect(agentContext.current_datetime).toBeUndefined();
    expect(agentContext.custom_context).toBe("keep-me");
    expect(skills[0]).toMatchObject({ name: "custom-skill" });
  });
});
