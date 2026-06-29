import type {
  ActivateProfileResponse,
  ProfileDetailResponse,
  ProfileListResponse,
  ProfileMutationResponse,
  SaveProfileRequest,
} from "@openhands/typescript-client";
import { getActiveBackend } from "../backend-registry/active-store";
import type { Backend } from "../backend-registry/types";
import { callCloudProxy } from "./proxy";

/**
 * Cloud LLM-profile service.
 *
 * The cloud app-server exposes the same LLM-profile machinery as the local
 * agent-server, but mounted on the settings router: `/api/v1/settings/profiles`
 * (vs the agent-server's `/api/profiles`). The request/response shapes match
 * the SDK profile models field-for-field, so we reuse those types directly and
 * only swap the transport — org-scoped `callCloudProxy` instead of the SDK's
 * `ProfilesClient`. Mirrors `src/api/cloud/settings-service.api.ts`.
 *
 * Secrets are never exposed by the cloud endpoints: `GET .../profiles/{name}`
 * always returns `config.api_key === null` alongside an `api_key_set` flag
 * (same convention as `/api/v1/settings`). The local client's `exposeSecrets`
 * option is therefore not forwarded — there is nothing for the cloud to expose.
 */

const PROFILES_PATH = "/api/v1/settings/profiles";

function getActiveCloudBackend(): Backend {
  const active = getActiveBackend().backend;
  if (active.kind !== "cloud") {
    throw new Error("Cloud profiles call requires a cloud backend.");
  }
  return active;
}

export async function fetchCloudProfiles(): Promise<ProfileListResponse> {
  return callCloudProxy<ProfileListResponse>({
    backend: getActiveCloudBackend(),
    method: "GET",
    path: PROFILES_PATH,
  });
}

export async function fetchCloudProfile(
  name: string,
): Promise<ProfileDetailResponse> {
  return callCloudProxy<ProfileDetailResponse>({
    backend: getActiveCloudBackend(),
    method: "GET",
    path: `${PROFILES_PATH}/${encodeURIComponent(name)}`,
  });
}

export async function saveCloudProfile(
  name: string,
  request: SaveProfileRequest,
): Promise<ProfileMutationResponse> {
  return callCloudProxy<ProfileMutationResponse>({
    backend: getActiveCloudBackend(),
    method: "POST",
    path: `${PROFILES_PATH}/${encodeURIComponent(name)}`,
    body: request,
  });
}

export async function deleteCloudProfile(
  name: string,
): Promise<ProfileMutationResponse> {
  return callCloudProxy<ProfileMutationResponse>({
    backend: getActiveCloudBackend(),
    method: "DELETE",
    path: `${PROFILES_PATH}/${encodeURIComponent(name)}`,
  });
}

export async function renameCloudProfile(
  name: string,
  newName: string,
): Promise<ProfileMutationResponse> {
  return callCloudProxy<ProfileMutationResponse>({
    backend: getActiveCloudBackend(),
    method: "POST",
    path: `${PROFILES_PATH}/${encodeURIComponent(name)}/rename`,
    body: { new_name: newName },
  });
}

export async function activateCloudProfile(
  name: string,
): Promise<ActivateProfileResponse> {
  // The cloud endpoint returns `{ name, message, model }`, whereas the SDK's
  // ActivateProfileResponse carries `llm_applied`. Consumers only read
  // `name`/`message` (the activate hook just invalidates caches), so we map the
  // presence of a resolved `model` onto `llm_applied` to keep one return type.
  const result = await callCloudProxy<{
    name: string;
    message: string;
    model: string | null;
  }>({
    backend: getActiveCloudBackend(),
    method: "POST",
    path: `${PROFILES_PATH}/${encodeURIComponent(name)}/activate`,
    body: {},
  });
  return {
    name: result.name,
    message: result.message,
    llm_applied: result.model != null,
  };
}
