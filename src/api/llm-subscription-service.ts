import { LLMMetadataClient } from "@openhands/typescript-client/clients";
import { getAgentServerClientOptions } from "./agent-server-client-options";
import { OPENAI_SUBSCRIPTION_VENDOR } from "#/constants/llm-subscription";

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

async function withLlmClient<T>(
  callback: (client: LLMMetadataClient) => Promise<T>,
): Promise<T> {
  const client = new LLMMetadataClient(getAgentServerClientOptions());
  try {
    return await callback(client);
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
  static async getOpenAIModels(): Promise<string[]> {
    return withLlmClient(async (client) => {
      // Merge the dedicated subscription endpoint with LiteLLM's `chatgpt/`
      // provider, which tracks models accessible via ChatGPT subscription.
      const [subResult, chatgptResult] = await Promise.allSettled([
        client.getOpenAISubscriptionModels(),
        client.getModels("chatgpt"),
      ]);

      const sub =
        subResult.status === "fulfilled" ? (subResult.value ?? []) : [];
      const chatgpt =
        chatgptResult.status === "fulfilled"
          ? (chatgptResult.value ?? []).map((m: string) =>
              m.replace(/^chatgpt\//, ""),
            )
          : [];

      return [...new Set([...sub, ...chatgpt])];
    });
  }

  static async getOpenAIStatus(): Promise<LLMSubscriptionStatus> {
    return withLlmClient(async (client) => {
      const response = await client.getOpenAISubscriptionStatus();
      return normalizeStatus(response as unknown as RawSubscriptionStatus);
    });
  }

  static async startOpenAIDeviceLogin(): Promise<LLMSubscriptionDeviceChallenge> {
    return withLlmClient(async (client) => {
      const response = await client.startOpenAISubscriptionDeviceLogin();
      return normalizeDeviceChallenge(response as unknown as RawDeviceStart);
    });
  }

  static async pollOpenAIDeviceLogin(
    deviceCode: string,
  ): Promise<LLMSubscriptionStatus> {
    return withLlmClient(async (client) => {
      const response =
        await client.pollOpenAISubscriptionDeviceLogin(deviceCode);
      return normalizeStatus(response as unknown as RawSubscriptionStatus);
    });
  }

  static async logoutOpenAI(): Promise<LLMSubscriptionStatus> {
    return withLlmClient(async (client) => {
      const response = await client.logoutOpenAISubscription();
      return normalizeStatus(response as unknown as RawSubscriptionStatus);
    });
  }
}

export default LLMSubscriptionService;
