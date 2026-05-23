import { LLMMetadataClient } from "@openhands/typescript-client/clients";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LLMSubscriptionService from "#/api/llm-subscription-service";
import {
  OPENAI_SUBSCRIPTION_DEVICE_POLL_PATH,
  OPENAI_SUBSCRIPTION_DEVICE_START_PATH,
  OPENAI_SUBSCRIPTION_LOGOUT_PATH,
  OPENAI_SUBSCRIPTION_STATUS_PATH,
} from "#/constants/llm-subscription";

const { mockGet, mockPost, mockClose } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockClose: vi.fn(),
}));

vi.mock("@openhands/typescript-client/clients", async () => {
  const actual = await vi.importActual<
    typeof import("@openhands/typescript-client/clients")
  >("@openhands/typescript-client/clients");
  return {
    ...actual,
    LLMMetadataClient: vi.fn(function LLMMetadataClientMock() {
      return { client: { get: mockGet, post: mockPost }, close: mockClose };
    }),
  };
});

vi.mock("#/api/agent-server-client-options", () => ({
  getAgentServerClientOptions: vi.fn(() => ({
    host: "http://localhost:18000",
    apiKey: "session-key",
    workingDir: "/workspace/project",
  })),
}));

describe("LLMSubscriptionService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes OpenAI subscription status", async () => {
    mockGet.mockResolvedValue({
      data: {
        authenticated: true,
        email: "user@example.com",
        expires_at: 123,
      },
    });

    await expect(LLMSubscriptionService.getOpenAIStatus()).resolves.toEqual({
      vendor: "openai",
      connected: true,
      accountEmail: "user@example.com",
      expiresAt: 123,
    });

    expect(LLMMetadataClient).toHaveBeenCalledWith({
      host: "http://localhost:18000",
      apiKey: "session-key",
      workingDir: "/workspace/project",
    });
    expect(mockGet).toHaveBeenCalledWith(OPENAI_SUBSCRIPTION_STATUS_PATH);
    expect(mockClose).toHaveBeenCalled();
  });

  it("normalizes device login challenge responses", async () => {
    mockPost.mockResolvedValue({
      data: {
        device_code: "device-123",
        user_code: "ABCD-EFGH",
        verification_uri: "https://auth.openai.com/activate",
        verification_uri_complete: "https://auth.openai.com/activate?code=ABCD",
        expires_in: 900,
        interval: 5,
      },
    });

    await expect(
      LLMSubscriptionService.startOpenAIDeviceLogin(),
    ).resolves.toEqual({
      deviceCode: "device-123",
      userCode: "ABCD-EFGH",
      verificationUri: "https://auth.openai.com/activate",
      verificationUriComplete: "https://auth.openai.com/activate?code=ABCD",
      expiresAt: 900,
      intervalSeconds: 5,
    });

    expect(mockPost).toHaveBeenCalledWith(
      OPENAI_SUBSCRIPTION_DEVICE_START_PATH,
    );
  });

  it("posts the device code when polling login", async () => {
    mockPost.mockResolvedValue({ data: { connected: true } });

    await expect(
      LLMSubscriptionService.pollOpenAIDeviceLogin("device-123"),
    ).resolves.toMatchObject({ connected: true });

    expect(mockPost).toHaveBeenCalledWith(
      OPENAI_SUBSCRIPTION_DEVICE_POLL_PATH,
      { device_code: "device-123" },
    );
  });

  it("calls the logout endpoint", async () => {
    mockPost.mockResolvedValue({ data: { connected: false } });

    await expect(LLMSubscriptionService.logoutOpenAI()).resolves.toMatchObject({
      connected: false,
    });

    expect(mockPost).toHaveBeenCalledWith(OPENAI_SUBSCRIPTION_LOGOUT_PATH);
  });
});
