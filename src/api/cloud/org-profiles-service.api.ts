import type { ProfileListResponse } from "@openhands/typescript-client";
import { getActiveBackend } from "../backend-registry/active-store";
import type { Backend } from "../backend-registry/types";
import { callCloudProxy } from "./proxy";
import { getCloudOrganizations } from "./organization-service.api";

/**
 * Cloud transport for org LLM profiles. Unlike the local agent-server (flat
 * `/api/profiles`), the enterprise cloud app-server serves LLM profiles per-org
 * at `/api/organizations/{org_id}/profiles` (pre-existing `org_profiles.py`).
 * The response shape matches the ts-client `ProfileListResponse`, so the
 * Agent-profile editor's LLM-profile picker (via `useLlmProfiles`) works on
 * cloud once `ProfilesService.listProfiles` routes here.
 *
 * Only listing is wired: the Agent-profile editor needs the `{name, model}`
 * options + the active profile to seed a required `llm_profile_ref`. The full
 * LLM-profile management UI stays local-only (its route is cloud-gated).
 */

function activeCloudBackend(): Backend {
  const active = getActiveBackend().backend;
  if (active.kind !== "cloud") {
    throw new Error("Cloud org-profile call requires a cloud backend.");
  }
  return active;
}

/**
 * Resolve the org id for the path. Prefer the locally-selected org (the same
 * id `callCloudProxy` sends as `X-Org-Id`); fall back to the backend's current
 * org when nothing is selected so the call still scopes correctly.
 */
async function resolveActiveCloudOrgId(): Promise<string> {
  const selected = getActiveBackend().orgId;
  if (selected) return selected;
  const { currentOrgId } = await getCloudOrganizations();
  if (!currentOrgId) {
    throw new Error("No current organization for the active cloud backend.");
  }
  return currentOrgId;
}

export async function listCloudLlmProfiles(): Promise<ProfileListResponse> {
  const orgId = await resolveActiveCloudOrgId();
  return callCloudProxy<ProfileListResponse>({
    backend: activeCloudBackend(),
    method: "GET",
    path: `/api/organizations/${encodeURIComponent(orgId)}/profiles`,
  });
}
