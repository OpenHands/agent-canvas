/**
 * AgentProfilesService wraps the SDK's AgentProfilesClient, creating a client
 * per-call so it always picks up the active backend's host/apiKey (same pattern
 * as ProfilesService / SettingsService).
 *
 * Backs the Settings → Agents profile library + kind-aware editor (#3726/#3728).
 * The `/api/agent-profiles` endpoints shipped in agent-server v1.29.0.
 */
import {
  AgentProfilesClient,
  type GetAgentProfileOptions,
} from "@openhands/typescript-client/clients";
import type {
  AgentProfile,
  AgentProfileSummary,
  AgentProfileSaveInput,
  AgentProfileDiagnostics,
  AgentProfileListResponse,
  AgentProfileDetailResponse,
  AgentProfileMutationResponse,
  ActivateAgentProfileResponse,
  ExposeSecretsMode,
} from "@openhands/typescript-client";
import { getAgentServerClientOptions } from "../agent-server-client-options";

// Re-export SDK types for consumers.
export type {
  AgentProfile,
  AgentProfileSummary,
  AgentProfileSaveInput,
  AgentProfileDiagnostics,
  AgentProfileListResponse,
  AgentProfileDetailResponse,
  AgentProfileMutationResponse,
  ActivateAgentProfileResponse,
  ExposeSecretsMode,
};

class AgentProfilesService {
  static async listProfiles(): Promise<AgentProfileListResponse> {
    return new AgentProfilesClient(
      getAgentServerClientOptions(),
    ).listAgentProfiles();
  }

  static async getProfile(
    name: string,
    exposeSecrets?: ExposeSecretsMode,
  ): Promise<AgentProfileDetailResponse> {
    const options: GetAgentProfileOptions = exposeSecrets
      ? { exposeSecrets }
      : {};
    return new AgentProfilesClient(
      getAgentServerClientOptions(),
    ).getAgentProfile(name, options);
  }

  static async saveProfile(
    name: string,
    profile: AgentProfileSaveInput,
  ): Promise<AgentProfileMutationResponse> {
    return new AgentProfilesClient(
      getAgentServerClientOptions(),
    ).saveAgentProfile(name, profile);
  }

  static async deleteProfile(
    name: string,
  ): Promise<AgentProfileMutationResponse> {
    return new AgentProfilesClient(
      getAgentServerClientOptions(),
    ).deleteAgentProfile(name);
  }

  static async renameProfile(
    name: string,
    newName: string,
  ): Promise<AgentProfileMutationResponse> {
    return new AgentProfilesClient(
      getAgentServerClientOptions(),
    ).renameAgentProfile(name, newName);
  }

  /** Activate by the profile's stable UUID `id` (pointer-only; never writes
   * agent_settings). */
  static async activateProfile(
    profileId: string,
  ): Promise<ActivateAgentProfileResponse> {
    return new AgentProfilesClient(
      getAgentServerClientOptions(),
    ).activateAgentProfile(profileId);
  }

  /** Dry-run resolve of LLM/MCP refs. Never throws on dangling refs — those are
   * reported in the body (`valid: false`, `dangling_mcp_server_refs`). */
  static async materializeProfile(
    name: string,
  ): Promise<AgentProfileDiagnostics> {
    return new AgentProfilesClient(
      getAgentServerClientOptions(),
    ).materializeAgentProfile(name);
  }
}

export default AgentProfilesService;
