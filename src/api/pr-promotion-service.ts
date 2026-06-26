import AgentServerRuntimeService from "./runtime-service/agent-server-runtime-service";
import type { CheckApproval } from "#/utils/check-approval";
import type { CheckResult } from "#/utils/check-result";
import {
  buildCheckPrPromotion,
  buildPullRequestBody,
  CHECK_PR_PROMOTION_PATH,
  CheckPrPromotion,
  PR_BODY_BRANCH_PLACEHOLDER,
  PR_BODY_REPO_PLACEHOLDER,
  type CheckPrPromotion as CheckPrPromotionRecord,
  type CheckPrPromotionStatus,
} from "#/utils/check-pr-promotion";

const PR_PROMOTION_OUTPUT_PREFIX = "SPOTWISE_PR_PROMOTION_RESULT=";
const DEFAULT_PR_TITLE = "Agent Canvas verified changes";
const GITHUB_HOST = "github.com";

interface PromotionCommandResult {
  status: CheckPrPromotionStatus;
  url: string;
  number: number;
  branch: string;
  base: string;
}

interface PromoteApprovedCheckInput {
  conversationUrl: string | null | undefined;
  sessionApiKey: string | null | undefined;
  workingDir: string;
  conversationTitle: string | null | undefined;
  conversationLink: string | null;
  promotedBy: string;
  result: CheckResult;
  approval: CheckApproval;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function encodeBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function buildPromotionScriptCommand(title: string, body: string): string {
  const titleB64 = encodeBase64Utf8(title);
  const bodyB64 = encodeBase64Utf8(body);

  return `PR_TITLE_B64=${shellQuote(titleB64)} PR_BODY_B64=${shellQuote(
    bodyB64,
  )} python3 - <<'PY'
import base64
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

PREFIX = ${JSON.stringify(PR_PROMOTION_OUTPUT_PREFIX)}
GITHUB_HOST = ${JSON.stringify(GITHUB_HOST)}
REPO_PLACEHOLDER = ${JSON.stringify(PR_BODY_REPO_PLACEHOLDER)}
BRANCH_PLACEHOLDER = ${JSON.stringify(PR_BODY_BRANCH_PLACEHOLDER)}


def run(args, input_text=None, check=True):
    completed = subprocess.run(
        args,
        input=input_text,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if check and completed.returncode != 0:
        sys.stderr.write(completed.stderr or completed.stdout)
        sys.exit(completed.returncode)
    return completed


def decode_env(name):
    return base64.b64decode(os.environ[name]).decode("utf-8")


def parse_repo(remote_url):
    ssh_match = re.match(r"^git@github\\.com:([^/]+/.+?)(?:\\.git)?$", remote_url)
    if ssh_match:
        return ssh_match.group(1)

    parsed = urllib.parse.urlparse(remote_url)
    if parsed.hostname != GITHUB_HOST:
        raise RuntimeError("Only GitHub origins can be promoted")
    path = parsed.path.strip("/")
    if path.endswith(".git"):
        path = path[:-4]
    if len(path.split("/")) != 2:
        raise RuntimeError("GitHub origin must be owner/repo")
    return path


def default_base_branch():
    symbolic = run(
        ["git", "symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"],
        check=False,
    )
    if symbolic.returncode == 0 and symbolic.stdout.strip().startswith("origin/"):
        return symbolic.stdout.strip().split("/", 1)[1]

    remote_show = run(["git", "remote", "show", "origin"], check=False)
    if remote_show.returncode == 0:
        for line in remote_show.stdout.splitlines():
            if "HEAD branch:" in line:
                return line.rsplit(":", 1)[1].strip()

    return "main"


def read_github_token():
    credentials = run(
        ["git", "credential", "fill"],
        input_text=f"protocol=https\\nhost={GITHUB_HOST}\\n\\n",
        check=False,
    )
    for line in credentials.stdout.splitlines():
        if line.startswith("password="):
            token = line.split("=", 1)[1].strip()
            if token:
                return token
    raise RuntimeError("No GitHub token available from git credentials")


def github_json(token, method, path, payload=None):
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        f"https://api.github.com{path}",
        data=data,
        method=method,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"GitHub API {method} {path} failed: {exc.code} {raw}") from exc


def main():
    title = decode_env("PR_TITLE_B64")
    body = decode_env("PR_BODY_B64")

    branch = run(["git", "rev-parse", "--abbrev-ref", "HEAD"]).stdout.strip()
    if branch == "HEAD":
        raise RuntimeError("Cannot promote a detached HEAD")

    base = default_base_branch()
    if branch == base:
        raise RuntimeError("Cannot promote the default branch to itself")

    dirty = run(["git", "status", "--porcelain"]).stdout.strip()
    if dirty:
        run(["git", "add", "-A"])
        run([
            "git",
            "commit",
            "-m",
            title,
            "-m",
            "Promoted from approved Agent Canvas verification evidence.",
        ])

    remote_url = run(["git", "remote", "get-url", "origin"]).stdout.strip()
    repo = parse_repo(remote_url)
    owner = repo.split("/", 1)[0]
    body = body.replace(REPO_PLACEHOLDER, repo).replace(
        BRANCH_PLACEHOLDER,
        urllib.parse.quote(branch, safe=""),
    )

    run(["git", "push", "-u", "origin", "HEAD"])

    token = read_github_token()
    query = urllib.parse.urlencode({"state": "open", "head": f"{owner}:{branch}"})
    existing = github_json(token, "GET", f"/repos/{repo}/pulls?{query}") or []
    existing = [item for item in existing if item.get("base", {}).get("ref") == base]

    if existing:
        pr = github_json(
            token,
            "PATCH",
            f"/repos/{repo}/pulls/{existing[0]['number']}",
            {"title": title, "body": body},
        )
        status = "updated"
    else:
        pr = github_json(
            token,
            "POST",
            f"/repos/{repo}/pulls",
            {"title": title, "head": branch, "base": base, "body": body, "draft": True},
        )
        status = "created"

    print(PREFIX + json.dumps({
        "status": status,
        "url": pr["html_url"],
        "number": pr["number"],
        "branch": branch,
        "base": base,
    }))


try:
    main()
except Exception as exc:
    sys.stderr.write(str(exc) + "\n")
    sys.exit(1)
PY`;
}

function parsePromotionCommandResult(stdout: string): PromotionCommandResult {
  const line = stdout
    .split("\n")
    .find((entry) => entry.startsWith(PR_PROMOTION_OUTPUT_PREFIX));
  if (!line) throw new Error("PR promotion did not return a result");

  const parsed = JSON.parse(line.slice(PR_PROMOTION_OUTPUT_PREFIX.length));
  const promotion = CheckPrPromotion.parse(
    JSON.stringify({
      version: 1,
      promotedAt: new Date().toISOString(),
      promotedBy: "promotion-parser",
      resultCreatedAt: null,
      approvalApprovedAt: null,
      ...parsed,
    }),
  );
  if (!promotion) throw new Error("PR promotion returned an invalid result");

  return {
    status: promotion.status,
    url: promotion.url,
    number: promotion.number,
    branch: promotion.branch,
    base: promotion.base,
  };
}

class PrPromotionService {
  static async promoteApprovedCheck({
    conversationUrl,
    sessionApiKey,
    workingDir,
    conversationTitle,
    conversationLink,
    promotedBy,
    result,
    approval,
  }: PromoteApprovedCheckInput): Promise<CheckPrPromotionRecord> {
    if (result.status !== "passed") {
      throw new Error("Only passed check results can be promoted");
    }
    if (approval.status !== "approved") {
      throw new Error("Only approved evidence can be promoted");
    }

    const title = conversationTitle?.trim() || DEFAULT_PR_TITLE;
    const body = buildPullRequestBody({
      conversationUrl: conversationLink,
      result,
      approval,
    });
    const command = buildPromotionScriptCommand(title, body);
    const commandResult = await AgentServerRuntimeService.executeCommand(
      conversationUrl,
      sessionApiKey,
      command,
      workingDir,
      120,
    );

    if (commandResult.exit_code !== 0) {
      throw new Error(commandResult.stderr.trim() || "PR promotion failed");
    }

    const promotionResult = parsePromotionCommandResult(commandResult.stdout);
    const promotion = buildCheckPrPromotion({
      ...promotionResult,
      promotedBy,
      resultCreatedAt: result.createdAt,
      approvalApprovedAt: approval.approvedAt,
    });

    await AgentServerRuntimeService.writeTextFile(
      conversationUrl,
      sessionApiKey,
      CHECK_PR_PROMOTION_PATH,
      CheckPrPromotion.stringify(promotion),
      workingDir,
    );

    return promotion;
  }
}

export default PrPromotionService;
