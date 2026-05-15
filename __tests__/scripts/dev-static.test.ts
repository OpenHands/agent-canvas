import { describe, expect, it } from "vitest";

import { buildAutomationBackendEnv } from "../../scripts/dev-static.mjs";

describe("dev-static", () => {
  it("passes the agent-server session key to the automation backend", () => {
    const env = buildAutomationBackendEnv({
      agentServerPort: 18000,
      ingressPort: 8000,
      localApiKey: "automation-local-key",
      sessionApiKey: "agent-session-key",
      stateDir: "/tmp/agent-canvas-state",
    });

    expect(env).toMatchObject({
      AUTOMATION_AGENT_SERVER_URL: "http://localhost:18000",
      AUTOMATION_AGENT_SERVER_API_KEY: "agent-session-key",
      AUTOMATION_LOCAL_API_KEY: "automation-local-key",
    });
  });
});
