/**
 * Runtime compatibility planning for AgentProfiles (agent-canvas#669).
 *
 * The in-conversation picker shows the user's saved AgentProfiles, but only
 * profiles that are *runtime-compatible* with the conversation as it is
 * actually running can be switched live. Everything else must be visible but
 * disabled, with a concrete reason — never a silent partial application where
 * we'd apply only the model and ignore condenser / tools / verification /
 * provider / command differences.
 *
 * This module is the single source of truth for that decision. It is pure
 * (no React, no network) so it can be unit-tested exhaustively and reused by
 * any surface that needs the compatibility verdict.
 *
 * NB on scope: today profiles persist on the agent-server as LLM-only records
 * ({@link normalizeLlmProfile} maps them to ``kind: "openhands"``), so the ACP
 * and non-runtime-settings branches below only fire once the backend grows
 * full AgentProfile persistence. They are implemented (and tested) now so that
 * work plugs straight in without re-deriving the matrix. See the issue's
 * "Runtime compatibility rules" section for the contract these encode.
 */
import type { ProfileInfo } from "#/api/profiles-service/profiles-service.api";

export type RuntimeIncompatibilityReason =
  | "different-agent-kind"
  | "different-acp-provider"
  | "different-acp-command"
  | "provider-does-not-support-runtime-switch"
  | "session-not-initialized"
  | "non-runtime-settings-differ"
  | "verification-not-runtime-switchable";

export type ProfileRuntimePlan =
  | { action: "current" }
  | { action: "switch-live"; mutableFields: string[] }
  | { action: "disabled"; reason: RuntimeIncompatibilityReason };

/**
 * Normalized, comparable view of an OpenHands profile's non-LLM settings.
 * These are *launch-only*: they cannot be applied to a running conversation,
 * so any difference greys out the profile. Values are opaque fingerprints —
 * the caller decides how to derive them; equality is all this module needs.
 */
export interface OpenHandsNonRuntimeSettings {
  /** Condenser configuration fingerprint (e.g. JSON string), or null/undefined when unset. */
  condenser?: string | null;
  /** MCP/tools configuration fingerprint. */
  mcp?: string | null;
  /** Tools configuration fingerprint. */
  tools?: string | null;
  /** Verification configuration fingerprint — special-cased to its own reason. */
  verification?: string | null;
  /** Confirmation mode toggle. */
  confirmationMode?: boolean | null;
  /** Security analyzer selection. */
  securityAnalyzer?: string | null;
  /** Launch-only iteration cap. */
  maxIterations?: number | null;
}

export type AgentProfile =
  | {
      kind: "openhands";
      name: string;
      llm: { model: string | null; baseUrl: string | null };
      nonRuntime?: OpenHandsNonRuntimeSettings;
    }
  | {
      kind: "acp";
      name: string;
      acpServer: string;
      acpModel?: string | null;
      acpCommand?: string[];
      acpArgs?: string[];
      acpEnv?: Record<string, string>;
    };

/**
 * The effective config a conversation is actually running with. Compatibility
 * is compared against this, not against a profile name — profiles can be
 * edited after a conversation starts (see the issue's
 * ``ConversationProfileSnapshot``).
 */
export type ConversationRuntimeContext =
  | {
      kind: "openhands";
      llm: { model: string | null; baseUrl: string | null };
      nonRuntime?: OpenHandsNonRuntimeSettings;
    }
  | {
      kind: "acp";
      acpServer: string | null;
      acpModel: string | null;
      acpCommand?: string[];
      acpArgs?: string[];
      acpEnv?: Record<string, string>;
      /** Provider exposes a runtime model switch (e.g. ACP ``session/set_model``). */
      providerSupportsRuntimeSwitch: boolean;
      /** The ACP session has been initialized and can accept a runtime switch. */
      sessionInitialized: boolean;
    };

export interface DeriveProfileRuntimePlanInput {
  profile: AgentProfile;
  context: ConversationRuntimeContext;
  /**
   * The profile already driving the conversation. When true the plan is
   * ``current`` regardless of field comparison — identity wins over a
   * config-equality guess (two profiles can share a config).
   */
  isActive?: boolean;
}

function nullish<T>(value: T | null | undefined): T | null {
  return value === undefined ? null : value;
}

function arraysEqual(
  a: string[] | undefined,
  b: string[] | undefined,
): boolean {
  const left = a ?? [];
  const right = b ?? [];
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function envEqual(
  a: Record<string, string> | undefined,
  b: Record<string, string> | undefined,
): boolean {
  const left = a ?? {};
  const right = b ?? {};
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => left[key] === right[key]);
}

/**
 * Compare the launch-only OpenHands settings. Returns the disabling reason
 * when they differ (verification has its own reason so the UI can explain it
 * precisely), or ``null`` when they match and a live LLM swap is allowed.
 */
