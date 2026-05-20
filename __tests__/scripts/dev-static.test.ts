import { describe, expect, it } from "vitest";

import { buildAutomationBackendEnv } from "../../scripts/dev-static.mjs";

describe("dev-static", () => {
  it("uses the unified local-backend key for both automation auth and the agent-server callback", () => {
    const env = buildAutomationBackendEnv({
      agentServerPort: 18000,
      ingressPort: 8000,
      localBackendApiKey: "local-backend-key",
      stateDir: "/tmp/agent-canvas-state",
    });

    expect(env).toMatchObject({
      AUTOMATION_AGENT_SERVER_URL: "http://localhost:18000",
      AUTOMATION_AGENT_SERVER_API_KEY: "local-backend-key",
      AUTOMATION_LOCAL_API_KEY: "local-backend-key",
    });
  });
});
