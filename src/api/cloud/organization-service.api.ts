import axios from "axios";
import { getActiveBackend } from "../backend-registry/active-store";
import type { Backend } from "../backend-registry/types";
import { callCloudProxy } from "./proxy";
import type {
  CloudApiKeyMetadata,
  CloudOrganization,
  CloudOrganizationsResponse,
} from "./types";

interface OrganizationsResult {
  items: CloudOrganization[];
  currentOrgId: string | null;
}

function normalizeResult(
  data: CloudOrganizationsResponse | undefined | null,
): OrganizationsResult {
  return {
    items: data?.items ?? [],
    currentOrgId: data?.current_org_id ?? null,
  };
}

function resolveBackend(backend?: Backend): Backend {
  if (backend) return backend;
  const active = getActiveBackend().backend;
  if (active.kind !== "cloud") {
    throw new Error(
      "Cloud organization calls require a cloud backend. Active backend is local.",
    );
  }
  return active;
}

/**
 * Fetch the org list for a cloud backend. With no argument, uses the active
 * cloud backend; pass `backend` explicitly to fetch for an inactive cloud
 * (used by the selector to flatten all cloud rows).
 *
 * Routed through the bundled agent-server's `/api/cloud-proxy` to avoid
 * cross-origin browser calls.
 */
export async function getCloudOrganizations(
  backend?: Backend,
): Promise<OrganizationsResult> {
  const target = resolveBackend(backend);
  const data = await callCloudProxy<CloudOrganizationsResponse>({
    backend: target,
    method: "GET",
    path: "/api/organizations",
  });
  return normalizeResult(data);
}

/**
 * Fetch metadata for the API key used to authenticate this cloud backend.
 * The returned `orgId` is the single org the key is authorized to act on
 * (the SaaS contract: one key → one org).
 *
 * Legacy keys minted before per-key org binding existed cause the upstream
 * to return HTTP 400 — we surface that as `isLegacyKey: true` with a null
 * `orgId` so the caller can fall back to the unfiltered behavior. Other
 * statuses (401 revoked, 5xx outage) propagate so React Query can mark
 * the query as failed and the selector can render the no-org-known row.
 */
export async function getCurrentCloudApiKey(
  backend?: Backend,
): Promise<{ orgId: string | null; isLegacyKey: boolean }> {
  const target = resolveBackend(backend);
  try {
    const data = await callCloudProxy<CloudApiKeyMetadata>({
      backend: target,
      method: "GET",
      path: "/api/keys/current",
    });
    return { orgId: data?.org_id ?? null, isLegacyKey: false };
  } catch (e) {
    if (axios.isAxiosError(e) && e.response?.status === 400) {
      return { orgId: null, isLegacyKey: true };
    }
    throw e;
  }
}

/**
 * Fetch `GET /api/organizations/{orgId}/me`. Identifies the calling user as
 * a member of `orgId`. The GUI uses `me.org_id === me.user_id` to decide
 * whether `orgId` is the user's personal workspace — that's the SaaS
 * contract (the auto-generated personal-workspace org has the same id as
 * the user).
 */
export async function getCloudOrganizationMe(
  orgId: string,
  backend?: Backend,
): Promise<{ orgId: string; userId: string }> {
  const target = resolveBackend(backend);
  const data = await callCloudProxy<{ org_id: string; user_id: string }>({
    backend: target,
    method: "GET",
    path: `/api/organizations/${encodeURIComponent(orgId)}/me`,
  });
  return {
    orgId: data?.org_id ?? orgId,
    userId: data?.user_id ?? "",
  };
}
