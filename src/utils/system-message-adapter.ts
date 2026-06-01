import { OHEvent } from "#/stores/use-event-store";
import { ChatCompletionToolParam } from "#/types/agent-server/core";
import { isSystemPromptEvent } from "#/types/agent-server/type-guards";
import { redactCustomSecrets } from "#/utils/redact-custom-secrets";

export interface SystemMessageForModal {
  content: string;
  dynamicContext: string | null;
  tools: ChatCompletionToolParam[] | Record<string, unknown>[] | null;
  openhands_version: string | null;
  agent_class: string | null;
}

export function adaptSystemMessage(
  events: OHEvent[],
): SystemMessageForModal | null {
  const systemPromptEvent = events.find(isSystemPromptEvent);

  if (!systemPromptEvent) {
    return null;
  }

  const dynamicContextText = systemPromptEvent.dynamic_context?.text;

  return {
    content: systemPromptEvent.system_prompt.text,
    dynamicContext: dynamicContextText
      ? redactCustomSecrets(dynamicContextText)
      : null,
    tools: systemPromptEvent.tools ?? null,
    openhands_version: null,
    agent_class: null,
  };
}
