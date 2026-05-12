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
