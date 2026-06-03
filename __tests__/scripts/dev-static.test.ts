import { describe, expect, it } from "vitest";

import {
  buildAutomationBackendEnv,
  buildAutomationCompatEnv,
} from "../../scripts/dev-static.mjs";

describe("dev-static", () => {
  it("uses the same session key for both agent-server and automation backend auth", () => {
    const env = buildAutomationBackendEnv({
      agentServerPort: 18000,
      ingressPort: 8000,
      sessionApiKey: "shared-session-key",
      stateDir: "/tmp/agent-canvas-state",
    });

    expect(env).toMatchObject({
      AUTOMATION_AGENT_SERVER_URL: "http://localhost:18000",
      AUTOMATION_AGENT_SERVER_API_KEY: "shared-session-key",
      AUTOMATION_LOCAL_API_KEY: "shared-session-key",
    });
    expect(env.OPENHANDS_AGENT_CANVAS_AUTOMATION_COMPAT).toBe("1");
    expect(env.PYTHONPATH).toContain("automation-compat-python");
  });

  it("builds the same compatibility env helper directly", () => {
    const env = buildAutomationCompatEnv({});

    expect(env.OPENHANDS_AGENT_CANVAS_AUTOMATION_COMPAT).toBe("1");
    expect(env.PYTHONPATH).toContain("automation-compat-python");
  });
});
