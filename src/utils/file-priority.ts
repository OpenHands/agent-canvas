/**
 * Utilities for ranking workspace files by "importance" so that the file-tab
 * top-row surfaces the entry points (`index.html`, `README.md`, `package.json`,
 * etc.) ahead of nested utility modules.
 */

/**
 * File basenames (lowercased) that are almost always the entrypoint for a
 * project. Lower index = higher priority.
 */
const HIGH_PRIORITY_BASENAMES: string[] = [
  "index.html",
  "index.htm",
  "readme.md",
  "readme",
  "main.html",
  "app.html",
  "index.js",
  "index.ts",
  "index.tsx",
  "index.jsx",
  "main.py",
  "app.py",
  "main.go",
  "main.rs",
  "main.java",
  "main.c",
  "main.cpp",
  "package.json",
  "pyproject.toml",
  "cargo.toml",
  "go.mod",
  "pom.xml",
  "dockerfile",
  "makefile",
];

/**
 * Filenames that are useful but typically of secondary interest compared to
 * the entrypoints above.
 */
const SECONDARY_BASENAMES: string[] = [
  "license",
  "license.md",
  "license.txt",
  "changelog.md",
  "agents.md",
  "tsconfig.json",
  ".env.sample",
  ".env.example",
];

function getBasename(path: string): string {
  const idx = path.lastIndexOf("/");
  return (idx === -1 ? path : path.slice(idx + 1)).toLowerCase();
}

function pathDepth(path: string): number {
  return path.split("/").length - 1;
}

export function filePriorityScore(path: string): number {
  const base = getBasename(path);

  const highIdx = HIGH_PRIORITY_BASENAMES.indexOf(base);
  if (highIdx !== -1) {
    // High-priority entries get the lowest scores so they come first; nudge
    // by depth so a top-level index.html beats a nested one.
    return highIdx + pathDepth(path) * 0.01;
  }

  const secondaryIdx = SECONDARY_BASENAMES.indexOf(base);
  if (secondaryIdx !== -1) {
    return 1000 + secondaryIdx + pathDepth(path) * 0.01;
  }

  // Generic files: shallower paths beat deeper ones, then alphabetical.
  return 10000 + pathDepth(path) * 100;
}

/**
 * Returns a copy of `paths` sorted with "important" files first, then by
 * directory depth, then alphabetically.
 */
export function sortFilesByPriority(paths: string[]): string[] {
  return [...paths].sort((a, b) => {
    const diff = filePriorityScore(a) - filePriorityScore(b);
    if (diff !== 0) return diff;
    return a.localeCompare(b);
  });
}
