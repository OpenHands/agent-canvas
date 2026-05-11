#!/usr/bin/env node

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { extname, isAbsolute, join, relative, resolve } from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      continue;
    }

    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    const key = rawKey.replaceAll("-", "_");
    if (inlineValue !== undefined) {
      args[key] = inlineValue;
      continue;
    }

    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = "";
    }
  }
  return args;
}

function resolveWithinCwd(label, filePath) {
  const resolvedPath = resolve(filePath);
  const relativePath = relative(resolve("."), resolvedPath);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error(`${label} must be within the current working directory.`);
  }
  return resolvedPath;
}

function readJson(path) {
  if (!path || !existsSync(path)) {
    return null;
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

function collectPlaywrightAttachments(results) {
  const attachments = [];

  function visitSuites(suites) {
    for (const suite of suites ?? []) {
      for (const spec of suite.specs ?? []) {
        for (const test of spec.tests ?? []) {
          for (const result of test.results ?? []) {
            attachments.push(...(result.attachments ?? []));
          }
        }
      }
      visitSuites(suite.suites);
    }
  }

  visitSuites(results?.suites);
  return attachments
    .map((attachment) => ({
      contentType: attachment.contentType || "",
      path: normalizePath(attachment.path || ""),
    }))
    .filter((attachment) => attachment.path && existsSync(attachment.path));
}

function normalizePath(path) {
  if (!path) {
    return "";
  }
  return resolve(path);
}

function collectFiles(dir) {
  if (!dir || !existsSync(dir)) {
    return [];
  }

  const files = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...collectFiles(path));
    } else if (stat.isFile()) {
      files.push(path);
    }
  }
  return files;
}

function isImage(path, contentType = "") {
  return (
    contentType.startsWith("image/") || /\.(gif|jpe?g|png|svg)$/i.test(path)
  );
}

function isVideo(path, contentType = "") {
  return contentType.startsWith("video/") || /\.(mp4|mov|webm)$/i.test(path);
}

function copyMedia(sourcePath, outputDir, targetBase, fallbackExt) {
  if (!sourcePath) {
    return "";
  }

  mkdirSync(outputDir, { recursive: true });
  const ext = extname(sourcePath) || fallbackExt;
  const targetPath = join(outputDir, `${targetBase}${ext}`);
  copyFileSync(sourcePath, targetPath);
  return targetPath;
}

function writeOutput(key, value) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) {
    const escaped = String(value).replaceAll("\n", "%0A");
    writeFileSync(outputPath, `${key}=${escaped}\n`, { flag: "a" });
  }
  console.log(`${key}=${value}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const resultsPath = resolveWithinCwd(
    "results",
    args.results || "test-results-live/results.json",
  );
  const testResultsDir = resolveWithinCwd(
    "test-results-dir",
    args.test_results_dir || "test-results-live",
  );
  const outputDir = resolveWithinCwd(
    "output-dir",
    args.output_dir || "test-results-live/media",
  );
  const results = readJson(resultsPath);

  const attachments = collectPlaywrightAttachments(results);
  const files = collectFiles(testResultsDir).map((path) => ({
    contentType: "",
    path,
  }));
  const candidates = [...attachments, ...files];

  const screenshot = candidates.find((candidate) =>
    isImage(candidate.path, candidate.contentType),
  );
  const video = candidates.find((candidate) =>
    isVideo(candidate.path, candidate.contentType),
  );

  const screenshotPath = copyMedia(
    screenshot?.path,
    outputDir,
    "live-agent-response",
    ".png",
  );
  const videoPath = copyMedia(
    video?.path,
    outputDir,
    "live-agent-recording",
    ".webm",
  );

  writeOutput("screenshot_path", screenshotPath);
  writeOutput("video_path", videoPath);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
