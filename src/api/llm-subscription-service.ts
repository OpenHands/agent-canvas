import { LLMMetadataClient } from "@openhands/typescript-client/clients";
import { getAgentServerClientOptions } from "./agent-server-client-options";
import {
  OPENAI_SUBSCRIPTION_DEVICE_POLL_PATH,
  OPENAI_SUBSCRIPTION_DEVICE_START_PATH,
  OPENAI_SUBSCRIPTION_LOGOUT_PATH,
  OPENAI_SUBSCRIPTION_STATUS_PATH,
  OPENAI_SUBSCRIPTION_VENDOR,
} from "#/constants/llm-subscription";

type AgentServerHttpTransport = {
  get<T>(url: string): Promise<{ data: T }>;
  post<T>(url: string, data?: unknown): Promise<{ data: T }>;
};

type LLMMetadataClientWithTransport = {
  client?: AgentServerHttpTransport;
};

type RawSubscriptionStatus = Record<string, unknown>;
type RawDeviceStart = Record<string, unknown>;

export interface LLMSubscriptionStatus {
  vendor: typeof OPENAI_SUBSCRIPTION_VENDOR;
  connected: boolean;
  accountEmail: string | null;
  expiresAt: string | number | null;
}

export interface LLMSubscriptionDeviceChallenge {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string | null;
  expiresAt: string | number | null;
  intervalSeconds: number | null;
}

const readString = (
  value: Record<string, unknown>,
  keys: string[],
): string | null => {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  }
  return null;
};

const readNumber = (
  value: Record<string, unknown>,
  keys: string[],
): number | null => {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
  }
  return null;
};

const readBoolean = (
  value: Record<string, unknown>,
  keys: string[],
): boolean => {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "boolean") {
      return candidate;
    }
  }
  return false;
};

const getTransport = (client: LLMMetadataClient): AgentServerHttpTransport => {
  const transport = (client as unknown as LLMMetadataClientWithTransport)
    .client;
  if (!transport) {
    throw new Error("LLM metadata client transport is unavailable");
  }
  return transport;
};

async function withLlmClient<T>(
  callback: (transport: AgentServerHttpTransport) => Promise<T>,
): Promise<T> {
  const client = new LLMMetadataClient(getAgentServerClientOptions());
  try {
    return await callback(getTransport(client));
  } finally {
    client.close();
  }
}

function normalizeStatus(raw: RawSubscriptionStatus): LLMSubscriptionStatus {
  return {
    vendor: OPENAI_SUBSCRIPTION_VENDOR,
    connected: readBoolean(raw, ["connected", "authenticated", "is_connected"]),
    accountEmail: readString(raw, ["account_email", "email", "account"]),
    expiresAt:
      readString(raw, ["expires_at", "expiresAt"]) ??
      readNumber(raw, ["expires_at", "expiresAt"]),
  };
}

function normalizeDeviceChallenge(
  raw: RawDeviceStart,
): LLMSubscriptionDeviceChallenge {
  const deviceCode = readString(raw, ["device_code", "deviceCode"]);
  const userCode = readString(raw, ["user_code", "userCode"]);
  const verificationUri = readString(raw, [
    "verification_uri",
    "verificationUri",
    "verification_url",
    "verificationUrl",
  ]);

  if (!deviceCode || !userCode || !verificationUri) {
    throw new Error("Subscription device login response is incomplete");
  }

  return {
    deviceCode,
    userCode,
    verificationUri,
    verificationUriComplete: readString(raw, [
      "verification_uri_complete",
      "verificationUriComplete",
      "verification_url_complete",
      "verificationUrlComplete",
    ]),
    expiresAt:
      readString(raw, ["expires_at", "expiresAt"]) ??
      readNumber(raw, ["expires_at", "expiresAt", "expires_in", "expiresIn"]),
    intervalSeconds: readNumber(raw, [
      "interval",
      "interval_seconds",
      "intervalSeconds",
    ]),
  };
}

class LLMSubscriptionService {
  static async getOpenAIStatus(): Promise<LLMSubscriptionStatus> {
    return withLlmClient(async (transport) => {
      const response = await transport.get<RawSubscriptionStatus>(
        OPENAI_SUBSCRIPTION_STATUS_PATH,
      );
      return normalizeStatus(response.data);
    });
  }

  static async startOpenAIDeviceLogin(): Promise<LLMSubscriptionDeviceChallenge> {
    return withLlmClient(async (transport) => {
      const response = await transport.post<RawDeviceStart>(
        OPENAI_SUBSCRIPTION_DEVICE_START_PATH,
      );
      return normalizeDeviceChallenge(response.data);
    });
  }

  static async pollOpenAIDeviceLogin(
    deviceCode: string,
  ): Promise<LLMSubscriptionStatus> {
    return withLlmClient(async (transport) => {
      const response = await transport.post<RawSubscriptionStatus>(
        OPENAI_SUBSCRIPTION_DEVICE_POLL_PATH,
        { device_code: deviceCode },
      );
      return normalizeStatus(response.data);
    });
  }

  static async logoutOpenAI(): Promise<LLMSubscriptionStatus> {
    return withLlmClient(async (transport) => {
      const response = await transport.post<RawSubscriptionStatus>(
        OPENAI_SUBSCRIPTION_LOGOUT_PATH,
      );
      return normalizeStatus(response.data);
    });
  }
}

export default LLMSubscriptionService;
