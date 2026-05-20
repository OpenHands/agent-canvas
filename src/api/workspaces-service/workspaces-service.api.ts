/**
 * WorkspacesService talks to the agent-server's /api/workspaces endpoints,
 * which persist the user's saved workspaces and workspace parents on the
 * server (workspace/.openhands/workspaces.json). All clients pointed at
 * the same agent-server see the same list.
 *
 * No SDK client exists for this resource yet, so we call HttpClient directly
 * — the same pattern used elsewhere (e.g. switch_llm in the conversation
 * service). The lint test at src/api/no-direct-agent-server-calls.test.ts
 * allows HttpClient and only rejects raw axios / createHttpClient.
 */
import { HttpClient } from "@openhands/typescript-client/client/http-client";

import { LocalWorkspace, LocalWorkspaceParent } from "#/types/workspace";

import { getAgentServerHttpClientOptions } from "../agent-server-client-options";

export interface WorkspacesListResponse {
  workspaces: LocalWorkspace[];
  workspaceParents: LocalWorkspaceParent[];
}

function client() {
  return new HttpClient(getAgentServerHttpClientOptions());
}

class WorkspacesService {
  static async listWorkspaces(): Promise<WorkspacesListResponse> {
    const res = await client().get<WorkspacesListResponse>("/api/workspaces");
    return res.data;
  }

  static async addWorkspaces(
    items: LocalWorkspace[],
  ): Promise<WorkspacesListResponse> {
    const res = await client().post<WorkspacesListResponse>("/api/workspaces", {
      workspaces: items,
    });
    return res.data;
  }

  static async removeWorkspace(path: string): Promise<void> {
    await client().delete(`/api/workspaces?path=${encodeURIComponent(path)}`);
  }

  static async addWorkspaceParents(
    items: LocalWorkspaceParent[],
  ): Promise<WorkspacesListResponse> {
    const res = await client().post<WorkspacesListResponse>(
      "/api/workspaces/parents",
      { parents: items },
    );
    return res.data;
  }

  static async removeWorkspaceParent(path: string): Promise<void> {
    await client().delete(
      `/api/workspaces/parents?path=${encodeURIComponent(path)}`,
    );
  }
}

export default WorkspacesService;
