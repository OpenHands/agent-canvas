import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "#/services/settings";
import {
  buildWorkStartConversationRequest,
  buildWorkSystemSuffix,
} from "#/api/agent-server-adapter";

describe("buildWorkStartConversationRequest", () => {
  const manifest = {
    id: "workspace-1",
    name: "Personal",
    grantedFolders: ["/tmp/docs"],
    deliverablesPath: "/tmp/docs/deliverables",
  };

  it("builds a restricted tool profile and work tags", () => {
    const payload = buildWorkStartConversationRequest({
      settings: DEFAULT_SETTINGS,
      query: "Organize receipts",
      workingDir: manifest.deliverablesPath,
      workManifest: manifest,
    });

    const toolNames = payload.agent_settings.tools?.map((tool) => tool.name);
    expect(toolNames).toEqual(["file_editor", "task_tracker", "canvas_ui"]);
    expect(payload.tags).toEqual({
      appmode: "work",
      workwsid: "workspace1",
    });
    expect(payload.worktree).toBe(false);
  });

  it("includes granted folders in the work suffix", () => {
    expect(buildWorkSystemSuffix(manifest)).toContain("/tmp/docs");
    expect(buildWorkSystemSuffix(manifest)).toContain(
      "/tmp/docs/deliverables",
    );
  });
});
