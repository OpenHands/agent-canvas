// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

describe("post-snapshot-comment script portability", () => {
  it("uses Node filesystem APIs instead of POSIX-only temp cleanup commands", () => {
    const source = readFileSync(
      path.join(
        repoRoot,
        "tests",
        "e2e",
        "snapshots",
        "scripts",
        "post-snapshot-comment.mjs",
      ),
      "utf-8",
    );

    expect(source).not.toContain('execSync("mktemp -d")');
    expect(source).not.toMatch(/\brm -rf\b/);
  });
});
