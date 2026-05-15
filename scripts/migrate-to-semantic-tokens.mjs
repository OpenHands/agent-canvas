#!/usr/bin/env node
/**
 * Replaces direct cool-grey palette references in .tsx/.ts files
 * with --oh-* semantic tokens, making the codebase theme-ready.
 *
 * Usage:
 *   node scripts/migrate-to-semantic-tokens.mjs           (dry run)
 *   node scripts/migrate-to-semantic-tokens.mjs --apply   (write files)
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

const APPLY = process.argv.includes("--apply");
const ROOT = new URL("../src", import.meta.url).pathname;

// ── Replacement table ──────────────────────────────────────────────────────
// Each entry: [regex, replacement]
// Order matters — more specific patterns first.

const REPLACEMENTS = [
  // ── Backgrounds ────────────────────────────────────────────────────────
  // cool-grey-975 → surface-deep
  [/\bbg-\[var\(--cool-grey-975\)\]/g, "bg-[var(--oh-surface-deep)]"],
  [/\bbg-cool-grey-975\b/g, "bg-[var(--oh-surface-deep)]"],

  // cool-grey-950 → base
  [/\bbg-\[var\(--cool-grey-950\)\]/g, "bg-base"],
  [/\bbg-cool-grey-950\b/g, "bg-base"],

  // cool-grey-925 → surface
  [/\bbg-\[var\(--cool-grey-925\)\]/g, "bg-[var(--oh-surface)]"],
  [/\bbg-cool-grey-925\b/g, "bg-[var(--oh-surface)]"],

  // cool-grey-900 → surface-raised
  [/\bbg-\[var\(--cool-grey-900\)\]/g, "bg-[var(--oh-surface-raised)]"],
  [/\bbg-cool-grey-900\b/g, "bg-[var(--oh-surface-raised)]"],

  // cool-grey-800 → tertiary  (already a Tailwind alias via --color-tertiary)
  [/\bbg-\[var\(--cool-grey-800\)\]/g, "bg-tertiary"],
  [/\bbg-cool-grey-800\b/g, "bg-tertiary"],

  // ── Text ───────────────────────────────────────────────────────────────
  // cool-grey-50 → content-2
  [/\btext-\[var\(--cool-grey-50\)\]/g, "text-content-2"],
  [/\btext-cool-grey-50\b/g, "text-content-2"],

  // cool-grey-100 → foreground
  [/\btext-\[var\(--cool-grey-100\)\]/g, "text-[var(--oh-foreground)]"],
  [/\btext-cool-grey-100\b/g, "text-[var(--oh-foreground)]"],

  // cool-grey-200 → text-tertiary
  [/\btext-\[var\(--cool-grey-200\)\]/g, "text-[var(--oh-text-tertiary)]"],
  [/\btext-cool-grey-200\b/g, "text-[var(--oh-text-tertiary)]"],

  // cool-grey-300 → text-secondary
  [/\btext-\[var\(--cool-grey-300\)\]/g, "text-[var(--oh-text-secondary)]"],
  [/\btext-cool-grey-300\b/g, "text-[var(--oh-text-secondary)]"],

  // cool-grey-400 → muted
  [/\btext-\[var\(--cool-grey-400\)\]/g, "text-[var(--oh-muted)]"],
  [/\btext-cool-grey-400\b/g, "text-[var(--oh-muted)]"],
  [/\bplaceholder:text-\[var\(--cool-grey-400\)\]/g, "placeholder:text-[var(--oh-muted)]"],
  [/\bfill-\[var\(--cool-grey-400\)\]/g, "fill-[var(--oh-muted)]"],

  // cool-grey-500 → text-dim
  [/\btext-\[var\(--cool-grey-500\)\]/g, "text-[var(--oh-text-dim)]"],
  [/\btext-cool-grey-500\b/g, "text-[var(--oh-text-dim)]"],

  // cool-grey-600 → text-subtle
  [/\btext-\[var\(--cool-grey-600\)\]/g, "text-[var(--oh-text-subtle)]"],
  [/\btext-cool-grey-600\b/g, "text-[var(--oh-text-subtle)]"],

  // cool-grey-950 as text (inverted, e.g. label on light/gold bg)
  [/\btext-\[var\(--cool-grey-950\)\]/g, "text-base"],
  [/\btext-cool-grey-950\b/g, "text-base"],

  // ── Borders ────────────────────────────────────────────────────────────
  // cool-grey-600 → border-input
  [/\bborder-\[var\(--cool-grey-600\)\]/g, "border-[var(--oh-border-input)]"],
  [/\bborder-cool-grey-600\b/g, "border-[var(--oh-border-input)]"],
  // directional
  [/\bborder-[tblr]-\[var\(--cool-grey-600\)\]/g, (m) =>
    m.replace("var(--cool-grey-600)", "var(--oh-border-input)")],

  // cool-grey-700 → border (standard)
  [/\bborder-\[var\(--cool-grey-700\)\]/g, "border-[var(--oh-border)]"],
  [/\bborder-cool-grey-700\b/g, "border-[var(--oh-border)]"],
  [/\bborder-[tblr]-\[var\(--cool-grey-700\)\]/g, (m) =>
    m.replace("var(--cool-grey-700)", "var(--oh-border)")],

  // cool-grey-800 → border-subtle
  [/\bborder-\[var\(--cool-grey-800\)\]/g, "border-[var(--oh-border-subtle)]"],
  [/\bborder-cool-grey-800\b/g, "border-[var(--oh-border-subtle)]"],
  [/\bborder-[tblr]-\[var\(--cool-grey-800\)\]/g, (m) =>
    m.replace("var(--cool-grey-800)", "var(--oh-border-subtle)")],

  // ── Interactive hover / active states ──────────────────────────────────
  // hover on mid surfaces (panels with 800/925 bg)
  [/\bhover:bg-\[var\(--cool-grey-700\)\]/g, "hover:bg-[var(--oh-interactive-hover)]"],
  [/\bhover:bg-cool-grey-700\b/g, "hover:bg-[var(--oh-interactive-hover)]"],

  // hover on dark base (sidebar on 950 bg) — still "slightly lighter"
  [/\bhover:bg-\[var\(--cool-grey-900\)\]/g, "hover:bg-[var(--oh-interactive-hover-low)]"],
  [/\bhover:bg-cool-grey-900\b/g, "hover:bg-[var(--oh-interactive-hover-low)]"],

  // active/selected on dark base
  [/\bbg-cool-grey-800\b(?=[^"]*(text-white|font-medium))/g, "bg-[var(--oh-interactive-active)]"],

  // placeholder text in inputs using direct palette refs
  [/\bplaceholder:text-\[var\(--cool-grey-400\)\]/g, "placeholder:text-[var(--oh-muted)]"],
  [/\bplaceholder:text-cool-grey-400\b/g, "placeholder:text-[var(--oh-muted)]"],
];

// ── File walker ────────────────────────────────────────────────────────────
function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if ([".tsx", ".ts"].includes(extname(full))) yield full;
  }
}

// ── Process one file ───────────────────────────────────────────────────────
function processFile(path) {
  const original = readFileSync(path, "utf8");
  let result = original;
  let count = 0;

  for (const [pattern, replacement] of REPLACEMENTS) {
    const before = result;
    result = result.replace(pattern, replacement);
    if (result !== before) {
      const matches = (before.match(pattern) || []).length;
      count += matches;
    }
  }

  if (result !== original) {
    if (APPLY) writeFileSync(path, result, "utf8");
    return count;
  }
  return 0;
}

// ── Run ────────────────────────────────────────────────────────────────────
let totalFiles = 0;
let totalChanges = 0;

for (const file of walk(ROOT)) {
  const changes = processFile(file);
  if (changes > 0) {
    totalFiles++;
    totalChanges += changes;
    const rel = file.replace(ROOT, "src");
    console.log(`  ${APPLY ? "✓" : "~"} ${rel} (${changes} changes)`);
  }
}

console.log(
  `\n${APPLY ? "Applied" : "Dry run:"} ${totalChanges} replacements across ${totalFiles} files`,
);
if (!APPLY) {
  console.log("Run with --apply to write changes.");
}
