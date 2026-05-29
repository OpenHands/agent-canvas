import { I18nKey } from "#/i18n/declaration";
import type { RuntimeIncompatibilityReason } from "./runtime-plan";

/**
 * Map a {@link RuntimeIncompatibilityReason} to the i18n key for the short
 * label shown on a disabled profile row. Kept out of {@link runtime-plan.ts}
 * so the core compatibility logic stays free of UI/i18n coupling and remains
 * trivially unit-testable.
 *
 * "different-agent-kind" and "non-runtime-settings-differ" both collapse to
 * the same user-facing message — from the picker's point of view the only
 * remedy is the same ("start a new conversation"), and that phrasing matches
 * the example reasons in the issue.
 */
export function reasonToI18nKey(reason: RuntimeIncompatibilityReason): I18nKey {
  switch (reason) {
    case "different-agent-kind":
    case "non-runtime-settings-differ":
      return I18nKey.PROFILE_PICKER$REASON_REQUIRES_NEW_CONVERSATION;
    case "different-acp-provider":
      return I18nKey.PROFILE_PICKER$REASON_DIFFERENT_ACP_PROVIDER;
    case "different-acp-command":
      return I18nKey.PROFILE_PICKER$REASON_DIFFERENT_ACP_COMMAND;
    case "provider-does-not-support-runtime-switch":
      return I18nKey.PROFILE_PICKER$REASON_PROVIDER_NO_RUNTIME_SWITCH;
    case "session-not-initialized":
      return I18nKey.PROFILE_PICKER$REASON_SESSION_NOT_INITIALIZED;
    case "verification-not-runtime-switchable":
      return I18nKey.PROFILE_PICKER$REASON_VERIFICATION_DIFFERS;
    default: {
      // Exhaustiveness guard: a new reason must add a label above.
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}
