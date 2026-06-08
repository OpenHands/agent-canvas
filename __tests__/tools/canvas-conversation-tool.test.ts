import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const toolSource = readFileSync(
  resolve(repoRoot, "tools/canvas_conversation_tool.py"),
  "utf8",
);

describe("canvas_conversation tool guidance", () => {
  it("tells the agent the child conversation starts with fresh context", () => {
    expect(toolSource).toContain("FRESH CONTEXT");
    expect(toolSource).toContain("does NOT fork/copy");
    expect(toolSource).toContain("include any relevant background");
  });
});
