import { HttpClient } from "@openhands/typescript-client";
import {
  getAgentServerClientOptions,
  getAgentServerHttpClientOptions,
} from "./agent-server-client-options";

/**
 * Thin wrapper around the agent-server's dedicated `/agent-env` CRUD
 * endpoints (see software-agent-sdk PR #3420). These exist because
 * `acp_env` lives inside `agent_settings` as a `dict[str, str]` and the
 * generic `PATCH /api/settings` deep-merge has no "unset" primitive —
 * so single-key delete isn't expressible through it. The Secrets API
 * solves the identical problem with the same shape; this mirrors it.
 *
 * Local-backend only. The cloud app-server doesn't expose ACP env-vars.
 */
export interface AcpEnvVarItem {
  name: string;
}

interface AcpEnvVarsListResponse {
  env_vars: AcpEnvVarItem[];
}

function client(): HttpClient {
  return new HttpClient(getAgentServerHttpClientOptions());
}

export const AcpEnvService = {
  async list(): Promise<AcpEnvVarItem[]> {
    // Reach for the host directly via HttpClient — typescript-client's
    // SettingsClient doesn't expose these endpoints yet; once it does
    // we can swap to it without touching the call sites.
    const res = await client().get<AcpEnvVarsListResponse>(
      "/api/settings/agent-env",
    );
    return res.data.env_vars;
  },

  async upsert(name: string, value: string): Promise<AcpEnvVarItem> {
    const res = await client().put<AcpEnvVarItem>("/api/settings/agent-env", {
      name,
      value,
    });
    return res.data;
  },

  async delete(name: string): Promise<void> {
    await client().delete(
      `/api/settings/agent-env/${encodeURIComponent(name)}`,
    );
  },
};

// `getAgentServerClientOptions` is re-exported so test files can stub
// the host/apiKey resolution without reaching into the module internals.
export { getAgentServerClientOptions };
