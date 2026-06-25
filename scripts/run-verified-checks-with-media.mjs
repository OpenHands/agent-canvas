#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import {
  buildChecksMediaPaths,
  buildChecksMediaRunId,
  buildRawGithubChecksMediaBaseUrl,
  DEFAULT_CHECKS_MEDIA_BRANCH,
  DEFAULT_CHECKS_MEDIA_PREFIX,
  DEFAULT_CHECKS_MEDIA_REMOTE,
  DEFAULT_CHECKS_MEDIA_WORKTREE,
  getDefaultVerifiedCommand,
  git,
  normalizeMediaPathPrefix,
  parseGithubRemoteUrl,
  prepareChecksMediaCheckout,
  publishChecksMediaCheckout,
  run,
} from "./checks-media-runner.mjs";

function env(name, fallback) {
  const value = process.env[name]?.trim();
  return value || fallback;
}

function log(message) {
  process.stderr.write(`${message}\n`);
}

const repoRoot = git(["rev-parse", "--show-toplevel"]).stdout.trim();
const sha = git(["rev-parse", "--short=8", "HEAD"], { cwd: repoRoot }).stdout.trim();
const remote = env("CHECKS_MEDIA_REMOTE", DEFAULT_CHECKS_MEDIA_REMOTE);
const remoteUrl = env(
  "CHECKS_MEDIA_REMOTE_URL",
  git(["remote", "get-url", remote], { cwd: repoRoot }).stdout.trim(),
);
const branch = env("CHECKS_MEDIA_BRANCH", DEFAULT_CHECKS_MEDIA_BRANCH);
const pathPrefix = normalizeMediaPathPrefix(
  env("CHECKS_MEDIA_PATH_PREFIX", DEFAULT_CHECKS_MEDIA_PREFIX),
);
const runId = env("CHECKS_MEDIA_RUN_ID", buildChecksMediaRunId({ sha }));
const worktreePath = env("CHECKS_MEDIA_WORKTREE", DEFAULT_CHECKS_MEDIA_WORKTREE);
const { checkoutDir, outputDir } = buildChecksMediaPaths({
  repoRoot,
  worktreePath,
  pathPrefix,
  runId,
});

const parsedRemote = parseGithubRemoteUrl(remoteUrl);
const baseUrl = env(
  "CHECKS_MEDIA_BASE_URL",
  parsedRemote
    ? buildRawGithubChecksMediaBaseUrl({
        ...parsedRemote,
        branch,
        pathPrefix,
        runId,
      })
    : "",
);

if (!baseUrl) {
  throw new Error(
    "Could not derive CHECKS_MEDIA_BASE_URL from the git remote. Set CHECKS_MEDIA_BASE_URL explicitly.",
  );
}

const command = getDefaultVerifiedCommand(process.argv.slice(2));
log(`checks media branch: ${branch}`);
log(`checks media output: ${outputDir}`);
log(`checks media URL:    ${baseUrl}`);
log(`verified command:    ${command.join(" ")}`);

prepareChecksMediaCheckout({
  repoRoot,
  remote,
  remoteUrl,
  branch,
  checkoutDir,
});
mkdirSync(outputDir, { recursive: true });

const result = run(command[0], command.slice(1), {
  cwd: repoRoot,
  stdio: "inherit",
  check: false,
  env: {
    ...process.env,
    EMIT_CHECKS: "1",
    CHECKS_MEDIA_DIR: outputDir,
    CHECKS_MEDIA_BASE_URL: baseUrl,
  },
});

const published = publishChecksMediaCheckout({
  checkoutDir,
  branch,
  remote,
  message: `Publish checks media for ${sha}`,
});
if (published) log("checks media published");
else log("checks media unchanged; nothing to publish");

process.exit(result.status ?? 1);
