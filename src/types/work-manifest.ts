import type { WorkOptionalToolId } from "#/types/work-tools";

export interface WorkManifest {
  id: string;
  name: string;
  grantedFolders: string[];
  deliverablesPath: string;
  /** Optional Work tools enabled by default for new tasks (e.g. `"browser"`). */
  defaultOptionalTools: WorkOptionalToolId[];
}

export function normalizeWorkManifest(
  manifest: WorkManifest | null | undefined,
): WorkManifest | null {
  if (!manifest) {
    return null;
  }

  return {
    ...manifest,
    defaultOptionalTools: manifest.defaultOptionalTools ?? [],
  };
}

export interface WorkRuntimeHealthResponse {
  status: "ok" | "error";
  message?: string;
}

export interface PathValidationResult {
  path: string;
  exists: boolean;
}

export interface ValidatePathsResponse {
  results: PathValidationResult[];
}

export function isWorkManifestReady(
  manifest: WorkManifest | null | undefined,
): boolean {
  return Boolean(
    manifest &&
    manifest.grantedFolders.length > 0 &&
    manifest.deliverablesPath.trim().length > 0,
  );
}

export const WORK_MODE_TAG = "appmode";
export const WORK_MODE_TAG_VALUE = "work";
export const WORK_WORKSPACE_ID_TAG = "workwsid";
