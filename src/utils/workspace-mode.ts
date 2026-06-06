import type { BackendKind } from "#/api/backend-registry/types";
import type { WorkspaceMode } from "#/api/conversation-metadata-store";

export function getWorkspaceModeLabel(
  mode: WorkspaceMode,
  backendKind: BackendKind,
): string {
  if (mode === "new_worktree") return "New Worktree";
  return backendKind === "cloud" ? "Cloud Repo" : "Local Repo";
}
