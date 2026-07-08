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
 *  - In an ACP conversation (local or cloud): the model picker — ACP owns its
 *    LLM via the subprocess/session, so the picker just live-switches the
 *    session model (set_session_model / cloud's switch_acp_model proxy).
 *  - In an OpenHands conversation (local or cloud): the LLM-profile picker,
 *    which live-switches the running conversation's LLM profile via
 *    /switch_profile — a real endpoint on both backends (cloud proxies
 *    POST /api/v1/app-conversations/{id}/switch_profile, unchanged since
 *    OpenHands#14288). There is no cloud-specific restriction here.
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
  return isAcp ? "model" : "llm-profile";
}
