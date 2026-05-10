import { describe, it, expect } from "vitest";

import {
  sortFilesByPriority,
  filePriorityScore,
} from "#/utils/file-priority";

describe("file-priority", () => {
  it("places index.html before other files", () => {
    const sorted = sortFilesByPriority([
      "src/utils/helpers.ts",
      "src/index.html",
      "src/components/widget.tsx",
    ]);
    expect(sorted[0]).toBe("src/index.html");
  });

  it("places README.md before generic source files", () => {
    const sorted = sortFilesByPriority([
      "src/components/widget.tsx",
      "README.md",
      "src/utils/helpers.ts",
    ]);
    expect(sorted[0]).toBe("README.md");
  });

  it("prefers top-level index.html over a nested one", () => {
    const sorted = sortFilesByPriority([
      "src/nested/index.html",
      "index.html",
    ]);
    expect(sorted[0]).toBe("index.html");
    expect(sorted[1]).toBe("src/nested/index.html");
  });

  it("falls back to alphabetical order for unimportant files", () => {
    const sorted = sortFilesByPriority([
      "src/zeta.ts",
      "src/alpha.ts",
      "src/mu.ts",
    ]);
    expect(sorted).toEqual(["src/alpha.ts", "src/mu.ts", "src/zeta.ts"]);
  });

  it("scores high-priority basenames lower than generic files", () => {
    expect(filePriorityScore("package.json")).toBeLessThan(
      filePriorityScore("src/some-helper.ts"),
    );
  });

  it("does not mutate the input array", () => {
    const input = ["b.ts", "a.ts"];
    const original = [...input];
    sortFilesByPriority(input);
    expect(input).toEqual(original);
  });
});
