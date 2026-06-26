import { describe, expect, it, vi } from "vitest";
import {
  RpcEndpoint,
  createInMemoryTransportPair,
} from "#/extensions/host/rpc";

describe("RpcEndpoint", () => {
  it("routes a request to the peer's method and resolves with its result", async () => {
    const [a, b] = createInMemoryTransportPair();
    const caller = new RpcEndpoint(a);
    new RpcEndpoint(b, {
      add: (params) => {
        const { x, y } = params as { x: number; y: number };
        return x + y;
      },
    });

    await expect(caller.request("add", { x: 2, y: 3 })).resolves.toBe(5);
  });

  it("supports requests in both directions", async () => {
    const [a, b] = createInMemoryTransportPair();
    const left = new RpcEndpoint(a, { ping: () => "pong-from-left" });
    const right = new RpcEndpoint(b, { ping: () => "pong-from-right" });

    await expect(left.request("ping")).resolves.toBe("pong-from-right");
    await expect(right.request("ping")).resolves.toBe("pong-from-left");
  });

  it("rejects when the method is unknown", async () => {
    const [a, b] = createInMemoryTransportPair();
    const caller = new RpcEndpoint(a);
    new RpcEndpoint(b, {});

    await expect(caller.request("missing")).rejects.toThrow(/unknown method/);
  });

  it("propagates handler errors back to the caller", async () => {
    const [a, b] = createInMemoryTransportPair();
    const caller = new RpcEndpoint(a);
    new RpcEndpoint(b, {
      boom: () => {
        throw new Error("kaboom");
      },
    });

    await expect(caller.request("boom")).rejects.toThrow("kaboom");
  });

  it("awaits async handlers", async () => {
    const [a, b] = createInMemoryTransportPair();
    const caller = new RpcEndpoint(a);
    new RpcEndpoint(b, {
      slow: async () => {
        await Promise.resolve();
        return "done";
      },
    });

    await expect(caller.request("slow")).resolves.toBe("done");
  });

  it("rejects pending requests when disposed", async () => {
    const [a] = createInMemoryTransportPair();
    const caller = new RpcEndpoint(a);
    const pending = caller.request("whatever");
    caller.dispose();
    await expect(pending).rejects.toThrow(/disposed/);
  });

  it("stops delivering after dispose (unsubscribes transport)", () => {
    const post = vi.fn();
    const unsubscribe = vi.fn();
    const endpoint = new RpcEndpoint({
      post,
      subscribe: () => unsubscribe,
    });
    endpoint.dispose();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
