#!/usr/bin/env node

/**
 * Reads Playwright JSON results and renders a Markdown report for a PR comment.
 *
 * Usage:
 *   node render-mock-llm-report.mjs \
 *     --results test-results-mock-llm/results.json \
 *     --output  mock-llm-report.md \
 *     [--workflow-url <url>] \
 *     [--commit <sha>] \
 *     [--artifact-url <url>]
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";

// Each CI run posts a fresh comment (no upsert), so no dedup marker needed.

// ── CLI args ───────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const [rawKey, inlineVal] = arg.slice(2).split("=", 2);
    const key = rawKey.replaceAll("-", "_");
    if (inlineVal !== undefined) {
      args[key] = inlineVal;
    } else {
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = "";
      }
    }
  }
  return args;
}

// ── Playwright JSON parsing ────────────────────────────────────────────

function loadResults(path) {
  if (!path || !existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function collectTests(suites, parents = []) {
  const tests = [];
  for (const suite of suites ?? []) {
    const titles = [...parents, suite.title].filter(Boolean);
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const results = test.results ?? [];
        const lastResult = results.at(-1);
        const duration = results.reduce(
          (sum, r) => sum + (Number(r.duration) || 0),
          0,
        );
        tests.push({
          title: [...titles, spec.title].filter(Boolean).join(" › "),
          status: lastResult?.status ?? (spec.ok ? "passed" : "unknown"),
          durationMs: duration,
          retryCount: Math.max(0, results.length - 1),
          error: extractError(lastResult),
        });
      }
    }
    tests.push(...collectTests(suite.suites, titles));
  }
  return tests;
}

function extractError(result) {
  if (!result) return "";
  const errorMessages = Array.isArray(result.errors)
    ? result.errors.map((e) => e.message).filter(Boolean).join("\n\n")
    : "";
  const msg = result.error?.message ?? errorMessages;
  // Trim to avoid bloating the comment
  return sanitize(msg).slice(0, 1500);
}

function sanitize(str) {
  if (!str) return "";
  // Strip ANSI escape codes
  return str.replace(/\x1B\[[0-9;]*m/g, "");
}

// ── Formatting ─────────────────────────────────────────────────────────

function statusIcon(status) {
  switch (status) {
    case "passed":
      return "✅";
    case "failed":
      return "❌";
    case "timedOut":
      return "⏱️";
    case "skipped":
      return "⏭️";
    case "interrupted":
      return "🛑";
    default:
      return "❓";
  }
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  const secs = (ms / 1000).toFixed(1);
  return `${secs}s`;
}

function overallStatus(tests) {
  if (tests.length === 0) return "no tests";
  if (tests.every((t) => t.status === "passed")) return "passed";
  if (tests.some((t) => t.status === "failed" || t.status === "timedOut"))
    return "failed";
  return "mixed";
}

function overallIcon(status) {
  switch (status) {
    case "passed":
      return "✅";
    case "failed":
      return "❌";
    case "no tests":
      return "⚠️";
    default:
      return "🔶";
  }
}

// ── Report rendering ───────────────────────────────────────────────────

function renderReport({ tests, workflowUrl, commit, artifactUrl }) {
  const status = overallStatus(tests);
  const icon = overallIcon(status);
  const passed = tests.filter((t) => t.status === "passed").length;
  const failed = tests.filter(
    (t) => t.status === "failed" || t.status === "timedOut",
  ).length;
  const skipped = tests.filter((t) => t.status === "skipped").length;
  const total = tests.length;

  const lines = [];

  // Header
  lines.push(`## ${icon} Mock-LLM E2E Tests`);
  lines.push("");

  // Summary line
  const parts = [`**${passed}/${total} passed**`];
  if (failed) parts.push(`**${failed} failed**`);
  if (skipped) parts.push(`${skipped} skipped`);
  lines.push(parts.join(" · "));
  lines.push("");

  // Metadata
  const meta = [];
  if (commit) meta.push(`Commit: \`${commit.slice(0, 8)}\``);
  if (workflowUrl) meta.push(`[Workflow run](${workflowUrl})`);
  if (artifactUrl) meta.push(`[Test artifacts](${artifactUrl})`);
  if (meta.length) {
    lines.push(meta.join(" · "));
    lines.push("");
  }

  // Test results table
  lines.push("| Status | Test | Duration |");
  lines.push("|:------:|------|----------|");
  for (const t of tests) {
    const retryNote = t.retryCount > 0 ? ` (${t.retryCount} retries)` : "";
    lines.push(
      `| ${statusIcon(t.status)} | ${t.title}${retryNote} | ${formatDuration(t.durationMs)} |`,
    );
  }
  lines.push("");

  // Error details for failed tests
  const failures = tests.filter(
    (t) =>
      (t.status === "failed" || t.status === "timedOut") && t.error,
  );
  if (failures.length > 0) {
    lines.push("<details>");
    lines.push(`<summary>🔍 Failure details (${failures.length})</summary>`);
    lines.push("");
    for (const t of failures) {
      lines.push(`### ${statusIcon(t.status)} ${t.title}`);
      lines.push("");
      lines.push("```");
      lines.push(t.error);
      lines.push("```");
      lines.push("");
    }
    lines.push("</details>");
    lines.push("");
  }

  lines.push(
    "<sub>Posted by the Mock-LLM E2E workflow · results are deterministic (scripted LLM responses)</sub>",
  );
  lines.push("");

  return lines.join("\n");
}

// ── Main ───────────────────────────────────────────────────────────────

const args = parseArgs(process.argv.slice(2));
const resultsPath = args.results || "test-results-mock-llm/results.json";
const outputPath = args.output || "mock-llm-report.md";

const data = loadResults(resultsPath);
let tests = data ? collectTests(data.suites) : [];

// When Playwright is killed during webServer teardown, the JSON reporter
// never flushes results.json. Fall back to the marker files written by
// DoneMarkerReporter (onTestEnd) which fire before teardown.
if (!data || tests.length === 0) {
  const markerDir = args.marker_dir || ".mock-llm-markers";
  const donePath = `${markerDir}/.tests-done`;
  if (existsSync(donePath)) {
    const markerStatus = readFileSync(donePath, "utf8").trim();
    console.log(`No results.json; using marker file (status: ${markerStatus})`);
    tests = [
      {
        title: "mock-LLM agent-server conversation",
        status: markerStatus === "passed" ? "passed" : "failed",
        durationMs: 0,
        retryCount: 0,
        error:
          markerStatus !== "passed"
            ? "Test failed (details in workflow logs — results.json unavailable due to webServer teardown hang)"
            : "",
      },
    ];
  } else {
    console.warn(`Warning: no results file at ${resultsPath} and no marker files`);
  }
}

const report = renderReport({
  tests,
  workflowUrl: args.workflow_url || "",
  commit: args.commit || "",
  artifactUrl: args.artifact_url || "",
});

writeFileSync(outputPath, report);
console.log(
  `Report written to ${outputPath} (${tests.length} tests, ${overallStatus(tests)})`,
);
