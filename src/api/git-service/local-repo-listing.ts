import AgentServerRuntimeService from "#/api/runtime-service/agent-server-runtime-service";

/**
 * Repo/branch listing for Local (and self-hosted remote) backends.
 *
 * These backends have no cloud provider-search API, but the OpenHands runtime
 * ships the `gh` CLI and — when a `GITHUB_TOKEN` is present in the backend
 * environment — we can list the user's repositories and branches straight from
 * the GitHub API through the same runtime bash primitive used for cloning.
 * This mirrors how the OpenHands app populates its repo/branch pickers from the
 * user's provider token, giving local backends the same "pick, don't type" UX.
 */

export interface LocalRepo {
  full_name: string;
  default_branch: string | null;
}

async function runGh(command: string, timeout = 60): Promise<string> {
  const result = await AgentServerRuntimeService.executeCommand(
    null,
    null,
    command,
    undefined,
    timeout,
  );
  if (result.exit_code !== 0) {
    throw new Error(
      result.stderr?.trim() ||
        result.stdout?.trim() ||
        "gh command failed (is GITHUB_TOKEN set on this backend?)",
    );
  }
  return result.stdout || "";
}

/** List repositories the authenticated user can access (owner/collab/org). */
export async function listLocalRepositories(): Promise<LocalRepo[]> {
  const command =
    "gh api 'user/repos?per_page=100&sort=updated&" +
    "affiliation=owner,collaborator,organization_member' --paginate " +
    "--jq '.[] | [.full_name, (.default_branch // \"\")] | @tsv'";
  const out = await runGh(command, 90);
  return out
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [full_name, def] = line.split("\t");
      return { full_name, default_branch: def || null };
    })
    .filter((r) => !!r.full_name);
}

/** List branch names for a `owner/repo`. */
export async function listLocalBranches(fullName: string): Promise<string[]> {
  if (!fullName) return [];
  // `owner/repo` only ever contains [\w.-/]; strip anything else defensively.
  const safe = fullName.replace(/[^\w.\-/]/g, "");
  const command =
    `gh api 'repos/${safe}/branches?per_page=100' --paginate ` +
    "--jq '.[].name'";
  const out = await runGh(command, 60);
  return out
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}
