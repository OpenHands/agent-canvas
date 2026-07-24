export type PickerKind = "model" | "llm-profile";

export interface ConversationStartState {
  isLoadingHistory: boolean;
  hasUserEvents: boolean;
  hasPendingUserMessages: boolean;
  hasSubstantiveAgentActions: boolean;
  hasModelEntries: boolean;
}

export function hasConversationStarted({
  isLoadingHistory,
  hasUserEvents,
  hasPendingUserMessages,
  hasSubstantiveAgentActions,
  hasModelEntries,
}: ConversationStartState) {
  return (
    isLoadingHistory ||
    hasUserEvents ||
    hasPendingUserMessages ||
    hasSubstantiveAgentActions ||
    hasModelEntries
  );
}

export interface ResolvePickerKindInput {
  hasConversation: boolean;
  hasStartedConversation?: boolean;
  isCloud: boolean;
  isAcp: boolean;
}
// The chat-input pill is always an LLM selector (OSS-5735): the ACP model
// picker in an ACP context (constrained to that provider's models), the LLM
// profile picker otherwise. Agent-profile switching lives in the "+" tools
// menu while the conversation hasn't started, not here.
export function resolvePickerKind({
  hasConversation,
  hasStartedConversation = hasConversation,
  isCloud,
  isAcp,
}: ResolvePickerKindInput): PickerKind {
  if (isAcp) return "model";
  if (!hasConversation || !hasStartedConversation) {
    // Cloud has no home-page LLM-profile activation (org-permission bound), so
    // it keeps the read-only model chip before a conversation starts.
    return isCloud ? "model" : "llm-profile";
  }
  return "llm-profile";
}
