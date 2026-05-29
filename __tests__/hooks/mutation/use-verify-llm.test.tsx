import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useVerifyLlm } from "#/hooks/mutation/use-verify-llm";
import LlmVerifyService from "#/api/llm-verify-service/llm-verify-service.api";
import { VERIFY_ENDPOINT_MISSING } from "#/api/llm-verify-service/llm-verify-service.types";

vi.mock("#/api/llm-verify-service/llm-verify-service.api", () => ({
  default: { verify: vi.fn() },
}));

function wrap() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useVerifyLlm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the agent-server verify response on success", async () => {
    const mockVerify = vi.mocked(LlmVerifyService.verify);
    mockVerify.mockResolvedValue({
      status: "success",
      message: null,
      provider: "anthropic",
    });

    const { result } = renderHook(() => useVerifyLlm(), { wrapper: wrap() });
    result.current.mutate({
      model: "anthropic/claude-3-5-sonnet-20241022",
      api_key: "sk-ant-xxx",
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      status: "success",
      message: null,
      provider: "anthropic",
    });
    expect(mockVerify).toHaveBeenCalledWith({
      model: "anthropic/claude-3-5-sonnet-20241022",
      api_key: "sk-ant-xxx",
    });
  });

  it("forwards the endpoint_missing sentinel through the hook", async () => {
    const mockVerify = vi.mocked(LlmVerifyService.verify);
    mockVerify.mockResolvedValue({ status: VERIFY_ENDPOINT_MISSING });

    const { result } = renderHook(() => useVerifyLlm(), { wrapper: wrap() });
    result.current.mutate({ model: "openai/gpt-4o" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ status: VERIFY_ENDPOINT_MISSING });
  });

  it("propagates transport errors", async () => {
    const mockVerify = vi.mocked(LlmVerifyService.verify);
    mockVerify.mockRejectedValue(new Error("ECONNREFUSED"));

    const { result } = renderHook(() => useVerifyLlm(), { wrapper: wrap() });
    result.current.mutate({ model: "openai/gpt-4o" });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("ECONNREFUSED");
  });
});
