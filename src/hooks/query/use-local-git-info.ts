import { useQuery } from "@tanstack/react-query";

import AgentServerRuntimeService, {
  CommandResult,
} from "#/api/runtime-service/agent-server-runtime-service";
import { getAgentServerWorkingDir } from "#/api/agent-server-config";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useRuntimeIsReady } from "#/hooks/use-runtime-is-ready";
import { Provider } from "#/types/settings";
import { parseGitRemoteUrl } from "#/utils/parse-git-remote-url";

export interface LocalGitInfo {
  repository: string | null;
  branch: string | null;
  provider: Provider | null;
  remoteUrl: string | null;
}

const EMPTY_LOCAL_GIT_INFO: LocalGitInfo = {
  repository: null,
  branch: null,
  provider: null,
  remoteUrl: null,
};

type RunCommand = (
  command: string,
  cwd: string,
  timeout: number,
) => Promise<CommandResult>;

async function probeGitInfoAtDir(
  run: RunCommand,
  directory: string,
): Promise<LocalGitInfo> {
  const [remoteResult, branchResult] = await Promise.all([
    run("git remote get-url origin", directory, 10),
    run("git rev-parse --abbrev-ref HEAD", directory, 10),
  ]);

  const remoteUrl =
    remoteResult.exit_code === 0 ? remoteResult.stdout.trim() : "";
  const rawBranch =
    branchResult.exit_code === 0 ? branchResult.stdout.trim() : "";
  const branch = rawBranch && rawBranch !== "HEAD" ? rawBranch : null;

  if (!remoteUrl && !branch) return EMPTY_LOCAL_GIT_INFO;

  const parsedRemote = parseGitRemoteUrl(remoteUrl);
  return {
    repository: parsedRemote?.repository ?? null,
    provider: parsedRemote?.provider ?? null,
    remoteUrl: remoteUrl || null,
    branch,
  };
}

async function probeNestedRepoInDir(
  run: RunCommand,
  directory: string,
): Promise<LocalGitInfo> {
  const nestedReposResult = await run(
    "find . -mindepth 2 -maxdepth 4 -name .git 2>/dev/null | sed 's#^\\./##' | sed 's#/.git$##'",
    directory,
    10,
  );

  if (nestedReposResult.exit_code !== 0) return EMPTY_LOCAL_GIT_INFO;

  const nestedRepos = Array.from(
    new Set(
      nestedReposResult.stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  );

  if (nestedRepos.length !== 1) return EMPTY_LOCAL_GIT_INFO;

  const nestedDir = `${directory}/${nestedRepos[0]}`.replace(/\/+/g, "/");
  return probeGitInfoAtDir(run, nestedDir);
}

/**
 * Probe git metadata directly from the workspace checkout via the agent server
 * (`git remote get-url origin`, `git rev-parse --abbrev-ref HEAD`).
 *
 * We intentionally keep this probe enabled until the active conversation has
 * a complete repo tuple (`selected_repository`, `git_provider`,
 * `selected_branch`) so the control bar can recover from partial metadata
 * hydration after connect/clone flows.
 *
 * Returns `null` fields when the working dir is not a git checkout — callers
 * should treat that the same as "no repo detected".
 */
export const useLocalGitInfo = () => {
  const { data: conversation } = useActiveConversation();
  const runtimeIsReady = useRuntimeIsReady();

  const conversationId = conversation?.id;
  const conversationUrl = conversation?.conversation_url;
  const sessionApiKey = conversation?.session_api_key;
  const workingDir =
    conversation?.workspace?.working_dir?.trim() || getAgentServerWorkingDir();
  const hasConversationRepo = !!conversation?.selected_repository;
  const hasConversationProvider = !!conversation?.git_provider;
  const hasConversationBranch = !!conversation?.selected_branch;

  return useQuery<LocalGitInfo>({
    queryKey: [
      "local-git-info",
      conversationId,
      conversationUrl,
      sessionApiKey,
      workingDir,
    ],
    queryFn: async () => {
      const run: RunCommand = (command, cwd, timeout) =>
        AgentServerRuntimeService.executeCommand(
          conversationUrl,
          sessionApiKey,
          command,
          cwd,
          timeout,
        );
      const directInfo = await probeGitInfoAtDir(run, workingDir);
      if (directInfo.repository || directInfo.branch) return directInfo;

      // Common local flow: user starts in a non-git parent workspace and
      // clones a single repository into a child directory.
      const nestedInfo = await probeNestedRepoInDir(run, workingDir);
      if (nestedInfo.repository || nestedInfo.branch) return nestedInfo;

      return EMPTY_LOCAL_GIT_INFO;
    },
    enabled:
      runtimeIsReady &&
      !!conversationId &&
      (!hasConversationRepo ||
        !hasConversationProvider ||
        !hasConversationBranch),
    retry: false,
    // Re-probe the workspace every 10s so the UI reflects branch/repo
    // changes (e.g. `git checkout`, adding a remote) without requiring a
    // manual refresh when there is no `selected_repository` recorded on
    // the conversation.
    staleTime: 10_000,
    refetchInterval: 10_000,
    gcTime: 1000 * 60 * 5,
    meta: { disableToast: true },
  });
};
