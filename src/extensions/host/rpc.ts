/**
 * A tiny, transport-agnostic JSON-RPC-style endpoint used for host <-> extension
 * communication. Both sides of the channel (the host and the in-worker runtime) use
 * the same `RpcEndpoint`; only the transport and the exposed method map differ.
 *
 * Keeping this independent of `Worker`/`postMessage` specifics means the protocol can
 * be unit-tested with a pair of in-memory transports — no DOM Worker required.
 */

export interface RpcRequest {
  kind: "request";
  id: number;
  method: string;
  params?: unknown;
}

export interface RpcResponse {
  kind: "response";
  id: number;
  result?: unknown;
  error?: string;
}

export type RpcMessage = RpcRequest | RpcResponse;

/** Bidirectional message pipe. `subscribe` returns an unsubscribe function. */
export interface RpcTransport {
  post(message: RpcMessage): void;
  subscribe(handler: (message: RpcMessage) => void): () => void;
}

/** Handlers for inbound requests, keyed by dotted method name. */
export type RpcMethodMap = Record<
  string,
  (params: unknown) => unknown | Promise<unknown>
>;

export class RpcEndpoint {
  private nextId = 1;
  private readonly pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  private readonly unsubscribe: () => void;
  private disposed = false;

  constructor(
    private readonly transport: RpcTransport,
    private readonly methods: RpcMethodMap = {},
  ) {
    this.unsubscribe = transport.subscribe((message) => {
      void this.handle(message);
    });
  }

  /** Call a method exposed by the *other* endpoint and await its result. */
  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (this.disposed) {
      return Promise.reject(new Error("RpcEndpoint is disposed"));
    }
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.transport.post({ kind: "request", id, method, params });
    });
  }

  private async handle(message: RpcMessage): Promise<void> {
    if (message.kind === "response") {
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id);
      if (message.error !== undefined) {
        entry.reject(new Error(message.error));
      } else {
        entry.resolve(message.result);
      }
      return;
    }

    const handler = this.methods[message.method];
    if (!handler) {
      this.transport.post({
        kind: "response",
        id: message.id,
        error: `unknown method: ${message.method}`,
      });
      return;
    }

    try {
      const result = await handler(message.params);
      this.transport.post({ kind: "response", id: message.id, result });
    } catch (error) {
      this.transport.post({
        kind: "response",
        id: message.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribe();
    for (const entry of this.pending.values()) {
      entry.reject(new Error("RpcEndpoint disposed before response"));
    }
    this.pending.clear();
  }
}

/**
 * Create a connected pair of in-memory transports. Useful for tests and for the
 * fake-worker integration path. Messages posted on one side are delivered
 * asynchronously to the other (mirroring real `postMessage` semantics).
 */
export function createInMemoryTransportPair(): [RpcTransport, RpcTransport] {
  const handlersA = new Set<(m: RpcMessage) => void>();
  const handlersB = new Set<(m: RpcMessage) => void>();

  const deliver = (
    handlers: Set<(m: RpcMessage) => void>,
    message: RpcMessage,
  ) => {
    queueMicrotask(() => {
      for (const handler of handlers) handler(message);
    });
  };

  const a: RpcTransport = {
    post: (message) => deliver(handlersB, message),
    subscribe: (handler) => {
      handlersA.add(handler);
      return () => handlersA.delete(handler);
    },
  };
  const b: RpcTransport = {
    post: (message) => deliver(handlersA, message),
    subscribe: (handler) => {
      handlersB.add(handler);
      return () => handlersB.delete(handler);
    },
  };
  return [a, b];
}
