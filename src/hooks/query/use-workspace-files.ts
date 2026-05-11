import { RemoteWorkspace } from "@openhands/typescript-client/workspace/remote-workspace";
import { useQuery } from "@tanstack/react-query";

import { getAgentServerClientOptions } from "#/api/agent-server-client-options";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useRuntimeIsReady } from "#/hooks/use-runtime-is-ready";

// Cap the number of files we render so a giant repo doesn't freeze the UI.
const MAX_FILES = 2000;

// Directory names that we never want to descend into when listing files.
const EXCLUDED_DIRS = [
  ".git",
  "node_modules",
  ".venv",
  "venv",
  "__pycache__",
  "dist",
  "build",
  ".next",
  ".cache",
  ".pytest_cache",
  ".mypy_cache",
  ".turbo",
  ".parcel-cache",
  "target",
];

// Build a `find` invocation that lists files relative to the workspace root.
function buildListCommand(): string {
  const pruneExpr = EXCLUDED_DIRS.map((dir) => `-name '${dir}' -prune`).join(
    " -o ",
  );
  return `find . \\( ${pruneExpr} \\) -o -type f -print 2>/dev/null | sort | head -n ${MAX_FILES}`;
}

function normalizePath(path: string): string {
  // Strip a leading "./" so paths render cleanly in the UI.
  return path.startsWith("./") ? path.slice(2) : path;
}

/**
 * Lists every regular file beneath the active conversation's working
 * directory, excluding common heavy/build directories. Returns paths relative
 * to the working dir (e.g. `src/index.html`).
 */
export function useWorkspaceFiles() {
  const { data: conversation } = useActiveConversation();
  const runtimeIsReady = useRuntimeIsReady();

  const conversationId = conversation?.id;
  const conversationUrl = conversation?.conversation_url;
  const sessionApiKey = conversation?.session_api_key;
  const workingDir = conversation?.workspace?.working_dir?.trim();

  return useQuery<string[]>({
    queryKey: [
      "workspace-files",
      conversationId,
      conversationUrl,
      sessionApiKey,
      workingDir,
    ],
    queryFn: async () => {
      const workspace = new RemoteWorkspace(
        getAgentServerClientOptions({
          conversationUrl,
          sessionApiKey,
        }),
      );

      const result = await workspace.executeCommand(
        buildListCommand(),
        workingDir,
        30,
      );

      if (result.exit_code !== 0) {
        throw new Error(
          result.stderr?.trim() || "Failed to list workspace files",
        );
      }

      const lines = result.stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map(normalizePath);

      // Defensive: keep results unique and bounded.
      return Array.from(new Set(lines)).slice(0, MAX_FILES);
    },
    enabled: runtimeIsReady && !!conversationId && !!workingDir,
    retry: false,
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 5,
    meta: { disableToast: true },
  });
}
