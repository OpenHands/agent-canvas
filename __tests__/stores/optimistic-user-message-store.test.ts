import { beforeEach, describe, expect, it } from "vitest";
import { useOptimisticUserMessageStore } from "#/stores/optimistic-user-message-store";

const CONVO = "conv-a";

describe("optimistic-user-message-store", () => {
  beforeEach(() => {
    useOptimisticUserMessageStore.setState({ pendingMessages: [] });
  });

  it("enqueues new messages with status 'sending' and tags them with conversationId", () => {
    const store = useOptimisticUserMessageStore.getState();

    const id = store.enqueuePendingMessage({
      conversationId: CONVO,
      text: "hello",
    });

    const pending = useOptimisticUserMessageStore.getState().pendingMessages;
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe(id);
    expect(pending[0].conversationId).toBe(CONVO);
    expect(pending[0].text).toBe("hello");
    expect(pending[0].status).toBe("sending");
    expect(pending[0].imageUrls).toEqual([]);
    expect(pending[0].fileUrls).toEqual([]);
    expect(typeof pending[0].timestamp).toBe("string");
  });

  it("preserves FIFO order across multiple enqueues", () => {
    const store = useOptimisticUserMessageStore.getState();
    store.enqueuePendingMessage({ conversationId: CONVO, text: "first" });
    store.enqueuePendingMessage({ conversationId: CONVO, text: "second" });
    store.enqueuePendingMessage({ conversationId: CONVO, text: "third" });

    const pending = useOptimisticUserMessageStore.getState().pendingMessages;
    expect(pending.map((m) => m.text)).toEqual(["first", "second", "third"]);
  });

  it("marks a pending message as 'error' with details", () => {
    const store = useOptimisticUserMessageStore.getState();
    const id = store.enqueuePendingMessage({
      conversationId: CONVO,
      text: "broken",
    });

    store.markPendingMessageError(id, "boom");

    const [entry] = useOptimisticUserMessageStore.getState().pendingMessages;
    expect(entry.status).toBe("error");
    expect(entry.errorMessage).toBe("boom");
  });

  it("flips an errored message back to 'sending' on retry", () => {
    const store = useOptimisticUserMessageStore.getState();
    const id = store.enqueuePendingMessage({
      conversationId: CONVO,
      text: "broken",
    });
    store.markPendingMessageError(id, "boom");

    store.markPendingMessageSending(id);

    const [entry] = useOptimisticUserMessageStore.getState().pendingMessages;
    expect(entry.status).toBe("sending");
    expect(entry.errorMessage).toBeUndefined();
  });

  it("consumeOldestSendingMessage removes the oldest sending entry only", () => {
    const store = useOptimisticUserMessageStore.getState();
    const firstId = store.enqueuePendingMessage({
      conversationId: CONVO,
      text: "first",
    });
    const secondId = store.enqueuePendingMessage({
      conversationId: CONVO,
      text: "second",
    });
    store.markPendingMessageError(firstId, "boom"); // first is now in error state

    const consumed = store.consumeOldestSendingMessage(CONVO);

    expect(consumed?.id).toBe(secondId);
    const remaining =
      useOptimisticUserMessageStore.getState().pendingMessages;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(firstId);
    expect(remaining[0].status).toBe("error");
  });

  it("consumeOldestSendingMessage is a no-op when nothing is sending", () => {
    const store = useOptimisticUserMessageStore.getState();
    const id = store.enqueuePendingMessage({
      conversationId: CONVO,
      text: "broken",
    });
    store.markPendingMessageError(id, "boom");

    const consumed = store.consumeOldestSendingMessage(CONVO);

    expect(consumed).toBeNull();
    expect(
      useOptimisticUserMessageStore.getState().pendingMessages,
    ).toHaveLength(1);
  });

  it("consumeOldestSendingMessage only consumes entries for the given conversation", () => {
    const store = useOptimisticUserMessageStore.getState();
    const aId = store.enqueuePendingMessage({
      conversationId: "conv-a",
      text: "hello from A",
    });
    const bId = store.enqueuePendingMessage({
      conversationId: "conv-b",
      text: "hello from B",
    });

    // An ack arrives for conv-b — it must not eat conv-a's pending entry.
    const consumed = store.consumeOldestSendingMessage("conv-b");

    expect(consumed?.id).toBe(bId);
    const remaining =
      useOptimisticUserMessageStore.getState().pendingMessages;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(aId);
  });

  it("removePendingMessage drops a specific entry by id", () => {
    const store = useOptimisticUserMessageStore.getState();
    const firstId = store.enqueuePendingMessage({
      conversationId: CONVO,
      text: "first",
    });
    store.enqueuePendingMessage({ conversationId: CONVO, text: "second" });

    store.removePendingMessage(firstId);

    const remaining =
      useOptimisticUserMessageStore.getState().pendingMessages;
    expect(remaining.map((m) => m.text)).toEqual(["second"]);
  });

  it("clearPendingMessages wipes the queue", () => {
    const store = useOptimisticUserMessageStore.getState();
    store.enqueuePendingMessage({ conversationId: CONVO, text: "first" });
    store.enqueuePendingMessage({ conversationId: CONVO, text: "second" });

    store.clearPendingMessages();

    expect(
      useOptimisticUserMessageStore.getState().pendingMessages,
    ).toHaveLength(0);
  });
});