function nonRuntimeIncompatibility(
  profile: OpenHandsNonRuntimeSettings | undefined,
  context: OpenHandsNonRuntimeSettings | undefined,
): RuntimeIncompatibilityReason | null {
  const a = profile ?? {};
  const b = context ?? {};
  if (nullish(a.verification) !== nullish(b.verification)) {
    return "verification-not-runtime-switchable";
  }
  if (
    nullish(a.condenser) !== nullish(b.condenser) ||
    nullish(a.mcp) !== nullish(b.mcp) ||
    nullish(a.tools) !== nullish(b.tools) ||
    nullish(a.confirmationMode) !== nullish(b.confirmationMode) ||
    nullish(a.securityAnalyzer) !== nullish(b.securityAnalyzer) ||
    nullish(a.maxIterations) !== nullish(b.maxIterations)
  ) {
    return "non-runtime-settings-differ";
  }
  return null;
}

/**
 * Derive whether a profile can be switched into the running conversation
 * live, is already current, or must be disabled (with a reason).
 *
 * Rules (from agent-canvas#669):
 * - Different agent kind (OpenHands vs ACP) is never a live switch.
 * - OpenHands → OpenHands switches live only when the target differs solely
 *   in live-switchable LLM config; any non-runtime difference disables it.
 * - ACP → ACP switches live only when the provider, command/args/env and
 *   credential/launch identity all match, the provider supports a runtime
 *   model switch, the session is initialized, and only ``acp_model`` differs.
 */
export function deriveProfileRuntimePlan({
  profile,
  context,
  isActive = false,
}: DeriveProfileRuntimePlanInput): ProfileRuntimePlan {
  if (isActive) {
    return { action: "current" };
  }

  if (profile.kind !== context.kind) {
    return { action: "disabled", reason: "different-agent-kind" };
  }

  if (profile.kind === "openhands" && context.kind === "openhands") {
    const nonRuntimeReason = nonRuntimeIncompatibility(
      profile.nonRuntime,
      context.nonRuntime,
    );
    if (nonRuntimeReason) {
      return { action: "disabled", reason: nonRuntimeReason };
    }
    const modelMatches = profile.llm.model === context.llm.model;
    const baseUrlMatches =
      nullish(profile.llm.baseUrl) === nullish(context.llm.baseUrl);
    if (modelMatches && baseUrlMatches) {
      return { action: "current" };
    }
    return { action: "switch-live", mutableFields: ["llm"] };
  }

  if (profile.kind === "acp" && context.kind === "acp") {
    if (profile.acpServer !== context.acpServer) {
      return { action: "disabled", reason: "different-acp-provider" };
    }
    if (
      !arraysEqual(profile.acpCommand, context.acpCommand) ||
      !arraysEqual(profile.acpArgs, context.acpArgs) ||
      !envEqual(profile.acpEnv, context.acpEnv)
    ) {
      return { action: "disabled", reason: "different-acp-command" };
    }
    if (!context.providerSupportsRuntimeSwitch) {
      return {
        action: "disabled",
        reason: "provider-does-not-support-runtime-switch",
      };
    }
    if (!context.sessionInitialized) {
      return { action: "disabled", reason: "session-not-initialized" };
    }
    if (nullish(profile.acpModel) === nullish(context.acpModel)) {
      return { action: "current" };
    }
    return { action: "switch-live", mutableFields: ["acp_model"] };
  }

  // Unreachable given the kind guard above, but keeps the union exhaustive
  // for the type checker without an unsafe cast.
  return { action: "disabled", reason: "different-agent-kind" };
}

/**
 * Map the agent-server's LLM-only ``ProfileInfo`` to the normalized
 * AgentProfile this module compares. Existing saved profiles are OpenHands
 * profiles by definition (the backend has no ACP profile concept yet), so
 * they default to ``kind: "openhands"`` per the issue's migration direction.
 */
export function normalizeLlmProfile(profile: ProfileInfo): AgentProfile {
  if (profile.kind === "acp") {
    // The list summary only carries the launch *identity* we can compare
    // against a running ACP conversation: provider + model. command/args/env
    // aren't in the summary (they live in the full profile config), and for
    // built-in providers they're derived from acp_server anyway — so leaving
    // them undefined makes the runtime-plan comparison reduce to
    // provider + model, which is the correct switch-live test for ACP.
    return {
      kind: "acp",
      name: profile.name,
      acpServer: profile.acp_server ?? "",
      acpModel: profile.acp_model ?? null,
    };
  }
  return {
    kind: "openhands",
    name: profile.name,
    llm: { model: profile.model ?? null, baseUrl: profile.base_url ?? null },
  };
}
