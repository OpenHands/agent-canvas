export type PickerKind = "model" | "agent-profile" | "llm-profile";

export interface ResolvePickerKindInput {
  /** A conversation is active (i.e. we're inside a conversation, not on home). */
  hasConversation: boolean;
  /** The active backend is cloud (vs. a local agent-server). */
  isCloud: boolean;
  /** The current context runs an ACP agent (active conv or home ACP settings). */
  isAcp: boolean;
  /** At least one AgentProfile exists to launch the next conversation from. */
  profilesAvailable: boolean;
}

/**
 * Decide which chat-input model/profile picker to show. Pure so the matrix is
 * unit-tested directly (see `resolve-picker-kind.test.ts`).
 *
 *  - Home (local or cloud): the AgentProfile picker, which starts a new
 *    conversation / activates the default (#3727, cloud via #15060). When no
 *    profiles exist yet, fall back — cloud → model, local → LLM-profile (cloud
 *    has no home LLM-profile activate path).
 *  - In a cloud conversation, or a local ACP conversation: the model picker.
 *    In-conversation LLM-profile switching is a local-OpenHands-only capability
 *    by design — cloud has no per-conversation switch endpoint and masks profile
 *    secrets; ACP uses the model picker regardless.
 *  - In a local OpenHands conversation: the LLM-profile picker, which
 *    live-switches the running conversation's LLM profile (/switch_profile).
 */
export function resolvePickerKind({
  hasConversation,
  isCloud,
  isAcp,
  profilesAvailable,
}: ResolvePickerKindInput): PickerKind {
  if (!hasConversation) {
    if (profilesAvailable) return "agent-profile";
    return isCloud ? "model" : "llm-profile";
  }
  if (isCloud) return "model";
  return isAcp ? "model" : "llm-profile";
}
