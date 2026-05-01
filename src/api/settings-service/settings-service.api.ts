import { DEFAULT_SETTINGS } from "#/services/settings";
import { Settings, SettingsSchema, SettingsValue } from "#/types/settings";
import { createSettingsClient } from "../typescript-client";

const LOCAL_CACHE_KEY = "openhands-agent-server-settings";

const deepClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const mergeRecords = (
  base: Record<string, SettingsValue> | null | undefined,
  next: Record<string, SettingsValue> | null | undefined,
) => ({ ...(base ?? {}), ...(next ?? {}) });

/**
 * Read cached settings from localStorage (used as fallback when server unavailable).
 */
const readLocalCache = (): Partial<Settings> => {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(LOCAL_CACHE_KEY);
    if (!raw) return {};
    return (JSON.parse(raw) as Partial<Settings>) ?? {};
  } catch {
    return {};
  }
};

/**
 * Write settings to localStorage as a local cache.
 */
const writeLocalCache = (settings: Settings) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(settings));
};

/**
 * Converts server response format to frontend Settings format.
 * The server stores `agent_settings` and `conversation_settings` as nested records,
 * but the frontend expects top-level fields like `llm_model`, `agent`, etc.
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

  const merged = {
    ...deepClone(DEFAULT_SETTINGS),
    ...settings,
    provider_tokens_set: {
      ...(DEFAULT_SETTINGS.provider_tokens_set ?? {}),
      ...(settings.provider_tokens_set ?? {}),
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
  if (typeof llm?.api_key === "string") {
    merged.llm_api_key = llm.api_key;
  }
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

  merged.llm_api_key_set = !!merged.llm_api_key;
  merged.search_api_key_set = !!merged.search_api_key;

  return merged;
};

class SettingsService {
  /**
   * Get settings from the agent server, with local cache fallback.
   * The server persists settings to disk, while localStorage acts as a cache
   * for faster initial loads and offline scenarios.
   */
  static async getSettings(): Promise<Settings> {
    try {
      const client = createSettingsClient();
      const response = await client.getSettings();

      // Convert server response to frontend format
      const fromServer: Partial<Settings> = {
        agent_settings: response.agent_settings,
        conversation_settings: response.conversation_settings,
        llm_api_key_set: response.llm_api_key_is_set,
      };

      const merged = syncDerivedSettings(fromServer);

      // Update local cache
      writeLocalCache(merged);

      return merged;
    } catch {
      // Fallback to local cache if server unavailable
      return syncDerivedSettings(readLocalCache());
    }
  }

  static async getSettingsSchema(): Promise<SettingsSchema> {
    return (await createSettingsClient().getAgentSchema()) as SettingsSchema;
  }

  static async getConversationSettingsSchema(): Promise<SettingsSchema> {
    return (await createSettingsClient().getConversationSchema()) as SettingsSchema;
  }

  /**
   * Save settings to the agent server.
   * Sends only the diff (changed fields) to the server, which merges with existing.
   */
  static async saveSettings(
    settings: Partial<Settings> & Record<string, unknown>,
  ): Promise<boolean> {
    const current = await this.getSettings();

    const agentSettingsDiff = (settings.agent_settings_diff ??
      settings.agent_settings) as Record<string, SettingsValue> | undefined;
    const conversationSettingsDiff = (settings.conversation_settings_diff ??
      settings.conversation_settings) as
      | Record<string, SettingsValue>
      | undefined;

    const nextAgentSettings = mergeRecords(
      current.agent_settings ?? {},
      agentSettingsDiff,
    );
    const nextConversationSettings = mergeRecords(
      current.conversation_settings ?? {},
      conversationSettingsDiff,
    );

    const nextSettings: Partial<Settings> & Record<string, unknown> = {
      ...current,
      ...settings,
      agent_settings: nextAgentSettings,
      conversation_settings: nextConversationSettings,
    };

    const llm = nextAgentSettings.llm as
      | Record<string, SettingsValue>
      | undefined;
    const condenser = nextAgentSettings.condenser as
      | Record<string, SettingsValue>
      | undefined;

    if (llm) {
      if (typeof llm.model === "string") nextSettings.llm_model = llm.model;
      if (typeof llm.base_url === "string") {
        nextSettings.llm_base_url = llm.base_url;
      }
      if (typeof llm.api_key === "string") {
        nextSettings.llm_api_key = llm.api_key;
      }
    }

    if (condenser) {
      if (typeof condenser.enabled === "boolean") {
        nextSettings.enable_default_condenser = condenser.enabled;
      }
      if (typeof condenser.max_size === "number") {
        nextSettings.condenser_max_size = condenser.max_size;
      }
    }

    if (typeof nextConversationSettings.confirmation_mode === "boolean") {
      nextSettings.confirmation_mode =
        nextConversationSettings.confirmation_mode;
    }
    if (typeof nextConversationSettings.security_analyzer === "string") {
      nextSettings.security_analyzer =
        nextConversationSettings.security_analyzer;
    }
    if (typeof nextConversationSettings.max_iterations === "number") {
      nextSettings.max_iterations = nextConversationSettings.max_iterations;
    }
    if (nextAgentSettings.mcp_config) {
      nextSettings.mcp_config =
        nextAgentSettings.mcp_config as Settings["mcp_config"];
    }

    delete nextSettings.agent_settings_diff;
    delete nextSettings.conversation_settings_diff;

    try {
      // Send to agent server for persistence
      const client = createSettingsClient();
      await client.updateSettings({
        agent_settings_diff: agentSettingsDiff,
        conversation_settings_diff: conversationSettingsDiff,
      });

      // Update local cache on success
      const merged = syncDerivedSettings(nextSettings);
      writeLocalCache(merged);

      return true;
    } catch {
      // Fallback: save to local cache only if server unavailable
      const merged = syncDerivedSettings(nextSettings);
      writeLocalCache(merged);
      return true;
    }
  }
}

export default SettingsService;
