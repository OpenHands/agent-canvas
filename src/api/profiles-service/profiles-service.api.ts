/**
 * ProfilesService provides a thin wrapper around the SDK's ProfilesClient,
 * creating a client per-call to pick up current backend configuration.
 *
 * Uses ProfilesClient from @openhands/typescript-client v0.2.0+.
 * All types are re-exported from the SDK for consumer convenience.
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
    const client = new ProfilesClient(getAgentServerClientOptions());
    try {
      return await client.listProfiles();
    } finally {
      client.close();
    }
  }

  static async getProfile(
    name: string,
    exposeSecrets?: ExposeSecretsMode,
  ): Promise<ProfileDetailResponse> {
    const client = new ProfilesClient(getAgentServerClientOptions());
    try {
      const options: GetProfileOptions = exposeSecrets ? { exposeSecrets } : {};
      return await client.getProfile(name, options);
    } finally {
      client.close();
    }
  }

  static async saveProfile(
    name: string,
    request: SaveProfileRequest,
  ): Promise<ProfileMutationResponse> {
    const client = new ProfilesClient(getAgentServerClientOptions());
    try {
      return await client.saveProfile(name, request);
    } finally {
      client.close();
    }
  }

  static async deleteProfile(name: string): Promise<ProfileMutationResponse> {
    const client = new ProfilesClient(getAgentServerClientOptions());
    try {
      return await client.deleteProfile(name);
    } finally {
      client.close();
    }
  }

  static async renameProfile(
    name: string,
    newName: string,
  ): Promise<ProfileMutationResponse> {
    const client = new ProfilesClient(getAgentServerClientOptions());
    try {
      return await client.renameProfile(name, newName);
    } finally {
      client.close();
    }
  }

  static async activateProfile(name: string): Promise<ActivateProfileResponse> {
    const client = new ProfilesClient(getAgentServerClientOptions());
    try {
      return await client.activateProfile(name);
    } finally {
      client.close();
    }
  }
}

export default ProfilesService;
