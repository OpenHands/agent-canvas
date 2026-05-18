export type BackendKind = "local" | "cloud";

export interface Backend {
  id: string;
  name: string;
  host: string;
  apiKey: string;
  kind: BackendKind;
  workingDir?: string;
}

export interface BackendSelection {
  backendId: string;
  orgId?: string | null;
}

export interface ResolvedActiveBackend {
  backend: Backend;
  orgId: string | null;
}
