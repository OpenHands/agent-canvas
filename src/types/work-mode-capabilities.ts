/**
 * Where the Work Runtime executes when Work mode is active.
 *
 * - `local` — Work Runtime on the user's machine (folder grants, local apps).
 * - `hosted` — Work Runtime in cloud-provisioned volumes (future).
 * - `none` — Work mode disabled for this backend/context.
 */
export type WorkExecutionTarget = "local" | "hosted" | "none";

export interface WorkModeCapabilityContext {
  backendKind: "local" | "cloud";
  /**
   * Optional per-backend override. When set on a cloud backend, Code can stay
   * on cloud while Work runs locally (`local`) or in the cloud (`hosted`).
   */
  workExecution?: WorkExecutionTarget;
  /** Registered local backends — required for cloud + local Work hybrid. */
  hasLocalBackend?: boolean;
}

export interface ResolvedWorkModeCapabilities {
  execution: WorkExecutionTarget;
  allowed: boolean;
}
