import { describe, it, expect } from "vitest";

import { buildFileTree } from "#/utils/file-tree";

describe("buildFileTree", () => {
  it("builds a nested tree from flat paths", () => {
    const root = buildFileTree([
      "src/a.ts",
      "src/sub/b.ts",
      "README.md",
    ]);

    expect(root.children.map((c) => c.name)).toEqual(["src", "README.md"]);

    const srcDir = root.children.find((c) => c.name === "src");
    expect(srcDir?.isDirectory).toBe(true);
    expect(srcDir?.children.map((c) => c.name)).toEqual(["sub", "a.ts"]);

    const readme = root.children.find((c) => c.name === "README.md");
    expect(readme?.isDirectory).toBe(false);
    expect(readme?.path).toBe("README.md");
  });

  it("sorts directories before files at every level", () => {
    const root = buildFileTree([
      "z-file.ts",
      "dir/inner.ts",
      "a-file.ts",
    ]);
    const names = root.children.map((c) => c.name);
    expect(names).toEqual(["dir", "a-file.ts", "z-file.ts"]);
  });

  it("does not duplicate directory nodes when many files share a directory", () => {
    const root = buildFileTree([
      "src/a.ts",
      "src/b.ts",
      "src/c.ts",
    ]);
    expect(root.children).toHaveLength(1);
    expect(root.children[0].children).toHaveLength(3);
  });

  it("returns an empty tree when given no paths", () => {
    const root = buildFileTree([]);
    expect(root.children).toEqual([]);
  });
});
