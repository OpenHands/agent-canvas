import AgentServerRuntimeService from "#/api/runtime-service/agent-server-runtime-service";

/**
 * Managed location for repositories cloned via the home-page
 * "Open a Repository" flow on a Local backend. Matches the directory
 * proposed in OpenHands/agent-canvas#976 so clones land in a single,
 * predictable, opt-in place rather than scattered around the disk.
 *
 * `$HOME` is expanded by the remote shell on the agent-server, so this works
 * regardless of which user the runtime runs as.
 */
export const MANAGED_WORKSPACE_BASE =
  "$HOME/.openhands/agent-canvas/workspaces";

export interface ClonedRepository {
  /** Absolute path of the cloned repository on the agent-server runtime. */
  path: string;
  /** Directory / display name (last path segment, without `.git`). */
  name: string;
}

/** Single-quote a value for safe POSIX-shell embedding. */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Normalize free-form repository input into a clone URL and a directory name.
 *
 * Accepts:
 *   - `owner/repo`                  → `https://github.com/owner/repo`
 *   - `https://host/owner/repo.git` → used as-is
 *   - `git@host:owner/repo.git`     → used as-is
 *
 * Returns `null` when the input is empty or not a plausible repo reference.
 */
export function parseRepositoryInput(
  input: string,
): { url: string; name: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let url = trimmed;
  // Bare `owner/repo` shorthand → default to GitHub over HTTPS.
  if (/^[\w.-]+\/[\w.-]+$/.test(trimmed)) {
    url = `https://github.com/${trimmed}`;
  } else if (!/^(https?:\/\/|git@|ssh:\/\/)/i.test(trimmed)) {
    // Not a shorthand and not a recognized URL scheme → reject.
    return null;
  }

  const lastSegment = trimmed
    .replace(/\.git$/i, "")
    .split(/[/:]/)
    .filter(Boolean)
    .pop();
  if (!lastSegment) return null;

  return { url, name: lastSegment.replace(/\.git$/i, "") };
}

/**
 * Clone a repository on the active (local) agent-server into the managed
 * workspace directory and return its absolute path.
 *
 * This mirrors how the full OpenHands app clones a selected repository
 * *before* a conversation starts: a `git clone` executed in the runtime via
 * `/api/bash/execute_bash_command` (see `clone_or_init_git_repo` in
 * OpenHands `app_conversation_service_base.py`). Authentication relies on the
 * runtime's configured git credentials, exactly as the app relies on the
 * provider token it injects.
 *
 * If the repository is already present in the managed directory, the existing
 * checkout is reused (the clone is skipped) so re-opening is instant.
 */
export async function cloneLocalRepository(
  input: string,
  branch?: string,
): Promise<ClonedRepository> {
  const parsed = parseRepositoryInput(input);
  if (!parsed) {
    throw new Error(
      "Enter a repository as owner/repo or a full clone URL (https/ssh).",
    );
  }
  const { url, name } = parsed;

  const trimmedBranch = branch?.trim();
  const branchFlag = trimmedBranch
    ? `--branch ${shellQuote(trimmedBranch)} `
    : "";

  // `pwd` on the final line yields the absolute clone path we hand back as the
  // conversation's working directory.
  const command = [
    "set -e",
    // When a GITHUB_TOKEN is present in the backend environment, wire it into
    // git's credential helper so private github.com clones authenticate. This
    // uses the token on demand (no credentials persisted in the remote URL) and
    // is a no-op for non-github hosts. Failures are non-fatal (public clones
    // still work, and `gh` may be absent on some runtimes).
    'if [ -n "$GITHUB_TOKEN" ] && command -v gh >/dev/null 2>&1; then ' +
      "gh auth setup-git >/dev/null 2>&1 || true; fi",
    `mkdir -p ${MANAGED_WORKSPACE_BASE}`,
    `cd ${MANAGED_WORKSPACE_BASE}`,
    `if [ -d ${shellQuote(name)}/.git ]; then ` +
      `echo "[agent-canvas] reusing existing checkout"; ` +
      `else git clone ${branchFlag}${shellQuote(url)} ${shellQuote(name)}; fi`,
    `cd ${shellQuote(name)} && pwd`,
  ].join("; ");

  const result = await AgentServerRuntimeService.executeCommand(
    null,
    null,
    command,
    undefined,
    180,
  );

  if (result.exit_code !== 0) {
    throw new Error(
      result.stderr?.trim() || result.stdout?.trim() || "git clone failed",
    );
  }

  const path = result.stdout
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .pop();
  if (!path) {
    throw new Error("Could not resolve the cloned repository path.");
  }

  return { path, name };
}
