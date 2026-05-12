import { RemoteWorkspace } from "@openhands/typescript-client/workspace/remote-workspace";
import { mapAnyGitStatusToClientStatus } from "#/utils/git-status-mapper";
import { buildHttpBaseUrl } from "#/utils/websocket-url";
import type { GitChange, GitChangeDiff } from "../open-hands.types";
import { getActiveBackend } from "../backend-registry/active-store";
import { callCloudProxy } from "../cloud/proxy";
import { getAgentServerClientOptions } from "../agent-server-client-options";

interface AgentServerGitChange {
  status: string;
  path: string;
}

/**
 * Git operations for agent-server conversations.
 *
 * In **local** mode the runtime is reachable directly from the browser
 * (it's `127.0.0.1:18000`); the SDK's `RemoteWorkspace` calls land
 * fine. In **cloud** mode the runtime is at
 * `*.prod-runtime.all-hands.dev`, which doesn't allow CORS from
 * `localhost`. So cloud-mode calls go through `callCloudProxy` with the
 * runtime URL as `hostOverride` and the conversation's
 * `session_api_key` as the auth header — server-side hop, no CORS.
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
    conversationUrl: string | null | undefined,
    sessionApiKey: string | null | undefined,
    path: string,
  ): Promise<GitChange[]> {
    const active = getActiveBackend().backend;

    if (active.kind === "cloud" && conversationUrl) {
      const params = new URLSearchParams();
      params.set("path", toAbsoluteRuntimePath(path));
      const data = await callCloudProxy<AgentServerGitChange[]>({
        backend: active,
        method: "GET",
        hostOverride: buildHttpBaseUrl(conversationUrl),
        path: `/api/git/changes?${params.toString()}`,
        authMode: "session-api-key",
        sessionApiKey,
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
    }));
  }

  static async getGitChangeDiff(
    conversationUrl: string | null | undefined,
    sessionApiKey: string | null | undefined,
    path: string,
  ): Promise<GitChangeDiff> {
    const active = getActiveBackend().backend;

    if (active.kind === "cloud" && conversationUrl) {
      const params = new URLSearchParams();
      params.set("path", toAbsoluteRuntimePath(path));
      const diff = await callCloudProxy<GitChangeDiff & { diff?: string }>({
        backend: active,
        method: "GET",
        hostOverride: buildHttpBaseUrl(conversationUrl),
        path: `/api/git/diff?${params.toString()}`,
        authMode: "session-api-key",
        sessionApiKey,
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
