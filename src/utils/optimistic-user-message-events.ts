import { MessageEvent, OpenHandsEvent } from "#/types/agent-server/core";
import {
  PendingUserMessage,
  PendingUserMessageStatus,
} from "#/stores/optimistic-user-message-store";

export type OptimisticUserMessageEvent = MessageEvent & {
  optimisticPendingMessageId: string;
  optimisticPendingStatus: PendingUserMessageStatus;
  optimisticPendingErrorMessage?: string;
};

export const isOptimisticUserMessageEvent = (
  event: OpenHandsEvent,
): event is OptimisticUserMessageEvent =>
  "optimisticPendingMessageId" in event &&
  typeof event.optimisticPendingMessageId === "string";

const compareTimestamps = (a: string | undefined, b: string | undefined) => {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
};

const toOptimisticUserMessageEvent = (
  message: PendingUserMessage,
): OptimisticUserMessageEvent => ({
  id: message.id,
  timestamp: message.timestamp,
  source: "user",
  llm_message: {
    role: "user",
    content: [
      { type: "text", text: message.text },
      ...(message.imageUrls.length > 0
        ? [{ type: "image" as const, image_urls: message.imageUrls }]
        : []),
    ],
  },
  activated_microagents: [],
  extended_content: [],
  optimisticPendingMessageId: message.id,
  optimisticPendingStatus: message.status,
  optimisticPendingErrorMessage: message.errorMessage,
});

export const mergeOptimisticUserMessages = (
  events: OpenHandsEvent[],
  pendingMessages: PendingUserMessage[],
): OpenHandsEvent[] => {
  if (pendingMessages.length === 0) {
    return events;
  }

  const eventIds = new Set(events.map((event) => event.id));
  const optimisticEvents = pendingMessages
    .filter((message) => !eventIds.has(message.id))
    .map(toOptimisticUserMessageEvent);

  if (optimisticEvents.length === 0) {
    return events;
  }

  return [...events, ...optimisticEvents].sort((a, b) =>
    compareTimestamps(a.timestamp, b.timestamp),
  );
};
