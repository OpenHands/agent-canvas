import { RemoteWorkspace } from "@openhands/typescript-client/workspace/remote-workspace";
import { mapAnyGitStatusToClientStatus } from "#/utils/git-status-mapper";
import type { GitChange, GitChangeDiff } from "../open-hands.types";
import { getActiveBackend } from "../backend-registry/active-store";
import { callCloudProxy } from "../cloud/proxy";
import { getAgentServerClientOptions } from "../agent-server-client-options";

interface AgentServerGitChange {
  status: string;
  path: string;
  additions?: number | null;
  deletions?: number | null;
}

function readLineCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Git operations for agent-server conversations.
 *
 * In **local** mode the runtime is reachable directly from the browser
 * (it's `127.0.0.1:18000`); the SDK's `RemoteWorkspace` calls land
 * fine. In **cloud** mode the runtime is at
 * `*.prod-runtime.all-hands.dev`, which doesn't allow CORS from
 * `localhost`. So cloud-mode calls hit the cloud API's
 * `GET /api/v1/app-conversations/{id}/git/{changes,diff}` proxy
 * endpoints instead — the server resolves the conversation's runtime
 * and makes the hop itself with the sandbox's session API key, and the
 * cloud API's CORS is permissive for bearer-token requests.
 */

/**
 * The cloud runtime's `/api/git/{changes,diff}` endpoints prepend
 * `/workspace/` to relative paths (so a relative arg like
 * `workspace/project` becomes `/workspace/workspace/project` and 404s).
 * `getGitPath` returns the local agent-server's relative convention by
 * default; normalize to an absolute path before sending to the cloud
 * runtime.
 */
function toAbsoluteRuntimePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

class AgentServerGitService {
  static async getGitChanges(
    conversationId: string,
    conversationUrl: string | null | undefined,
    sessionApiKey: string | null | undefined,
    path: string,
  ): Promise<GitChange[]> {
    const active = getActiveBackend().backend;

    if (active.kind === "cloud" && conversationId) {
      const params = new URLSearchParams();
      params.set("path", toAbsoluteRuntimePath(path));
      const data = await callCloudProxy<AgentServerGitChange[]>({
        backend: active,
        method: "GET",
        path: `/api/v1/app-conversations/${conversationId}/git/changes?${params.toString()}`,
      });
      if (!Array.isArray(data)) {
        throw new Error(
          "Invalid response from runtime - runtime may be unavailable",
        );
      }
      return data.map((change) => ({
        status: mapAnyGitStatusToClientStatus(
          String(change.status) as Parameters<
            typeof mapAnyGitStatusToClientStatus
          >[0],
        ),
        path: change.path,
        additions: readLineCount(change.additions),
        deletions: readLineCount(change.deletions),
      }));
    }

    const changes = await new RemoteWorkspace(
      getAgentServerClientOptions({ conversationUrl, sessionApiKey }),
    ).gitChanges(path, { ref: "HEAD" });

    if (!Array.isArray(changes)) {
      throw new Error(
        "Invalid response from runtime - runtime may be unavailable",
      );
    }

    return changes.map((change) => ({
      status: mapAnyGitStatusToClientStatus(
        String(change.status) as Parameters<
          typeof mapAnyGitStatusToClientStatus
        >[0],
      ),
      path: change.path,
      additions: readLineCount((change as { additions?: unknown }).additions),
      deletions: readLineCount((change as { deletions?: unknown }).deletions),
    }));
  }

  static async getGitChangeDiff(
    conversationId: string,
    conversationUrl: string | null | undefined,
    sessionApiKey: string | null | undefined,
    path: string,
  ): Promise<GitChangeDiff> {
    const active = getActiveBackend().backend;

    if (active.kind === "cloud" && conversationId) {
      const params = new URLSearchParams();
      params.set("path", toAbsoluteRuntimePath(path));
      const diff = await callCloudProxy<GitChangeDiff & { diff?: string }>({
        backend: active,
        method: "GET",
        path: `/api/v1/app-conversations/${conversationId}/git/diff?${params.toString()}`,
      });
      return {
        modified: diff?.modified ?? "",
        original: diff?.original ?? "",
        ...(diff?.diff ? { diff: diff.diff } : {}),
      } as GitChangeDiff;
    }

    const diff = (await new RemoteWorkspace(
      getAgentServerClientOptions({ conversationUrl, sessionApiKey }),
    ).gitDiff(path, { ref: "HEAD" })) as GitChangeDiff & { diff?: string };

    return {
      modified: diff.modified ?? "",
      original: diff.original ?? "",
      ...(diff.diff ? { diff: diff.diff } : {}),
    } as GitChangeDiff;
  }
}

export default AgentServerGitService;
