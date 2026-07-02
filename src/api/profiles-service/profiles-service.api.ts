/**
 * ProfilesService provides a thin wrapper around the SDK's ProfilesClient,
 * creating a client per-call to pick up current backend configuration.
 *
 * Uses ProfilesClient from @openhands/typescript-client v0.2.0+.
 * All types are re-exported from the SDK for consumer convenience.
 *
 * Note: Unlike some SDK clients, we don't call client.close() here for
 * consistency with other services (SettingsService, SecretsService) that
 * also create SDK clients without explicit cleanup. The SDK clients use
 * fetch-based HTTP which doesn't require connection cleanup.
 */
import {
  ProfilesClient,
  type GetProfileOptions,
} from "@openhands/typescript-client/clients";
import type {
  ProfileInfo,
  ProfileListResponse,
  ProfileDetailResponse,
  ProfileMutationResponse,
  ActivateProfileResponse,
  SaveProfileRequest,
  ExposeSecretsMode,
} from "@openhands/typescript-client";
import { getAgentServerClientOptions } from "../agent-server-client-options";
import { getActiveBackend } from "../backend-registry/active-store";
import { listCloudLlmProfiles } from "../cloud/org-profiles-service.api";

// Re-export SDK types for consumers
export type {
  ProfileInfo,
  ProfileListResponse,
  ProfileDetailResponse,
  ProfileMutationResponse,
  ActivateProfileResponse,
  SaveProfileRequest,
  ExposeSecretsMode,
};

class ProfilesService {
  static async listProfiles(): Promise<ProfileListResponse> {
    // Cloud serves org LLM profiles at `/api/organizations/{org_id}/profiles`
    // (bearer + X-Org-Id) rather than the local agent-server's flat
    // `/api/profiles`. Only listing is cloud-routed — it powers the
    // Agent-profile editor's LLM-profile picker; the rest of the LLM-profile
    // management UI stays local-only (route-gated).
    if (getActiveBackend().backend.kind === "cloud") {
      return listCloudLlmProfiles();
    }
    return new ProfilesClient(getAgentServerClientOptions()).listProfiles();
  }

  static async getProfile(
    name: string,
    exposeSecrets?: ExposeSecretsMode,
  ): Promise<ProfileDetailResponse> {
    const options: GetProfileOptions = exposeSecrets ? { exposeSecrets } : {};
    return new ProfilesClient(getAgentServerClientOptions()).getProfile(
      name,
      options,
    );
  }

  static async saveProfile(
    name: string,
    request: SaveProfileRequest,
  ): Promise<ProfileMutationResponse> {
    return new ProfilesClient(getAgentServerClientOptions()).saveProfile(
      name,
      request,
    );
  }

  static async deleteProfile(name: string): Promise<ProfileMutationResponse> {
    return new ProfilesClient(getAgentServerClientOptions()).deleteProfile(
      name,
    );
  }

  static async renameProfile(
    name: string,
    newName: string,
  ): Promise<ProfileMutationResponse> {
    return new ProfilesClient(getAgentServerClientOptions()).renameProfile(
      name,
      newName,
    );
  }

  static async activateProfile(name: string): Promise<ActivateProfileResponse> {
    return new ProfilesClient(getAgentServerClientOptions()).activateProfile(
      name,
    );
  }
}

export default ProfilesService;
