import { OHEvent } from "#/stores/use-event-store";
import { ChatCompletionToolParam } from "#/types/agent-server/core";
import { isSystemPromptEvent } from "#/types/agent-server/type-guards";

export interface SystemMessageForModal {
  content: string;
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

  return {
    content: systemPromptEvent.system_prompt.text,
    tools: systemPromptEvent.tools ?? null,
    openhands_version: null,
    agent_class: null,
  };
}
