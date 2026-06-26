import type { WorkExecutionTarget } from "#/types/work-mode-capabilities";

export type BackendKind = "local" | "cloud";

export interface Backend {
  id: string;
  name: string;
  host: string;
  apiKey: string;
  kind: BackendKind;
  /**
   * Where Work mode runs when this backend is active. Unset uses defaults:
   * local backends → device Work Runtime; cloud → Work disabled until set to
   * `local` (hybrid) or `hosted` (cloud Work volumes).
   */
  workExecution?: WorkExecutionTarget;
}

export interface BackendSelection {
  backendId: string;
  orgId?: string | null;
}

export interface ResolvedActiveBackend {
  backend: Backend;
  orgId: string | null;
}
