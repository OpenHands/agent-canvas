import { LLMMetadataClient } from "@openhands/typescript-client/clients";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LLMSubscriptionService from "#/api/llm-subscription-service";
const {
  mockGetStatus,
  mockStartDeviceLogin,
  mockPollDeviceLogin,
  mockLogout,
  mockClose,
} = vi.hoisted(() => ({
  mockGetStatus: vi.fn(),
  mockStartDeviceLogin: vi.fn(),
  mockPollDeviceLogin: vi.fn(),
  mockLogout: vi.fn(),
  mockClose: vi.fn(),
}));

vi.mock("@openhands/typescript-client/clients", async () => {
  const actual = await vi.importActual<
    typeof import("@openhands/typescript-client/clients")
  >("@openhands/typescript-client/clients");
  return {
    ...actual,
    LLMMetadataClient: vi.fn(function LLMMetadataClientMock() {
      return {
        getOpenAISubscriptionStatus: mockGetStatus,
        startOpenAISubscriptionDeviceLogin: mockStartDeviceLogin,
        pollOpenAISubscriptionDeviceLogin: mockPollDeviceLogin,
        logoutOpenAISubscription: mockLogout,
        close: mockClose,
      };
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
    mockGetStatus.mockResolvedValue({
      authenticated: true,
      email: "user@example.com",
      expires_at: 123,
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
    expect(mockGetStatus).toHaveBeenCalled();
    expect(mockClose).toHaveBeenCalled();
  });

  it("normalizes device login challenge responses", async () => {
    mockStartDeviceLogin.mockResolvedValue({
      device_code: "device-123",
      user_code: "ABCD-EFGH",
      verification_uri: "https://auth.openai.com/activate",
      verification_uri_complete: "https://auth.openai.com/activate?code=ABCD",
      expires_in: 900,
      interval: 5,
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

    expect(mockStartDeviceLogin).toHaveBeenCalled();
  });

  it("posts the device code when polling login", async () => {
    mockPollDeviceLogin.mockResolvedValue({ connected: true });

    await expect(
      LLMSubscriptionService.pollOpenAIDeviceLogin("device-123"),
    ).resolves.toMatchObject({ connected: true });

    expect(mockPollDeviceLogin).toHaveBeenCalledWith("device-123");
  });

  it("calls the logout endpoint", async () => {
    mockLogout.mockResolvedValue({ connected: false });

    await expect(LLMSubscriptionService.logoutOpenAI()).resolves.toMatchObject({
      connected: false,
    });

    expect(mockLogout).toHaveBeenCalled();
  });
});
