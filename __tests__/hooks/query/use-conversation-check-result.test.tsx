import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useConversationCheckResult } from "#/hooks/query/use-conversation-check-result";
import { CHECK_RESULT_PATH } from "#/utils/check-result";
import { ExecutionStatus } from "#/types/agent-server/core/base/common";

const downloadFileMock = vi.fn();
vi.mock("#/api/runtime-service/agent-server-runtime-service", () => ({
  default: {
    downloadFile: (...args: unknown[]) => downloadFileMock(...args),
  },
}));

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const Wrapper = function ConversationCheckResultTestWrapper({
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

function arrayBufferFromString(value: string): ArrayBuffer {
  return new TextEncoder().encode(value).buffer as ArrayBuffer;
}

describe("useConversationCheckResult", () => {
  beforeEach(() => {
    downloadFileMock.mockReset();
  });

  it("reads and parses the conversation verification result", async () => {
    downloadFileMock.mockResolvedValue(
      arrayBufferFromString(JSON.stringify({ status: "passed" })),
    );

    const { result } = renderHook(
      () =>
        useConversationCheckResult({
          conversationId: "conversation-1",
          conversationUrl: "https://agent.example.com/conversations/1",
          sessionApiKey: "session-key",
          executionStatus: ExecutionStatus.IDLE,
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(downloadFileMock).toHaveBeenCalledWith(
      "https://agent.example.com/conversations/1",
      "session-key",
      CHECK_RESULT_PATH,
    );
    expect(result.current.data?.status).toBe("passed");
  });

  it("stays silent while a conversation is still running", async () => {
    renderHook(
      () =>
        useConversationCheckResult({
          conversationId: "conversation-1",
          conversationUrl: "https://agent.example.com/conversations/1",
          sessionApiKey: "session-key",
          executionStatus: ExecutionStatus.RUNNING,
        }),
      { wrapper: makeWrapper() },
    );

    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });

    expect(downloadFileMock).not.toHaveBeenCalled();
  });
});
