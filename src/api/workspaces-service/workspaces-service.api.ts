/**
 * WorkspacesService talks to the agent-server's /api/workspaces endpoints,
 * which persist the user's saved workspaces and workspace parents on the
 * server (workspace/.openhands/workspaces.json). All clients pointed at
 * the same agent-server see the same list.
 *
 * This service preflights workspace support through the SDK compatibility
 * helper so old agent-server backends fail with a typed version error instead
 * of surfacing a generic 404 from /api/workspaces.
 */
import {
  AgentServerFeatureRequirements,
  assertAgentServerSupports,
} from "@openhands/typescript-client/clients";
import { HttpClient } from "@openhands/typescript-client/client/http-client";

import { LocalWorkspace, LocalWorkspaceParent } from "#/types/workspace";

import { getAgentServerHttpClientOptions } from "../agent-server-client-options";

export interface WorkspacesListResponse {
  workspaces: LocalWorkspace[];
  workspaceParents: LocalWorkspaceParent[];
}

async function supportedClient() {
  const httpClient = new HttpClient(getAgentServerHttpClientOptions());
  await assertAgentServerSupports(
    httpClient,
    AgentServerFeatureRequirements.workspaces,
  );
  return httpClient;
}

class WorkspacesService {
  static async listWorkspaces(): Promise<WorkspacesListResponse> {
    const client = await supportedClient();
    const res = await client.get<WorkspacesListResponse>("/api/workspaces");
    return res.data;
  }

  static async addWorkspaces(
    items: LocalWorkspace[],
  ): Promise<WorkspacesListResponse> {
    const client = await supportedClient();
    const res = await client.post<WorkspacesListResponse>("/api/workspaces", {
      workspaces: items,
    });
    return res.data;
  }

  static async removeWorkspace(path: string): Promise<void> {
    const client = await supportedClient();
    await client.delete(`/api/workspaces?path=${encodeURIComponent(path)}`);
  }

  static async addWorkspaceParents(
    items: LocalWorkspaceParent[],
  ): Promise<WorkspacesListResponse> {
    const client = await supportedClient();
    const res = await client.post<WorkspacesListResponse>(
      "/api/workspaces/parents",
      { parents: items },
    );
    return res.data;
  }

  static async removeWorkspaceParent(path: string): Promise<void> {
    const client = await supportedClient();
    await client.delete(
      `/api/workspaces/parents?path=${encodeURIComponent(path)}`,
    );
  }
}

export default WorkspacesService;
