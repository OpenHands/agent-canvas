import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  joinWorkspaceUrl,
  useWorkspaceSession,
} from "#/hooks/query/use-workspace-session";

// We mock the workspace factory rather than the lower-level HttpClient:
// that's where our wiring contract lives (we hand the typescript-client a
// conversation id and trust it to do the right POST + return a base URL).
const startWorkspaceSessionMock = vi.fn();
const createRemoteWorkspaceMock = vi.fn();

vi.mock("#/api/typescript-client", async (importOriginal) => {
  const real = await importOriginal<typeof import("#/api/typescript-client")>();
  return {
    ...real,
    createRemoteWorkspace: (...args: unknown[]) => {
      createRemoteWorkspaceMock(...args);
      return {
        startWorkspaceSession: startWorkspaceSessionMock,
      };
    },
  };
});

const useActiveConversationMock = vi.fn();
vi.mock("#/hooks/query/use-active-conversation", () => ({
  useActiveConversation: () => useActiveConversationMock(),
}));

const useRuntimeIsReadyMock = vi.fn();
vi.mock("#/hooks/use-runtime-is-ready", () => ({
  useRuntimeIsReady: () => useRuntimeIsReadyMock(),
}));

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const Wrapper = function WorkspaceSessionTestWrapper({
    children,
  }: {
    children: React.ReactNode;
  }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
  return Wrapper;
}

// Yields back to the event loop a few microtasks deep so react-query has a
// chance to schedule (and, in the negative-path tests, to NOT schedule) the
// query. ESLint forbids returning the timer id from `new Promise(...)`, so
// we wrap setTimeout in a void callback.
function flushScheduler(ms = 10): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

beforeEach(() => {
  startWorkspaceSessionMock.mockReset();
  createRemoteWorkspaceMock.mockReset();
  useActiveConversationMock.mockReset();
  useRuntimeIsReadyMock.mockReset();
  useRuntimeIsReadyMock.mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useWorkspaceSession", () => {
  it("calls startWorkspaceSession and exposes the returned baseUrl", async () => {
    useActiveConversationMock.mockReturnValue({
      data: {
        id: "conv-1",
        conversation_url: "https://agent.example.com/api/conversations/conv-1",
        session_api_key: "key-abc",
      },
    });
    startWorkspaceSessionMock.mockResolvedValue(
      "https://agent.example.com/api/conversations/conv-1/workspace/",
    );

    const { result } = renderHook(() => useWorkspaceSession(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data?.baseUrl).toBe(
        "https://agent.example.com/api/conversations/conv-1/workspace/",
      );
    });

    expect(createRemoteWorkspaceMock).toHaveBeenCalledTimes(1);
    expect(createRemoteWorkspaceMock).toHaveBeenCalledWith({
      conversationUrl: "https://agent.example.com/api/conversations/conv-1",
      sessionApiKey: "key-abc",
    });
    expect(startWorkspaceSessionMock).toHaveBeenCalledTimes(1);
    expect(startWorkspaceSessionMock).toHaveBeenCalledWith("conv-1");
  });

  it("does not call startWorkspaceSession until the runtime is ready", async () => {
    useActiveConversationMock.mockReturnValue({
      data: {
        id: "conv-1",
        conversation_url: "https://agent.example.com/api/conversations/conv-1",
        session_api_key: "key-abc",
      },
    });
    useRuntimeIsReadyMock.mockReturnValue(false);

    const { result } = renderHook(() => useWorkspaceSession(), {
      wrapper: makeWrapper(),
    });

    // Give react-query a tick to schedule (it shouldn't).
    await flushScheduler();
    expect(startWorkspaceSessionMock).not.toHaveBeenCalled();
    expect(result.current.data).toBeNull();
  });

  it("does not call startWorkspaceSession without a conversation id", async () => {
    useActiveConversationMock.mockReturnValue({ data: undefined });

    renderHook(() => useWorkspaceSession(), { wrapper: makeWrapper() });

    await flushScheduler();
    expect(startWorkspaceSessionMock).not.toHaveBeenCalled();
  });

  it("surfaces the error when the workspace-session POST fails", async () => {
    useActiveConversationMock.mockReturnValue({
      data: {
        id: "conv-1",
        conversation_url: "https://agent.example.com/api/conversations/conv-1",
        session_api_key: "bad-key",
      },
    });
    startWorkspaceSessionMock.mockRejectedValue(new Error("401 Unauthorized"));

    const { result } = renderHook(() => useWorkspaceSession(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toMatch(/401/);
    expect(result.current.data).toBeNull();
  });
});

describe("joinWorkspaceUrl", () => {
  const base = "https://agent.example.com/api/conversations/c1/workspace/";

  it("returns the base URL when no relative path is supplied", () => {
    expect(joinWorkspaceUrl(base)).toBe(base);
    expect(joinWorkspaceUrl(base, "")).toBe(base);
    expect(joinWorkspaceUrl(base, null)).toBe(base);
  });

  it("appends a single-segment path", () => {
    expect(joinWorkspaceUrl(base, "index.html")).toBe(`${base}index.html`);
  });

  it("appends nested paths preserving separators", () => {
    expect(joinWorkspaceUrl(base, "src/components/App.tsx")).toBe(
      `${base}src/components/App.tsx`,
    );
  });

  it("strips leading slashes on the relative path", () => {
    expect(joinWorkspaceUrl(base, "/index.html")).toBe(`${base}index.html`);
    expect(joinWorkspaceUrl(base, "///deep/path.md")).toBe(
      `${base}deep/path.md`,
    );
  });

  it("URL-encodes individual segments but not the separators", () => {
    expect(joinWorkspaceUrl(base, "my files/has spaces.txt")).toBe(
      `${base}my%20files/has%20spaces.txt`,
    );
    expect(joinWorkspaceUrl(base, "tëst/résumé.pdf")).toBe(
      `${base}t%C3%ABst/r%C3%A9sum%C3%A9.pdf`,
    );
  });
});
