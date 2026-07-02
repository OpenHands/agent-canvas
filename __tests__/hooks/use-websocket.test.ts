/**
 * TODO: Fix flaky WebSocket tests (https://github.com/OpenHands/OpenHands/issues/11944)
 *
 * Several tests in this file are skipped because they fail intermittently in CI
 * but pass locally. The SUSPECTED root cause is that `wsLink.broadcast()` sends messages
 * to ALL connected clients across all tests, causing cross-test contamination
 * when tests run in parallel with Vitest v4.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
  vi,
} from "vitest";
import { ws } from "msw";
import { setupServer } from "msw/node";
import { useWebSocket } from "#/hooks/use-websocket";

describe("useWebSocket", () => {
  // MSW WebSocket mock setup
  const wsLink = ws.link("ws://acme.com/ws");

  const mswServer = setupServer(
    wsLink.addEventListener("connection", ({ client, server }) => {
      // Establish the connection
      server.connect();

      // Send a welcome message to confirm connection
      client.send("Welcome to the WebSocket!");
    }),
  );

  beforeAll(() =>
    mswServer.listen({
      onUnhandledRequest: "warn",
    }),
  );
  afterEach(() => mswServer.resetHandlers());
  afterAll(() => mswServer.close());

  const waitForConnection = async (result: {
    current: {
      isConnected: boolean;
    };
  }) => {
    await waitFor(
      () => {
        expect(result.current.isConnected).toBe(true);
      },
      { timeout: 5000 },
    );
  };

  it("should establish a WebSocket connection", async () => {
    const { result } = renderHook(() => useWebSocket("ws://acme.com/ws"));

    // Initially should not be connected
    expect(result.current.isConnected).toBe(false);
    expect(result.current.lastMessage).toBe(null);

    // Wait for connection to be established
    await waitForConnection(result);

    // Should receive the welcome message from our mock
    await waitFor(() => {
      expect(result.current.lastMessage).toBe("Welcome to the WebSocket!");
    });

    // Confirm that the WebSocket connection is established when the hook is used
    expect(result.current.socket).toBeTruthy();
  });

  it("should not retain an unbounded raw message history", async () => {
    class MockWebSocket {
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;
      static readonly CLOSING = 2;
      static readonly CLOSED = 3;
      static instance: MockWebSocket | null = null;

      readonly url: string;
      readyState = MockWebSocket.CONNECTING;
      onopen: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onclose: ((event: CloseEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;

      constructor(url: string) {
        this.url = url;
        MockWebSocket.instance = this;
        queueMicrotask(() => {
          this.readyState = MockWebSocket.OPEN;
          this.onopen?.(new Event("open"));
        });
      }

      send() {}

      close() {
        this.readyState = MockWebSocket.CLOSED;
        this.onclose?.(
          new CloseEvent("close", {
            code: 1000,
            reason: "Normal closure",
            wasClean: true,
          }),
        );
      }
    }

    const originalWebSocket = globalThis.WebSocket;
    vi.stubGlobal("WebSocket", MockWebSocket);

    try {
      const { result, unmount } = renderHook(() =>
        useWebSocket("ws://acme.com/ws"),
      );

      await waitForConnection(result);

      act(() => {
        MockWebSocket.instance?.onmessage?.(
          new MessageEvent("message", { data: "first" }),
        );
        MockWebSocket.instance?.onmessage?.(
          new MessageEvent("message", { data: "second" }),
        );
        MockWebSocket.instance?.onmessage?.(
          new MessageEvent("message", { data: "third" }),
        );
      });

      expect(result.current.lastMessage).toBe("third");
      expect("messages" in result.current).toBe(false);

      unmount();
    } finally {
      globalThis.WebSocket = originalWebSocket;
      MockWebSocket.instance = null;
    }
  });

  it.skip("should handle incoming messages correctly", async () => {
    const { result } = renderHook(() => useWebSocket("ws://acme.com/ws"));

    // Wait for connection to be established
    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    // Should receive the welcome message from our mock
    await waitFor(() => {
      expect(result.current.lastMessage).toBe("Welcome to the WebSocket!");
    });

    // Send another message from the mock server
    wsLink.broadcast("Hello from server!");

    await waitFor(() => {
      expect(result.current.lastMessage).toBe("Hello from server!");
    });

    // The hook intentionally keeps only the latest message; consumers that
    // need durable history should store parsed events in their own domain
    // store instead of retaining every raw websocket frame here.
    expect("messages" in result.current).toBe(false);
  });

  it("should handle connection errors gracefully", async () => {
    // Create a mock that will simulate an error
    const errorLink = ws.link("ws://error-test.com/ws");
    mswServer.use(
      errorLink.addEventListener("connection", ({ client }) => {
        // Simulate an error by closing the connection immediately
        client.close(1006, "Connection failed");
      }),
    );

    const { result } = renderHook(() => useWebSocket("ws://error-test.com/ws"));

    // Initially should not be connected and no error
    expect(result.current.isConnected).toBe(false);
    expect(result.current.error).toBe(null);

    // Wait for the connection to fail
    await waitFor(() => {
      expect(result.current.isConnected).toBe(false);
    });

    // Should have error information (the close event should trigger error state)
    await waitFor(() => {
      expect(result.current.error).not.toBe(null);
    });

    expect(result.current.error).toBeInstanceOf(Error);
    // Should have meaningful error message (could be from onerror or onclose)
    expect(
      result.current.error?.message.includes("WebSocket closed with code 1006"),
    ).toBe(true);

    // Should not crash the application
    expect(result.current.socket).toBeTruthy();
  });

  it.skip("should close the WebSocket connection on unmount", async () => {
    const { result, unmount } = renderHook(() =>
      useWebSocket("ws://acme.com/ws"),
    );

    // Wait for connection to be established
    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    // Verify connection is active
    expect(result.current.isConnected).toBe(true);
    expect(result.current.socket).toBeTruthy();

    const closeSpy = vi.spyOn(result.current.socket!, "close");

    // Unmount the component (this should trigger the useEffect cleanup)
    unmount();

    // Verify that WebSocket close was called during cleanup
    expect(closeSpy).toHaveBeenCalledOnce();
  });

  it("should support query parameters in WebSocket URL", async () => {
    // Stub WebSocket deterministically (mirrors the `onClose` test below).
    // The MSW-backed variant was flaky in CI — `wsLink.broadcast()` from
    // other tests leaks across the shared mock server, and this assertion
    // only needs to observe the constructed URL, not a real connection.
    class MockWebSocket {
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;
      static readonly CLOSING = 2;
      static readonly CLOSED = 3;

      readonly url: string;
      readyState = MockWebSocket.CONNECTING;
      onopen: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onclose: ((event: CloseEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;

      constructor(url: string) {
        this.url = url;
        queueMicrotask(() => {
          this.readyState = MockWebSocket.OPEN;
          this.onopen?.(new Event("open"));
        });
      }

      send() {}

      close() {
        this.readyState = MockWebSocket.CLOSED;
        this.onclose?.(
          new CloseEvent("close", {
            code: 1000,
            reason: "Normal closure",
            wasClean: true,
          }),
        );
      }
    }

    const originalWebSocket = globalThis.WebSocket;
    vi.stubGlobal("WebSocket", MockWebSocket);

    try {
      const baseUrl = "ws://acme.com/ws";
      const queryParams = {
        token: "abc123",
        userId: "user456",
        version: "v1",
      };

      const { result, unmount } = renderHook(() =>
        useWebSocket(baseUrl, { queryParams }),
      );

      await waitForConnection(result);

      // Verify that the WebSocket was created with query parameters
      expect(result.current.socket).toBeTruthy();
      expect(result.current.socket!.url).toBe(
        "ws://acme.com/ws?token=abc123&userId=user456&version=v1",
      );

      unmount();
    } finally {
      globalThis.WebSocket = originalWebSocket;
    }
  });

  // Skipped: flaky in CI - see comment at top of file
  it.skip("should call onOpen handler when WebSocket connection opens", async () => {
    const onOpenSpy = vi.fn();
    const options = { onOpen: onOpenSpy };

    const { result } = renderHook(() =>
      useWebSocket("ws://acme.com/ws", options),
    );

    // Initially should not be connected
    expect(result.current.isConnected).toBe(false);
    expect(onOpenSpy).not.toHaveBeenCalled();

    // Wait for connection to be established
    await waitForConnection(result);

    // onOpen handler should have been called
    expect(onOpenSpy).toHaveBeenCalledOnce();
  });

  it("should call onClose handler when WebSocket connection closes", async () => {
    class MockWebSocket {
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;
      static readonly CLOSING = 2;
      static readonly CLOSED = 3;

      readonly url: string;
      readyState = MockWebSocket.CONNECTING;
      onopen: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onclose: ((event: CloseEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;

      constructor(url: string) {
        this.url = url;
        queueMicrotask(() => {
          this.readyState = MockWebSocket.OPEN;
          this.onopen?.(new Event("open"));
        });
      }

      send() {}

      close() {
        this.readyState = MockWebSocket.CLOSED;
        this.onclose?.(
          new CloseEvent("close", {
            code: 1000,
            reason: "Normal closure",
            wasClean: true,
          }),
        );
      }
    }

    const originalWebSocket = globalThis.WebSocket;
    vi.stubGlobal("WebSocket", MockWebSocket);

    const onCloseSpy = vi.fn();
    const options = { onClose: onCloseSpy };

    try {
      const { result, unmount } = renderHook(() =>
        useWebSocket("ws://acme.com/ws", options),
      );

      await waitForConnection(result);

      act(() => {
        result.current.disconnect();
      });

      await waitFor(() => {
        expect(onCloseSpy).toHaveBeenCalledOnce();
      });

      unmount();
    } finally {
      globalThis.WebSocket = originalWebSocket;
    }
  });

  it.skip("should call onMessage handler when WebSocket receives a message", async () => {
    const onMessageSpy = vi.fn();
    const options = { onMessage: onMessageSpy };

    const { result } = renderHook(() =>
      useWebSocket("ws://acme.com/ws", options),
    );

    // Wait for connection to be established
    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    // Should receive the welcome message from our mock
    await waitFor(() => {
      expect(result.current.lastMessage).toBe("Welcome to the WebSocket!");
    });

    // onMessage handler should have been called for the welcome message
    expect(onMessageSpy).toHaveBeenCalledOnce();

    // Send another message from the mock server
    wsLink.broadcast("Hello from server!");

    await waitFor(() => {
      expect(result.current.lastMessage).toBe("Hello from server!");
    });

    // onMessage handler should have been called twice now
    expect(onMessageSpy).toHaveBeenCalledTimes(2);
  });

  it("should call onError handler when WebSocket encounters an error", async () => {
    const onErrorSpy = vi.fn();
    const options = { onError: onErrorSpy };

    // Create a mock that will simulate an error
    const errorLink = ws.link("ws://error-test.com/ws");
    mswServer.use(
      errorLink.addEventListener("connection", ({ client }) => {
        // Simulate an error by closing the connection immediately
        client.close(1006, "Connection failed");
      }),
    );

    const { result } = renderHook(() =>
      useWebSocket("ws://error-test.com/ws", options),
    );

    // Initially should not be connected and no error
    expect(result.current.isConnected).toBe(false);
    expect(onErrorSpy).not.toHaveBeenCalled();

    // Wait for the connection to fail
    await waitFor(() => {
      expect(result.current.isConnected).toBe(false);
    });

    // Should have error information
    await waitFor(() => {
      expect(result.current.error).not.toBe(null);
    });

    // onError handler should have been called
    expect(onErrorSpy).toHaveBeenCalled();
  });

  it.skip("should provide sendMessage function to send messages to WebSocket", async () => {
    const { result } = renderHook(() => useWebSocket("ws://acme.com/ws"));

    // Wait for connection to be established
    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    // Should have a sendMessage function
    expect(result.current.sendMessage).toBeDefined();
    expect(typeof result.current.sendMessage).toBe("function");

    // Mock the WebSocket send method
    const sendSpy = vi.spyOn(result.current.socket!, "send");

    // Send a message
    result.current.sendMessage("Hello WebSocket!");

    // Verify that WebSocket.send was called with the correct message
    expect(sendSpy).toHaveBeenCalledOnce();
    expect(sendSpy).toHaveBeenCalledWith("Hello WebSocket!");
  });

  describe("tab visibility", () => {
    class MockWebSocket {
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;
      static readonly CLOSING = 2;
      static readonly CLOSED = 3;

      readonly url: string;
      readyState = MockWebSocket.CONNECTING;
      onopen: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onclose: ((event: CloseEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;

      constructor(url: string) {
        this.url = url;
        queueMicrotask(() => {
          this.readyState = MockWebSocket.OPEN;
          this.onopen?.(new Event("open"));
        });
      }

      send() {}

      close(code = 1000, reason = "Normal closure") {
        this.readyState = MockWebSocket.CLOSED;
        this.onclose?.(
          new CloseEvent("close", { code, reason, wasClean: code === 1000 }),
        );
      }
    }

    let originalWebSocket: typeof WebSocket;
    let instances: MockWebSocket[];

    beforeEach(() => {
      instances = [];
      originalWebSocket = globalThis.WebSocket;
      vi.stubGlobal(
        "WebSocket",
        class extends MockWebSocket {
          constructor(url: string) {
            super(url);
            instances.push(this);
          }
        },
      );
    });

    afterEach(() => {
      globalThis.WebSocket = originalWebSocket;
    });

    it("closes the WebSocket when the tab becomes hidden", async () => {
      const { result, unmount } = renderHook(() =>
        useWebSocket("ws://acme.com/ws"),
      );

      await waitFor(() => expect(result.current.isConnected).toBe(true));

      const closeSpy = vi.spyOn(instances[0], "close");

      act(() => {
        Object.defineProperty(document, "visibilityState", {
          value: "hidden",
          configurable: true,
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });

      await waitFor(() => expect(result.current.isConnected).toBe(false));
      expect(closeSpy).toHaveBeenCalledOnce();

      unmount();
    });

    it("reconnects the WebSocket when the tab becomes visible again", async () => {
      const { result, unmount } = renderHook(() =>
        useWebSocket("ws://acme.com/ws"),
      );

      await waitFor(() => expect(result.current.isConnected).toBe(true));
      expect(instances).toHaveLength(1);

      // Hide the tab
      act(() => {
        Object.defineProperty(document, "visibilityState", {
          value: "hidden",
          configurable: true,
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });

      await waitFor(() => expect(result.current.isConnected).toBe(false));

      // Show the tab again
      act(() => {
        Object.defineProperty(document, "visibilityState", {
          value: "visible",
          configurable: true,
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });

      // A second WebSocket instance should have been created
      await waitFor(() => expect(instances).toHaveLength(2));
      await waitFor(() => expect(result.current.isConnected).toBe(true));

      unmount();
    });

    it("does not reconnect when disconnect() was called while the tab was hidden", async () => {
      const { result, unmount } = renderHook(() =>
        useWebSocket("ws://acme.com/ws"),
      );

      await waitFor(() => expect(result.current.isConnected).toBe(true));

      // Hide the tab
      act(() => {
        Object.defineProperty(document, "visibilityState", {
          value: "hidden",
          configurable: true,
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });

      await waitFor(() => expect(result.current.isConnected).toBe(false));

      // Explicit user disconnect while hidden
      act(() => {
        result.current.disconnect();
      });

      // Show the tab again — should NOT reconnect
      act(() => {
        Object.defineProperty(document, "visibilityState", {
          value: "visible",
          configurable: true,
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });

      // Still only one instance; still disconnected
      expect(instances).toHaveLength(1);
      expect(result.current.isConnected).toBe(false);

      unmount();
    });
  });

  it("should not send message when WebSocket is not connected", () => {
    const { result } = renderHook(() => useWebSocket("ws://acme.com/ws"));

    // Initially should not be connected
    expect(result.current.isConnected).toBe(false);
    expect(result.current.sendMessage).toBeDefined();

    // Mock the WebSocket send method (even though socket might be null)
    const sendSpy = vi.fn();
    if (result.current.socket) {
      vi.spyOn(result.current.socket, "send").mockImplementation(sendSpy);
    }

    // Try to send a message when not connected
    result.current.sendMessage("Hello WebSocket!");

    // Verify that WebSocket.send was not called
    expect(sendSpy).not.toHaveBeenCalled();
  });
});
