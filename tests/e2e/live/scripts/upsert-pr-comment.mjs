#!/usr/bin/env node

import { readFileSync } from "node:fs";

const DEFAULT_MARKER = "<!-- agent-canvas-live-e2e-report -->";
const API_ROOT = process.env.GITHUB_API_URL ?? "https://api.github.com";

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

function requireValue(name, value) {
  if (!value) {
    throw new Error(`Missing required value: ${name}`);
  }
  return value;
}

async function githubRequest(method, path, token, body) {
  const response = await fetch(`${API_ROOT}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(
      `GitHub API ${method} ${path} failed with ${response.status}: ${text}`,
    );
  }
  return payload;
}

async function listIssueComments(repo, issueNumber, token) {
  const comments = [];
  for (let page = 1; page <= 10; page += 1) {
    const batch = await githubRequest(
      "GET",
      `/repos/${repo}/issues/${issueNumber}/comments?per_page=100&page=${page}`,
      token,
    );
    comments.push(...batch);
    if (batch.length < 100) {
      break;
    }
  }
  return comments;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const issueNumber =
    args.issue_number ??
    process.env.PR_NUMBER ??
    process.env.ISSUE_NUMBER ??
    "";

  if (!issueNumber) {
    console.log("Skipping PR comment because no PR number was provided.");
    return;
  }

  const repo = requireValue("repo", args.repo ?? process.env.GITHUB_REPOSITORY);
  const token = requireValue(
    "token",
    args.token ?? process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN,
  );
  const marker = args.marker ?? DEFAULT_MARKER;
  const bodyFile = requireValue("body-file", args.body_file);
  let body = readFileSync(bodyFile, "utf8");

  if (!body.includes(marker)) {
    body = `${marker}\n${body}`;
  }

  const comments = await listIssueComments(repo, issueNumber, token);
  const existing = comments.find((comment) => comment.body?.includes(marker));

  if (existing) {
    await githubRequest(
      "PATCH",
      `/repos/${repo}/issues/comments/${existing.id}`,
      token,
      { body },
    );
    console.log(`Updated PR comment ${existing.id}.`);
    return;
  }

  const created = await githubRequest(
    "POST",
    `/repos/${repo}/issues/${issueNumber}/comments`,
    token,
    { body },
  );
  console.log(`Created PR comment ${created.id}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
