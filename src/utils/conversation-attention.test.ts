import { describe, it, expect } from "vitest";
import { ConversationAttention } from "./conversation-attention";
import { ExecutionStatus } from "#/types/agent-server/core/base/common";

const conv = (
  id: string,
  execution_status: ExecutionStatus | null,
  title: string | null = id,
) => ({ id, title, execution_status });

describe("ConversationAttention.notifyKind", () => {
  it("maps error and stuck to blocked", () => {
    expect(ConversationAttention.notifyKind(ExecutionStatus.ERROR)).toBe(
      "blocked",
    );
    expect(ConversationAttention.notifyKind(ExecutionStatus.STUCK)).toBe(
      "blocked",
    );
  });

  it("maps waiting_for_confirmation to needs_input", () => {
    expect(
      ConversationAttention.notifyKind(
        ExecutionStatus.WAITING_FOR_CONFIRMATION,
      ),
    ).toBe("needs_input");
  });

  it("maps finished to done", () => {
    expect(ConversationAttention.notifyKind(ExecutionStatus.FINISHED)).toBe(
      "done",
    );
  });

  it("returns null for non-attention states", () => {
    expect(ConversationAttention.notifyKind(ExecutionStatus.IDLE)).toBeNull();
    expect(
      ConversationAttention.notifyKind(ExecutionStatus.RUNNING),
    ).toBeNull();
    expect(ConversationAttention.notifyKind(ExecutionStatus.PAUSED)).toBeNull();
    expect(ConversationAttention.notifyKind(null)).toBeNull();
    expect(ConversationAttention.notifyKind(undefined)).toBeNull();
  });
});

describe("ConversationAttention.isPending", () => {
  it("counts blocked and needs_input, but not done or inactive states", () => {
    expect(ConversationAttention.isPending(ExecutionStatus.ERROR)).toBe(true);
    expect(
      ConversationAttention.isPending(ExecutionStatus.WAITING_FOR_CONFIRMATION),
    ).toBe(true);
    expect(ConversationAttention.isPending(ExecutionStatus.FINISHED)).toBe(
      false,
    );
    expect(ConversationAttention.isPending(ExecutionStatus.RUNNING)).toBe(
      false,
    );
    expect(ConversationAttention.isPending(null)).toBe(false);
  });
});

describe("ConversationAttention.diff", () => {
  it("seeds on first sighting without firing events", () => {
    const result = ConversationAttention.diff({
      previous: new Map(),
      conversations: [
        conv("a", ExecutionStatus.FINISHED),
        conv("b", ExecutionStatus.ERROR),
      ],
      activeConversationId: null,
    });

    expect(result.events).toEqual([]);
    expect(result.next.get("a")).toBe(ExecutionStatus.FINISHED);
    expect(result.next.get("b")).toBe(ExecutionStatus.ERROR);
    // b is blocked (pending); a is done (transient, not counted)
    expect(result.pendingCount).toBe(1);
  });

  it("fires an event when a known conversation transitions into attention", () => {
    const previous = new Map([["a", ExecutionStatus.RUNNING]]);
    const result = ConversationAttention.diff({
      previous,
      conversations: [conv("a", ExecutionStatus.FINISHED, "Build feature")],
      activeConversationId: null,
    });

    expect(result.events).toEqual([
      { id: "a", title: "Build feature", kind: "done" },
    ]);
  });

  it("does not fire when status is unchanged", () => {
    const previous = new Map([["a", ExecutionStatus.ERROR]]);
    const result = ConversationAttention.diff({
      previous,
      conversations: [conv("a", ExecutionStatus.ERROR)],
      activeConversationId: null,
    });

    expect(result.events).toEqual([]);
    // still pending though
    expect(result.pendingCount).toBe(1);
  });

  it("does not fire for transitions into non-attention states", () => {
    const previous = new Map([["a", ExecutionStatus.IDLE]]);
    const result = ConversationAttention.diff({
      previous,
      conversations: [conv("a", ExecutionStatus.RUNNING)],
      activeConversationId: null,
    });

    expect(result.events).toEqual([]);
    expect(result.pendingCount).toBe(0);
  });

  it("never notifies or counts the active conversation", () => {
    const previous = new Map([["a", ExecutionStatus.RUNNING]]);
    const result = ConversationAttention.diff({
      previous,
      conversations: [conv("a", ExecutionStatus.WAITING_FOR_CONFIRMATION)],
      activeConversationId: "a",
    });

    expect(result.events).toEqual([]);
    expect(result.pendingCount).toBe(0);
    // still tracked so a later background transition is detected correctly
    expect(result.next.get("a")).toBe(ExecutionStatus.WAITING_FOR_CONFIRMATION);
  });

  it("counts pending background conversations excluding done and active", () => {
    const previous = new Map([
      ["a", ExecutionStatus.RUNNING],
      ["b", ExecutionStatus.RUNNING],
      ["c", ExecutionStatus.RUNNING],
      ["d", ExecutionStatus.RUNNING],
    ]);
    const result = ConversationAttention.diff({
      previous,
      conversations: [
        conv("a", ExecutionStatus.ERROR), // pending
        conv("b", ExecutionStatus.WAITING_FOR_CONFIRMATION), // pending
        conv("c", ExecutionStatus.FINISHED), // done, not counted
        conv("d", ExecutionStatus.WAITING_FOR_CONFIRMATION), // active, not counted
      ],
      activeConversationId: "d",
    });

    expect(result.pendingCount).toBe(2);
    // three background transitions fire (a, b, c); d is active
    expect(result.events.map((e) => e.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("only carries forward conversations present in the current poll", () => {
    const previous = new Map([["gone", ExecutionStatus.RUNNING]]);
    const result = ConversationAttention.diff({
      previous,
      conversations: [conv("a", ExecutionStatus.RUNNING)],
      activeConversationId: null,
    });

    expect(result.next.has("gone")).toBe(false);
    expect(result.next.has("a")).toBe(true);
  });

  it("excludes muted conversations from the pending count", () => {
    const result = ConversationAttention.diff({
      previous: new Map(),
      conversations: [
        conv("a", ExecutionStatus.WAITING_FOR_CONFIRMATION),
        conv("b", ExecutionStatus.ERROR),
      ],
      activeConversationId: null,
      mutedIds: new Set(["a"]),
    });
    // Only the unmuted blocked conversation counts.
    expect(result.pendingCount).toBe(1);
  });

  it("fires no interrupt event for a muted conversation's transition", () => {
    const previous = new Map([["a", ExecutionStatus.RUNNING]]);
    const result = ConversationAttention.diff({
      previous,
      conversations: [conv("a", ExecutionStatus.WAITING_FOR_CONFIRMATION)],
      activeConversationId: null,
      mutedIds: new Set(["a"]),
    });
    expect(result.events).toEqual([]);
    // ...but it's still tracked, so unmuting later won't burst on this change.
    expect(result.next.get("a")).toBe(ExecutionStatus.WAITING_FOR_CONFIRMATION);
  });

  it("still notifies an unmuted conversation alongside a muted one", () => {
    const previous = new Map([
      ["a", ExecutionStatus.RUNNING],
      ["b", ExecutionStatus.RUNNING],
    ]);
    const result = ConversationAttention.diff({
      previous,
      conversations: [
        conv("a", ExecutionStatus.WAITING_FOR_CONFIRMATION),
        conv("b", ExecutionStatus.WAITING_FOR_CONFIRMATION),
      ],
      activeConversationId: null,
      mutedIds: new Set(["a"]),
    });
    expect(result.events.map((e) => e.id)).toEqual(["b"]);
    expect(result.pendingCount).toBe(1);
  });
});
