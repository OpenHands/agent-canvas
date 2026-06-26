import { describe, expect, it, vi } from "vitest";
import { createWebviewTransport } from "#/extensions/host/webview-transport";
import type { MessageEventTarget } from "#/extensions/host/webview-transport";

function makeEventTarget() {
  const listeners = new Set<(event: MessageEvent) => void>();
  const target: MessageEventTarget = {
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
  };
  const emit = (event: { source: unknown; data: unknown }) => {
    for (const listener of listeners) listener(event as unknown as MessageEvent);
  };
  return { target, emit, size: () => listeners.size };
}

describe("createWebviewTransport", () => {
  it("posts to the frame window with a wildcard target origin", () => {
    const frame = { postMessage: vi.fn() };
    const { target } = makeEventTarget();
    const transport = createWebviewTransport(frame, {
      source: {},
      eventTarget: target,
    });

    transport.post({ kind: "response", id: 1, result: "ok" });
    expect(frame.postMessage).toHaveBeenCalledWith(
      { kind: "response", id: 1, result: "ok" },
      "*",
    );
  });

  it("delivers only messages originating from the expected frame window", () => {
    const frame = { postMessage: vi.fn() };
    const source = { marker: "iframe" };
    const { target, emit } = makeEventTarget();
    const transport = createWebviewTransport(frame, {
      source,
      eventTarget: target,
    });

    const handler = vi.fn();
    transport.subscribe(handler);

    // Message from an unrelated window is ignored.
    emit({
      source: { other: true },
      data: { kind: "request", id: 1, method: "x" },
    });
    expect(handler).not.toHaveBeenCalled();

    // Message from the expected frame is delivered.
    emit({ source, data: { kind: "request", id: 2, method: "y" } });
    expect(handler).toHaveBeenCalledWith({
      kind: "request",
      id: 2,
      method: "y",
    });
  });

  it("unsubscribe removes the listener", () => {
    const frame = { postMessage: vi.fn() };
    const { target, emit, size } = makeEventTarget();
    const transport = createWebviewTransport(frame, {
      source: {},
      eventTarget: target,
    });

    const unsubscribe = transport.subscribe(vi.fn());
    expect(size()).toBe(1);
    unsubscribe();
    expect(size()).toBe(0);
    emit({ source: {}, data: {} as never });
  });
});
