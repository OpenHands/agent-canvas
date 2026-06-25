// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildWorkRuntimeCommand } from "../../scripts/dev-with-automation.mjs";
import { buildRuntimeServicesInfo } from "../../scripts/dev-safe.mjs";

describe("Work Runtime dev stack helpers", () => {
  it("buildWorkRuntimeCommand runs the embedded services/work-runtime app via uv", () => {
    const cmd = buildWorkRuntimeCommand();

    expect(cmd.command).toBe("uv");
    expect(cmd.args).toContain("uvicorn");
    expect(cmd.args).toContain("openhands_work_runtime.app:app");
    expect(cmd.source).toContain("services/work-runtime");
  });

  it("buildRuntimeServicesInfo includes work_runtime when configured", () => {
    const info = buildRuntimeServicesInfo({
      mode: "dev:automation",
      agentServerPort: 18000,
      ingressPort: 8000,
      workRuntime: { port: 18002 },
    });

    expect(
      (info as { services: { work_runtime?: { api_prefix?: string } } })
        .services.work_runtime?.api_prefix,
    ).toBe("/api/work");
    expect(
      (info as { services: { work_runtime?: { auth_env_var?: string } } })
        .services.work_runtime?.auth_env_var,
    ).toBe("OPENHANDS_WORK_RUNTIME_API_KEY");
  });
});
