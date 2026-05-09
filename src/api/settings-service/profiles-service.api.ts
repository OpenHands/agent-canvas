import { getActiveBackend } from "#/api/backend-registry/active-store";
import { callCloudProxy } from "#/api/cloud/proxy";
import { createSettingsClient } from "#/api/typescript-client";
import { SettingsValue } from "#/types/settings";
import SettingsService from "./settings-service.api";

export interface LlmProfileSummary {
  name: string;
  model: string | null;
  base_url: string | null;
  api_key_set: boolean;
}

interface LlmProfileListResponse {
  profiles: LlmProfileSummary[];
  active_profile?: string | null;
}

interface LlmProfileDetailResponse {
  name: string;
  config: Record<string, SettingsValue>;
  api_key_set: boolean;
}

export interface SaveLlmProfileRequest {
  include_secrets?: boolean;
  llm?: {
    model: string;
    base_url?: string | null;
    api_key?: string | null;
  } & Record<string, unknown>;
}

const normalizeBaseUrl = (value: unknown) =>
  typeof value === "string" && value.trim().length > 0
    ? value.trim().replace(/\/+$/, "")
    : null;

const getCurrentProfileName = async (profiles: LlmProfileSummary[]) => {
  try {
    const settings = await SettingsService.getSettings();
    const llm = settings.agent_settings?.llm;
    if (!llm || typeof llm !== "object" || Array.isArray(llm)) {
      return null;
    }

    const model = typeof llm.model === "string" ? llm.model : null;
    const baseUrl = normalizeBaseUrl(llm.base_url);

    return (
      profiles.find(
        (profile) =>
          profile.model === model &&
          normalizeBaseUrl(profile.base_url) === baseUrl,
      )?.name ?? null
    );
  } catch {
    return null;
  }
};

const assertLocalProfileLlm = async (
  request: SaveLlmProfileRequest,
): Promise<SaveLlmProfileRequest> => {
  if (request.llm) return request;

  const { agentSettings } = await SettingsService.getSettingsForConversation();
  const { llm } = agentSettings;
  if (!llm || typeof llm !== "object" || Array.isArray(llm)) {
    throw new Error("No LLM settings are available to save as a profile.");
  }

  return {
    ...request,
    llm: llm as SaveLlmProfileRequest["llm"],
  };
};

class ProfilesService {
  private static isCloud() {
    return getActiveBackend().backend.kind === "cloud";
  }

  static async listProfiles(): Promise<LlmProfileListResponse> {
    if (this.isCloud()) {
      const data = await callCloudProxy<LlmProfileListResponse>({
        backend: getActiveBackend().backend,
        method: "GET",
        path: "/api/v1/settings/profiles",
      });
      return data;
    }

    const data = await createSettingsClient().listProfiles();
    return {
      profiles: data.profiles,
      active_profile: await getCurrentProfileName(data.profiles),
    };
  }

  static async getProfile(
    name: string,
    exposeSecrets?: "encrypted" | "plaintext",
  ): Promise<LlmProfileDetailResponse> {
    return (await createSettingsClient().getProfile(name, {
      exposeSecrets,
    })) as LlmProfileDetailResponse;
  }

  static async saveProfile(
    name: string,
    request: SaveLlmProfileRequest = {},
  ): Promise<void> {
    if (this.isCloud()) {
      await callCloudProxy<unknown>({
        backend: getActiveBackend().backend,
        method: "POST",
        path: `/api/v1/settings/profiles/${encodeURIComponent(name)}`,
        body: request,
      });
      return;
    }

    await createSettingsClient().saveProfile(
      name,
      (await assertLocalProfileLlm(request)) as SaveLlmProfileRequest & {
        llm: Record<string, unknown>;
      },
    );
  }

  static async deleteProfile(name: string): Promise<void> {
    if (this.isCloud()) {
      await callCloudProxy<unknown>({
        backend: getActiveBackend().backend,
        method: "DELETE",
        path: `/api/v1/settings/profiles/${encodeURIComponent(name)}`,
      });
      return;
    }

    await createSettingsClient().deleteProfile(name);
  }

  static async activateProfile(name: string): Promise<void> {
    if (this.isCloud()) {
      await callCloudProxy<unknown>({
        backend: getActiveBackend().backend,
        method: "POST",
        path: `/api/v1/settings/profiles/${encodeURIComponent(name)}/activate`,
      });
      return;
    }

    const profile = await this.getProfile(name, "encrypted");
    await SettingsService.saveSettings({
      agent_settings_diff: {
        llm: profile.config,
      },
    });
  }

  static async renameProfile(name: string, newName: string): Promise<void> {
    if (this.isCloud()) {
      await callCloudProxy<unknown>({
        backend: getActiveBackend().backend,
        method: "POST",
        path: `/api/v1/settings/profiles/${encodeURIComponent(name)}/rename`,
        body: { new_name: newName },
      });
      return;
    }

    await createSettingsClient().renameProfile(name, newName);
  }
}

export default ProfilesService;
