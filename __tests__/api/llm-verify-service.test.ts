import { describe, it, expect, vi, beforeEach } from "vitest";
import { AxiosError } from "axios";
import { VERIFY_ENDPOINT_MISSING } from "#/api/llm-verify-service/llm-verify-service.types";

// Hoist mocks so they're set up before module imports.
const { mockPost, mockGetClientOptions } = vi.hoisted(() => ({
  mockPost: vi.fn(),
  mockGetClientOptions: vi.fn(),
}));

vi.mock("axios", () => {
  const create = vi.fn(() => ({
    post: mockPost,
    defaults: { headers: { common: {} as Record<string, string> } },
  }));
  // Re-export AxiosError so the service's `instanceof AxiosError` check
  // matches the value the test throws.
  return {
    default: { create },
    AxiosError: class AxiosError extends Error {
      response?: { status: number };
      constructor(message: string, status?: number) {
        super(message);
        this.name = "AxiosError";
        if (status !== undefined) this.response = { status };
      }
    },
  };
});

vi.mock("#/api/agent-server-client-options", () => ({
  getAgentServerClientOptions: mockGetClientOptions,
}));

describe("LlmVerifyService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClientOptions.mockReturnValue({
      host: "http://localhost:18000",
      apiKey: "test-key",
    });
  });

  it("posts request body to /api/llm/verify and returns the response", async () => {
    const { default: LlmVerifyService } = await import(
      "#/api/llm-verify-service/llm-verify-service.api"
    );
    mockPost.mockResolvedValue({
      data: {
        status: "success",
        message: null,
        provider: "anthropic",
      },
    });

    const result = await LlmVerifyService.verify({
      model: "anthropic/claude-3-5-sonnet-20241022",
      api_key: "sk-ant-xxx",
    });

    expect(result).toEqual({
      status: "success",
      message: null,
      provider: "anthropic",
    });
    expect(mockPost).toHaveBeenCalledWith("/api/llm/verify", {
      model: "anthropic/claude-3-5-sonnet-20241022",
      api_key: "sk-ant-xxx",
    });
  });

  it.each([
    ["auth_error", { message: "401 Unauthorized" }],
    ["rate_limited", { message: "429 too many" }],
    ["bad_request", { message: "model not found" }],
    ["timeout", { message: null }],
    ["unreachable", { message: null }],
    ["unknown_error", { message: "boom" }],
  ])("passes through %s status from the agent-server", async (status, extra) => {
    const { default: LlmVerifyService } = await import(
      "#/api/llm-verify-service/llm-verify-service.api"
    );
    mockPost.mockResolvedValue({
      data: { status, provider: "openai", ...extra },
    });

    const result = await LlmVerifyService.verify({ model: "openai/gpt-4o" });

    expect(result).toMatchObject({ status });
  });

  it("returns endpoint_missing sentinel for HTTP 404", async () => {
    const { default: LlmVerifyService } = await import(
      "#/api/llm-verify-service/llm-verify-service.api"
    );
    const { AxiosError: MockAxiosError } = (await import("axios")) as unknown as {
      AxiosError: new (message: string, status?: number) => Error;
    };
    mockPost.mockRejectedValue(new MockAxiosError("not found", 404));

    const result = await LlmVerifyService.verify({ model: "openai/gpt-4o" });

    expect(result).toEqual({ status: VERIFY_ENDPOINT_MISSING });
  });

  it("rethrows non-404 axios errors", async () => {
    const { default: LlmVerifyService } = await import(
      "#/api/llm-verify-service/llm-verify-service.api"
    );
    const { AxiosError: MockAxiosError } = (await import("axios")) as unknown as {
      AxiosError: new (message: string, status?: number) => Error;
    };
    mockPost.mockRejectedValue(new MockAxiosError("server error", 500));

    await expect(
      LlmVerifyService.verify({ model: "openai/gpt-4o" }),
    ).rejects.toBeInstanceOf(AxiosError);
  });

  it("rethrows non-axios errors", async () => {
    const { default: LlmVerifyService } = await import(
      "#/api/llm-verify-service/llm-verify-service.api"
    );
    mockPost.mockRejectedValue(new TypeError("network down"));

    await expect(
      LlmVerifyService.verify({ model: "openai/gpt-4o" }),
    ).rejects.toBeInstanceOf(TypeError);
  });
});
