import { existsSync, mkdirSync, rmSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export const DEFAULT_CHECKS_MEDIA_BRANCH = "checks-media";
export const DEFAULT_CHECKS_MEDIA_PREFIX = ".checks";
export const DEFAULT_CHECKS_MEDIA_REMOTE = "origin";
export const DEFAULT_CHECKS_MEDIA_WORKTREE = ".tmp/checks-media-worktree";

export function parseGithubRemoteUrl(remoteUrl) {
  const trimmed = remoteUrl.trim();
  const sshMatch = trimmed.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);
  if (sshMatch) return { owner: sshMatch[1], repo: sshMatch[2] };

  try {
    const url = new URL(trimmed);
    if (url.hostname !== "github.com") return null;
    const segments = url.pathname.replace(/^\/+|\/+$/g, "").split("/");
    if (segments.length < 2) return null;
    return {
      owner: segments[0],
      repo: segments[1].replace(/\.git$/, ""),
    };
  } catch {
    return null;
  }
}

export function normalizeMediaPathPrefix(value) {
  return value.trim().replace(/^\/+|\/+$/g, "") || DEFAULT_CHECKS_MEDIA_PREFIX;
}

export function buildChecksMediaRunId({ sha, now = new Date() }) {
  const cleanSha = (sha || "unknown").trim().slice(0, 8) || "unknown";
  return `${cleanSha}-${now.toISOString().replace(/[:.]/g, "-")}`;
}

export function buildRawGithubChecksMediaBaseUrl({
  owner,
  repo,
  branch,
  pathPrefix,
  runId,
}) {
  const segments = [owner, repo, branch, normalizeMediaPathPrefix(pathPrefix), runId]
    .flatMap((segment) => String(segment).split("/"))
    .filter(Boolean)
    .map(encodeURIComponent);
  return `https://raw.githubusercontent.com/${segments.join("/")}`;
}

export function buildChecksMediaPaths({
  repoRoot,
  worktreePath = DEFAULT_CHECKS_MEDIA_WORKTREE,
  pathPrefix = DEFAULT_CHECKS_MEDIA_PREFIX,
  runId,
}) {
  const checkoutDir = resolve(repoRoot, worktreePath);
  const outputDir = join(checkoutDir, normalizeMediaPathPrefix(pathPrefix), runId);
  return { checkoutDir, outputDir };
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: options.stdio ?? "pipe",
    cwd: options.cwd,
    env: options.env,
  });
  if (result.error) throw result.error;
  if (options.check !== false && result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(
      `command failed (${result.status ?? "signal"}): ${[command, ...args].join(" ")}${
        detail ? `\n${detail}` : ""
      }`,
    );
  }
  return result;
}

export function git(args, options = {}) {
  return run("git", args, options);
}

export function prepareChecksMediaCheckout({
  repoRoot,
  remote = DEFAULT_CHECKS_MEDIA_REMOTE,
  remoteUrl,
  branch = DEFAULT_CHECKS_MEDIA_BRANCH,
  checkoutDir,
}) {
  mkdirSync(dirname(checkoutDir), { recursive: true });

  if (!existsSync(join(checkoutDir, ".git"))) {
    rmSync(checkoutDir, { recursive: true, force: true });
    const clone = run(
      "git",
      ["clone", "--depth", "1", "--branch", branch, remoteUrl, checkoutDir],
      { cwd: repoRoot, check: false },
    );
    if (clone.status !== 0) {
      run("git", ["clone", "--no-checkout", remoteUrl, checkoutDir], {
        cwd: repoRoot,
      });
      if (remote !== "origin") {
        git(["remote", "rename", "origin", remote], {
          cwd: checkoutDir,
          check: false,
        });
      }
      git(["switch", "--orphan", branch], { cwd: checkoutDir });
      git(["rm", "-rf", "."], { cwd: checkoutDir, check: false });
    } else if (remote !== "origin") {
      git(["remote", "rename", "origin", remote], {
        cwd: checkoutDir,
        check: false,
      });
    }
    return;
  }

  const hasRemote = git(["remote", "get-url", remote], {
    cwd: checkoutDir,
    check: false,
  });
  if (hasRemote.status === 0) {
    git(["remote", "set-url", remote, remoteUrl], { cwd: checkoutDir });
  } else {
    git(["remote", "add", remote, remoteUrl], { cwd: checkoutDir });
  }
  const fetch = git(["fetch", remote, branch, "--depth", "1"], {
    cwd: checkoutDir,
    check: false,
  });
  if (fetch.status === 0) {
    git(["switch", "-C", branch, `${remote}/${branch}`], { cwd: checkoutDir });
    git(["reset", "--hard", `${remote}/${branch}`], { cwd: checkoutDir });
    git(["clean", "-fd"], { cwd: checkoutDir });
    return;
  }

  git(["switch", "--orphan", branch], { cwd: checkoutDir, check: false });
  git(["rm", "-rf", "."], { cwd: checkoutDir, check: false });
}

export function publishChecksMediaCheckout({
  checkoutDir,
  branch = DEFAULT_CHECKS_MEDIA_BRANCH,
  remote = DEFAULT_CHECKS_MEDIA_REMOTE,
  message,
}) {
  git(["add", "."], { cwd: checkoutDir });
  const diff = git(["diff", "--cached", "--quiet"], {
    cwd: checkoutDir,
    check: false,
  });
  if (diff.status === 0) return false;

  git(["commit", "-m", message], { cwd: checkoutDir, stdio: "inherit" });
  git(["push", "-u", remote, `HEAD:${branch}`], {
    cwd: checkoutDir,
    stdio: "inherit",
  });
  return true;
}

export function getDefaultVerifiedCommand(argv) {
  const defaultCommand = ["npx", "playwright", "test"];
  if (argv.length === 0) return [...defaultCommand, "--project=verified-dev"];
  if (argv[0]?.startsWith("-")) return [...defaultCommand, ...argv];
  return argv;
}

export function getRepoNameFallback(remoteUrl) {
  const parsed = parseGithubRemoteUrl(remoteUrl);
  return parsed?.repo ?? basename(process.cwd());
}
