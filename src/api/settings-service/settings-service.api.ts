import { DEFAULT_SETTINGS } from "#/services/settings";
import {
  Provider,
  Settings,
  SettingsSchema,
  SettingsValue,
} from "#/types/settings";
import { getStoredGitProviders } from "../secrets-service";
import { getActiveBackend } from "../backend-registry/active-store";
import {
  fetchCloudConversationSettingsSchema,
  fetchCloudSettings,
  fetchCloudSettingsSchema,
  saveCloudSettings,
} from "../cloud/settings-service.api";
import { createHttpClient, createSettingsClient } from "../typescript-client";

/**
 * Response from GET /api/settings
 * Mirrors the SettingsResponse model in the agent server
 */
export interface SettingsApiResponse {
  agent_settings: Record<string, SettingsValue>;
  conversation_settings: Record<string, SettingsValue>;
  llm_api_key_is_set: boolean;
}

/**
 * Request payload for PATCH /api/settings
 */
export interface SettingsUpdateRequest {
  agent_settings_diff?: Record<string, SettingsValue>;
  conversation_settings_diff?: Record<string, SettingsValue>;
  disabled_skills?: string[];
}

/**
 * Secret exposure mode for X-Expose-Secrets header.
 *
 * - undefined: Returns redacted secrets ("**********")
 * - "encrypted": Returns cipher-encrypted values (safe for frontend to round-trip)
 * - "plaintext": Returns raw secret values (backend use only!)
 */
export type ExposeSecretsMode = "encrypted" | "plaintext" | undefined;

const deepClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const mergeRecords = (
  base: Record<string, SettingsValue> | null | undefined,
  next: Record<string, SettingsValue> | null | undefined,
) => ({ ...(base ?? {}), ...(next ?? {}) });

/**
 * Retry helper for API calls with exponential backoff.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 500,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries - 1) {
        // Exponential backoff: 500ms, 1000ms, 2000ms
        const delay = baseDelayMs * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

/**
 * In-memory cache for settings to avoid repeated network calls.
 * The cache is invalidated on save operations.
 */
let settingsCache: {
  /** Settings with redacted secrets for display */
  redacted: SettingsApiResponse | null;
  /** Settings with encrypted secrets for conversation start */
  encrypted: SettingsApiResponse | null;
  /** Timestamp when the cache was last populated */
  timestamp: number;
} = {
  redacted: null,
  encrypted: null,
  timestamp: 0,
};

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const isCacheValid = () => Date.now() - settingsCache.timestamp < CACHE_TTL_MS;

const clearCache = () => {
  settingsCache = { redacted: null, encrypted: null, timestamp: 0 };
};

/**
 * Transform API response into Settings object with derived fields.
 */
const transformApiResponse = (
  response: SettingsApiResponse,
): Partial<Settings> => {
  const agentSettings = response.agent_settings ?? {};
  const conversationSettings = response.conversation_settings ?? {};

  return {
    agent_settings: agentSettings,
    conversation_settings: conversationSettings,
    llm_api_key_set: response.llm_api_key_is_set,
  };
};

/**
 * Sync derived settings fields from agent_settings and conversation_settings.
 * This ensures backward compatibility with code that reads top-level fields.
 */
