import type { BackendKind } from "#/api/backend-registry/types";
import type { AppMode } from "#/types/app-mode";
import type {
  ResolvedWorkModeCapabilities,
  WorkModeCapabilityContext,
} from "#/types/work-mode-capabilities";
import { getHomePathForAppMode } from "#/utils/app-mode";

/**
 * Resolve whether Work mode is available and where it would run.
 *
 * Default v1 policy (no `workExecution` override):
 * - local backend → Work on device
 * - cloud backend → Work disabled until configured
 *
 * Future: set `backend.workExecution` to `local` (hybrid) or `hosted` (cloud Work).
 *
 * @spec WM-002 — Work capability resolution
 */
export function resolveWorkModeCapabilities(
  ctx: WorkModeCapabilityContext,
): ResolvedWorkModeCapabilities {
  const explicit = ctx.workExecution;

  if (explicit === "none") {
    return { execution: "none", allowed: false };
  }

  if (explicit === "hosted") {
    return {
      execution: "hosted",
      allowed: ctx.backendKind === "cloud",
    };
  }

  if (explicit === "local") {
    const allowed = ctx.backendKind === "local" || ctx.hasLocalBackend === true;
    return { execution: "local", allowed };
  }

  if (ctx.backendKind === "local") {
    return { execution: "local", allowed: true };
  }

  return { execution: "none", allowed: false };
}

export function canUseWorkMode(ctx: WorkModeCapabilityContext): boolean {
  return resolveWorkModeCapabilities(ctx).allowed;
}

export function getWorkExecutionTarget(
  ctx: WorkModeCapabilityContext,
): ResolvedWorkModeCapabilities["execution"] {
  return resolveWorkModeCapabilities(ctx).execution;
}

/** @deprecated Prefer `resolveWorkModeCapabilities` with full context. */
export function canUseWorkModeForBackendKind(
  backendKind: BackendKind,
): boolean {
  return canUseWorkMode({ backendKind });
}

export function getEffectiveAppMode(
  mode: AppMode,
  ctx: WorkModeCapabilityContext,
): AppMode {
  if (mode === "work" && !canUseWorkMode(ctx)) {
    return "code";
  }
  return mode;
}

export function getEffectiveHomePath(
  mode: AppMode,
  ctx: WorkModeCapabilityContext,
): string {
  return getHomePathForAppMode(getEffectiveAppMode(mode, ctx));
}
