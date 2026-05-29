import { useQuery } from "@tanstack/react-query";

import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useRuntimeIsReady } from "#/hooks/use-runtime-is-ready";
import { useBashCommandRunner } from "#/hooks/use-bash-command-runner";
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


  run: RunCommand,
  directory: string,
): Promise<LocalGitInfo> {
  const result = await run(GIT_INFO_COMMAND, directory, 10);
  if (result.exit_code !== 0) return EMPTY_LOCAL_GIT_INFO;

  const nl = result.stdout.indexOf("\n");
  const remoteUrl = (
    nl >= 0 ? result.stdout.slice(0, nl) : result.stdout
  ).trim();
  const rawBranch = (nl >= 0 ? result.stdout.slice(nl + 1) : "").trim();
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

/**
 * Probe git metadata for a **local** backend's workspace checkout by
 * shelling out via the agent server using a single consolidated bash
 * script (see `GIT_INFO_COMMAND`).
 *
 * Local-only by design. On cloud backends the conversation metadata
 * (`selected_repository`, `git_provider`, `selected_branch`) is the
 * source of truth, and probing via `/api/bash/execute_bash_command`
 * would (a) leak the user's local `getAgentServerWorkingDir()` path to
 * the cloud runtime when `workspace.working_dir` is missing, and
 * (b) hit a bash endpoint we don't want the frontend driving on cloud.
 *
 */
export const useLocalGitInfo = () => {
  const { data: conversation } = useActiveConversation();
  const runtimeIsReady = useRuntimeIsReady();
  const { backend } = useActiveBackend();
  const isLocalBackend = backend.kind === "local";

  const conversationId = conversation?.id;
  const conversationUrl = conversation?.conversation_url;
  const sessionApiKey = conversation?.session_api_key;
  const workingDir =
    conversation?.workspace?.working_dir?.trim() || getAgentServerWorkingDir();
  const attachedWorkspace =
    conversationId != null
      ? getStoredConversationMetadata(conversationId)?.selected_workspace?.trim()
      : null;
  const hasConversationRepo = !!conversation?.selected_repository;
  const hasConversationProvider = !!conversation?.git_provider;
  const hasConversationBranch = !!conversation?.selected_branch;
  const hasIncompleteRepoMetadata =
    !hasConversationRepo ||
    !hasConversationProvider ||
    !hasConversationBranch;

  const queryEnabled =
    isLocalBackend &&
    runtimeIsReady &&
    !!conversationId &&
    (!hasConversationRepo ||
      !hasConversationProvider ||
      !hasConversationBranch);

  // Persistent WebSocket connection to the bash-events endpoint. The
  // connection is opened when the query is enabled and closed on unmount or
  // when the conversation changes.
  const runCommand = useBashCommandRunner(
    conversationUrl,
    sessionApiKey,
    queryEnabled,
  );

  // Keep a ref so queryFn can call the latest runner without capturing it
  // as a queryKey dependency (runCommand is stable but the linter can't
  // infer that).
  const runCommandRef = useRef(runCommand);
  runCommandRef.current = runCommand;

  // runCommandRef is a ref (always stable); the linter cannot infer this so
  // we disable the exhaustive-deps check here.
  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  return useQuery<LocalGitInfo>({
    queryKey: [
      "local-git-info",
      conversationId,
      conversationUrl,
      sessionApiKey,
      workingDir,
      attachedWorkspace,
    ],
    queryFn: async () => {
      const run: RunCommand = (command, cwd, timeout) =>

    retry: false,
    // Re-probe the workspace every 10s so the UI reflects branch/repo
    // changes (e.g. `git checkout`, adding a remote) without requiring a
    // manual refresh when there is no `selected_repository` recorded on
    // the conversation. Commands now run over the persistent WebSocket
    // connection rather than individual REST calls.
    staleTime: 10_000,
    refetchInterval: 10_000,
    gcTime: 1000 * 60 * 5,
    meta: { disableToast: true },
  });
};
