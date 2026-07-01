/**
 * AgentProfilesService wraps the SDK's AgentProfilesClient, creating a client
 * per-call so it always picks up the active backend's host/apiKey (same pattern
 * as ProfilesService / SettingsService).
 *
 * Backs the Settings → Agent profiles library + reused agent editor. The
 * `/api/agent-profiles` endpoints shipped in agent-server v1.29.0 and exist
 * only on local backends (cloud has no such surface yet, epic #3730).
 */
import { AgentProfilesClient } from "@openhands/typescript-client/clients";
import type {
  AgentProfile,
  AgentProfileSummary,
  AgentProfileSaveInput,
  AgentProfileListResponse,
  AgentProfileDetailResponse,
  AgentProfileMutationResponse,
  ActivateAgentProfileResponse,
} from "@openhands/typescript-client";
import { getAgentServerClientOptions } from "../agent-server-client-options";

// Re-export SDK types for consumers.
export type {
  AgentProfile,
  AgentProfileSummary,
  AgentProfileSaveInput,
  AgentProfileListResponse,
  AgentProfileDetailResponse,
  AgentProfileMutationResponse,
  ActivateAgentProfileResponse,
};

class AgentProfilesService {
  static async listProfiles(): Promise<AgentProfileListResponse> {
    return new AgentProfilesClient(
      getAgentServerClientOptions(),
    ).listAgentProfiles();
  }

  static async getProfile(name: string): Promise<AgentProfileDetailResponse> {
    return new AgentProfilesClient(
      getAgentServerClientOptions(),
    ).getAgentProfile(name);
  }

  /** Create or overwrite a profile by name (upsert). */
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
}

export default AgentProfilesService;