const syncDerivedSettings = (settings: Partial<Settings>): Settings => {
  const agentSettings = mergeRecords(
    DEFAULT_SETTINGS.agent_settings ?? {},
    settings.agent_settings ?? {},
  );
  const conversationSettings = mergeRecords(
    DEFAULT_SETTINGS.conversation_settings ?? {},
    settings.conversation_settings ?? {},
  );

  // The agent-server has no concept of provider_tokens_set; the GUI derives it
  // from locally-stored git provider credentials so the UI knows which
  // providers are configured after a save.
  const storedProviders = getStoredGitProviders();
  const derivedProviderTokensSet = Object.fromEntries(
    Object.entries(storedProviders).map(([provider, value]) => [
      provider,
      value?.host ?? null,
    ]),
  ) as Partial<Record<Provider, string | null>>;

  const merged = {
    ...deepClone(DEFAULT_SETTINGS),
    ...settings,
    provider_tokens_set: {
      ...(DEFAULT_SETTINGS.provider_tokens_set ?? {}),
      ...(settings.provider_tokens_set ?? {}),
      ...derivedProviderTokensSet,
    },
    agent_settings: agentSettings,
    conversation_settings: conversationSettings,
  } as Settings;

  const llm = agentSettings.llm as Record<string, SettingsValue> | undefined;
  const condenser = agentSettings.condenser as
    | Record<string, SettingsValue>
    | undefined;

  if (typeof agentSettings.agent === "string") {
    merged.agent = agentSettings.agent;
  }
  if (typeof llm?.model === "string" && llm.model.length > 0) {
    merged.llm_model = llm.model;
  }
  if (typeof llm?.base_url === "string") {
    merged.llm_base_url = llm.base_url;
  }
  // Note: api_key may be redacted ("**********") when fetched without expose header
  // We don't sync it to top-level llm_api_key to avoid overwriting with redacted value
  if (typeof condenser?.enabled === "boolean") {
    merged.enable_default_condenser = condenser.enabled;
  }
  if (typeof condenser?.max_size === "number") {
    merged.condenser_max_size = condenser.max_size;
  }
  if (agentSettings.mcp_config) {
    merged.mcp_config = agentSettings.mcp_config as Settings["mcp_config"];
  }

  if (typeof conversationSettings.confirmation_mode === "boolean") {
    merged.confirmation_mode = conversationSettings.confirmation_mode;
  }
  if (
    typeof conversationSettings.security_analyzer === "string" ||
    conversationSettings.security_analyzer === null
  ) {
    merged.security_analyzer = conversationSettings.security_analyzer as
      | string
      | null;
  }
  if (typeof conversationSettings.max_iterations === "number") {
    merged.max_iterations = conversationSettings.max_iterations;
  }

  merged.search_api_key_set = !!merged.search_api_key;

  return merged;
};

class SettingsService {
  /**
   * Fetch settings from the agent server API with retry logic.
   *
   * @param exposeSecrets - Controls how secrets are returned:
   *   - undefined: Secrets are redacted ("**********") - safe for display
   *   - "encrypted": Secrets are cipher-encrypted - safe for round-trip to start conversation
   *   - "plaintext": Raw secrets - DO NOT USE from frontend
   */
  static async fetchSettingsFromApi(
    exposeSecrets?: ExposeSecretsMode,
  ): Promise<SettingsApiResponse> {
    const headers: Record<string, string> = {};
    if (exposeSecrets) {
      headers["X-Expose-Secrets"] = exposeSecrets;
    }

    const response = await withRetry(() =>
      createHttpClient().get<SettingsApiResponse>("/api/settings", { headers }),
    );

    return response.data;
  }

  /**
   * Get settings for display (secrets are redacted).
   * Uses in-memory cache for performance.
   */
  static async getSettings(): Promise<Settings> {
    // Cloud SaaS uses a different settings shape (flat top-level fields
    // including provider_tokens_set, llm_model, etc.). Branch out before
    // touching the local-only cache: cloud responses bypass the local
    // SettingsApiResponse shape and feed straight into syncDerivedSettings
    // so cloud-native fields like provider_tokens_set reach the GUI's
    // useUserProviders → useAppInstallations → useGitRepositories chain.
    if (getActiveBackend().backend.kind === "cloud") {
      try {
        const cloud = await withRetry(() => fetchCloudSettings());
        return syncDerivedSettings(cloud);
      } catch (error) {
        console.warn("Failed to fetch cloud settings, using defaults:", error);
        return syncDerivedSettings({});
      }
    }

    // Check cache first
    if (isCacheValid() && settingsCache.redacted) {
      return syncDerivedSettings(transformApiResponse(settingsCache.redacted));
    }

    try {
      const response = await this.fetchSettingsFromApi();
      settingsCache.redacted = response;
      settingsCache.timestamp = Date.now();
      return syncDerivedSettings(transformApiResponse(response));
    } catch (error) {
      // If API fails, return defaults
      console.warn("Failed to fetch settings from API, using defaults:", error);
      return syncDerivedSettings({});
    }
  }

