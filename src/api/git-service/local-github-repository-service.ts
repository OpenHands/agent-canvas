import AgentServerRuntimeService from "#/api/runtime-service/agent-server-runtime-service";
import { Branch, GitRepository } from "#/types/git";
import { Provider } from "#/types/settings";

export interface LocalRepositoryInput {
  fullName: string;
  cloneUrl: string;
  defaultBranch: string | null;
  isPrivate: boolean;
  pushedAt: string | null;
}

export interface LocalRepositoryBranch {
  name: string;
  commitSha: string;
  protected: boolean;
}

export interface CloneLocalRepositoryResult {
  path: string;
  repository: LocalRepositoryInput;
  branch: LocalRepositoryBranch;
}

const GITHUB_REPOSITORY_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const MANAGED_REPOSITORY_ROOT = "/projects";

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function normalizeRepositoryName(value: string): string {
  const trimmed = value.trim();
  const withoutUrl = trimmed
    .replace(/^https:\/\/github\.com\//, "")
    .replace(/^git@github\.com:/, "")
    .replace(/\.git$/, "");

  if (!GITHUB_REPOSITORY_RE.test(withoutUrl)) {
    throw new Error("Repository must be a GitHub owner/repo name.");
  }

  return withoutUrl;
}

function repositoryDirectoryName(fullName: string): string {
  return normalizeRepositoryName(fullName).split("/")[1];
}

function readGithubTokenShellSnippet(): string {
  return [
    'token="${GITHUB_TOKEN:-}"',
    'if [ -z "$token" ] && [ -f "$HOME/.git-credentials" ]; then',
    "  token=$(sed -nE 's#https://[^:]+:([^@]+)@github.com#\\1#p' \"$HOME/.git-credentials\" | head -1)",
    "fi",
    'if [ -z "$token" ] && [ -f /opt/spotwise-agent/state/git/.git-credentials ]; then',
    "  token=$(sed -nE 's#https://[^:]+:([^@]+)@github.com#\\1#p' /opt/spotwise-agent/state/git/.git-credentials | head -1)",
    "fi",
    'if [ -z "$token" ]; then',
    "  echo 'No GitHub token found. Set GITHUB_TOKEN or mount ~/.git-credentials into the backend.' >&2",
    "  exit 42",
    "fi",
  ].join("\n");
}

async function runBackendCommand(
  command: string,
  cwd = MANAGED_REPOSITORY_ROOT,
  timeout = 30,
) {
  const result = await AgentServerRuntimeService.executeCommand(
    null,
    null,
    command,
    cwd,
    timeout,
  );

  if (result.exit_code !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim());
  }

  return result.stdout;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function toRepository(value: unknown): LocalRepositoryInput | null {
  const item = asRecord(value);
  if (!item || typeof item.full_name !== "string") return null;

  const fullName = normalizeRepositoryName(item.full_name);
  const cloneUrl =
    typeof item.clone_url === "string"
      ? item.clone_url
      : `https://github.com/${fullName}.git`;

  return {
    fullName,
    cloneUrl,
    defaultBranch:
      typeof item.default_branch === "string" ? item.default_branch : null,
    isPrivate: item.private === true,
    pushedAt: typeof item.pushed_at === "string" ? item.pushed_at : null,
  };
}

function repositoryToGitRepository(repository: LocalRepositoryInput) {
  return {
    id: repository.fullName,
    full_name: repository.fullName,
    git_provider: "github" as Provider,
    is_public: !repository.isPrivate,
    pushed_at: repository.pushedAt ?? undefined,
    main_branch: repository.defaultBranch ?? undefined,
  };
}

function toBranch(value: unknown): LocalRepositoryBranch | null {
  const item = asRecord(value);
  if (!item || typeof item.name !== "string") return null;
  const commit = asRecord(item.commit);

  return {
    name: item.name,
    commitSha: typeof commit?.sha === "string" ? commit.sha : "",
    protected: item.protected === true,
  };
}

function branchToGitBranch(branch: LocalRepositoryBranch): Branch {
  return {
    name: branch.name,
    commit_sha: branch.commitSha,
    protected: branch.protected,
  };
}

export function parseLocalRepositoryInput(value: string): {
  fullName: string;
  directoryName: string;
  cloneUrl: string;
} {
  const fullName = normalizeRepositoryName(value);
  return {
    fullName,
    directoryName: repositoryDirectoryName(fullName),
    cloneUrl: `https://github.com/${fullName}.git`,
  };
}

class LocalGithubRepositoryService {
  static async listRepositories(): Promise<GitRepository[]> {
    const command = [
      "set -euo pipefail",
      readGithubTokenShellSnippet(),
      "installation_url='https://api.github.com/installation/repositories?per_page=100'",
      "user_url='https://api.github.com/user/repos?affiliation=owner,collaborator,organization_member&sort=updated&per_page=100'",
      'response=$(curl -sS -H "Accept: application/vnd.github+json" -H "Authorization: Bearer $token" -H "X-GitHub-Api-Version: 2022-11-28" -w \'\\n__HTTP_STATUS__:%{http_code}\' "$installation_url" || true)',
      "status=${response##*__HTTP_STATUS__:}",
      "body=${response%__HTTP_STATUS__:*}",
      'if [ "$status" = "200" ]; then',
      "  printf '%s' \"$body\"",
      "else",
      '  curl -fsS -H "Accept: application/vnd.github+json" -H "Authorization: Bearer $token" -H "X-GitHub-Api-Version: 2022-11-28" "$user_url"',
      "fi",
    ].join("\n");

    const stdout = await runBackendCommand(
      command,
      MANAGED_REPOSITORY_ROOT,
      30,
    );
    const payload = JSON.parse(stdout) as unknown;
    const values = Array.isArray(payload)
      ? payload
      : ((asRecord(payload)?.repositories as unknown[] | undefined) ?? []);

    return values
      .map(toRepository)
      .filter((repo): repo is LocalRepositoryInput => repo !== null)
      .map(repositoryToGitRepository)
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
  }

  static async listBranches(fullName: string): Promise<Branch[]> {
    const normalized = normalizeRepositoryName(fullName);
    const command = [
      "set -euo pipefail",
      readGithubTokenShellSnippet(),
      `curl -fsS -H "Accept: application/vnd.github+json" -H "Authorization: Bearer $token" -H "X-GitHub-Api-Version: 2022-11-28" ${shellQuote(`https://api.github.com/repos/${normalized}/branches?per_page=100`)}`,
    ].join("\n");

    const stdout = await runBackendCommand(
      command,
      MANAGED_REPOSITORY_ROOT,
      30,
    );
    const payload = JSON.parse(stdout) as unknown;
    const branches = Array.isArray(payload) ? payload : [];

    return branches
      .map(toBranch)
      .filter((branch): branch is LocalRepositoryBranch => branch !== null)
      .map(branchToGitBranch);
  }

  static async cloneRepository(
    repository: GitRepository,
    branch?: Branch | null,
  ): Promise<CloneLocalRepositoryResult> {
    const parsed = parseLocalRepositoryInput(repository.full_name);
    const branchName = branch?.name || repository.main_branch || "";
    const destination = `${MANAGED_REPOSITORY_ROOT}/${parsed.directoryName}`;
    const quotedDestination = shellQuote(destination);
    const checkoutBranch = branchName.trim();
    const command = [
      "set -euo pipefail",
      `repo=${shellQuote(parsed.fullName)}`,
      `url=${shellQuote(parsed.cloneUrl)}`,
      `dest=${quotedDestination}`,
      `branch=${shellQuote(checkoutBranch)}`,
      `mkdir -p ${shellQuote(MANAGED_REPOSITORY_ROOT)}`,
      'if [ ! -d "$dest/.git" ]; then',
      '  git clone "$url" "$dest"',
      "else",
      '  git -C "$dest" remote set-url origin "$url"',
      '  if git -C "$dest" diff --quiet && git -C "$dest" diff --cached --quiet; then',
      '    git -C "$dest" fetch --prune origin',
      "  else",
      '    echo "Existing checkout is dirty; skipping fetch before opening worktree source." >&2',
      "  fi",
      "fi",
      'git config --global --add safe.directory "$dest" >/dev/null 2>&1 || true',
      'if [ -n "$branch" ]; then',
      '  if git -C "$dest" show-ref --verify --quiet "refs/remotes/origin/$branch"; then',
      '    if git -C "$dest" show-ref --verify --quiet "refs/heads/$branch"; then',
      '      git -C "$dest" checkout "$branch"',
      "    else",
      '      git -C "$dest" checkout -b "$branch" "origin/$branch"',
      "    fi",
      '  elif git -C "$dest" show-ref --verify --quiet "refs/heads/$branch"; then',
      '    git -C "$dest" checkout "$branch"',
      "  fi",
      "fi",
      "printf '%s' \"$dest\"",
    ].join("\n");

    const path = (
      await runBackendCommand(command, MANAGED_REPOSITORY_ROOT, 120)
    )
      .trim()
      .split("\n")
      .pop()
      ?.trim();

    if (!path) throw new Error("Clone finished without returning a path.");

    return {
      path,
      repository: {
        fullName: parsed.fullName,
        cloneUrl: parsed.cloneUrl,
        defaultBranch: repository.main_branch ?? null,
        isPrivate: !repository.is_public,
        pushedAt: repository.pushed_at ?? null,
      },
      branch: {
        name: checkoutBranch || repository.main_branch || "main",
        commitSha: branch?.commit_sha ?? "",
        protected: branch?.protected ?? false,
      },
    };
  }
}

export default LocalGithubRepositoryService;
