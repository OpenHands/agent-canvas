import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const toolSource = readFileSync(resolve(repoRoot, "tools/canvas_ui_tool.py"), "utf8");

describe("canvas_ui browser guidance", () => {
  it("tells the agent to capture a browser screenshot before opening the browser tab", () => {
    const captureInstruction = "browser_get_state(include_screenshot=true)";
    const openBrowserInstruction = 'command="open_tab", tab="browser"';

    expect(toolSource).toContain(captureInstruction);
    expect(toolSource).toContain(openBrowserInstruction);
    expect(toolSource.indexOf(captureInstruction)).toBeLessThan(
      toolSource.indexOf(openBrowserInstruction),
    );
  });
});