  /**
   * Get settings with encrypted secrets for starting conversations.
   * The encrypted secrets can be passed to the start conversation API
   * with secrets_encrypted=true for server-side decryption.
   *
   * @throws Error if encrypted settings cannot be fetched - conversations
   *   should not start with broken/redacted credentials.
   */
  static async getSettingsForConversation(): Promise<{
    agentSettings: Record<string, SettingsValue>;
    conversationSettings: Record<string, SettingsValue>;
    secretsEncrypted: boolean;
  }> {
    // Check cache first
    if (isCacheValid() && settingsCache.encrypted) {
      return {
        agentSettings: settingsCache.encrypted.agent_settings,
        conversationSettings: settingsCache.encrypted.conversation_settings,
        secretsEncrypted: true,
      };
    }

    // Fetch encrypted settings - this MUST succeed for conversations to work.
    // Do not fall back to redacted settings as that would cause auth failures.
    const response = await this.fetchSettingsFromApi("encrypted");
    settingsCache.encrypted = response;
    if (!settingsCache.timestamp) {
      settingsCache.timestamp = Date.now();
    }
    return {
      agentSettings: response.agent_settings,
      conversationSettings: response.conversation_settings,
      secretsEncrypted: true,
    };
  }

  static async getSettingsSchema(): Promise<SettingsSchema> {
    if (getActiveBackend().backend.kind === "cloud") {
      return (await fetchCloudSettingsSchema()) as SettingsSchema;
    }
    return (await createSettingsClient().getAgentSchema()) as SettingsSchema;
  }

  static async getConversationSettingsSchema(): Promise<SettingsSchema> {
    if (getActiveBackend().backend.kind === "cloud") {
      return (await fetchCloudConversationSettingsSchema()) as SettingsSchema;
    }
    return (await createSettingsClient().getConversationSchema()) as SettingsSchema;
  }

  /**
   * Save settings to the agent server API.
   * Uses PATCH for incremental updates.
   */
  static async saveSettings(
    settings: Partial<Settings> & Record<string, unknown>,
  ): Promise<boolean> {
    const payload: SettingsUpdateRequest = {};

    // Extract agent_settings_diff
    const agentSettingsDiff = settings.agent_settings_diff as
      | Record<string, SettingsValue>
      | undefined;
    if (agentSettingsDiff && Object.keys(agentSettingsDiff).length > 0) {
      payload.agent_settings_diff = agentSettingsDiff;
    }

    // Extract conversation_settings_diff
    const conversationSettingsDiff = settings.conversation_settings_diff as
      | Record<string, SettingsValue>
      | undefined;
    if (
      conversationSettingsDiff &&
      Object.keys(conversationSettingsDiff).length > 0
    ) {
      payload.conversation_settings_diff = conversationSettingsDiff;
    }

    // Extract disabled_skills (cloud-only — local agent-server has no skills concept)
    const disabledSkills = settings.disabled_skills as string[] | undefined;
    if (Array.isArray(disabledSkills)) {
      payload.disabled_skills = disabledSkills;
    }

    // Only call API if we have something to update
    if (
      !payload.agent_settings_diff &&
      !payload.conversation_settings_diff &&
      payload.disabled_skills === undefined
    ) {
      return true;
    }

    if (getActiveBackend().backend.kind === "cloud") {
      await withRetry(() => saveCloudSettings(payload));
    } else {
      // The local agent-server PATCH /api/settings rejects unknown fields and
      // requires at least one of the two diff fields. Strip disabled_skills
      // and skip the request entirely if nothing else was changed.
      const { disabled_skills: _droppedDisabledSkills, ...localPayload } =
        payload;
      if (
        !localPayload.agent_settings_diff &&
        !localPayload.conversation_settings_diff
      ) {
        return true;
      }
      await withRetry(() =>
        createHttpClient().patch<SettingsApiResponse>(
          "/api/settings",
          localPayload,
        ),
      );
    }

    // Invalidate cache after successful save
    clearCache();

    return true;
  }

  /**
   * Invalidate the settings cache.
   * Call this when settings may have changed externally.
   */
  static invalidateCache(): void {
    clearCache();
  }
}

export default SettingsService;
