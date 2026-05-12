import { SkillsClient } from "@openhands/typescript-client/clients";
import { DEFAULT_SETTINGS } from "#/services/settings";
import { ExecutionStatus } from "#/types/agent-server/core";
import { Settings, SettingsValue } from "#/types/settings";
import { isAgentServerToolAvailable } from "./agent-server-compatibility";
import {
  getAgentServerWorkingDir,
  shouldLoadPublicSkills,
} from "./agent-server-config";
import { getEffectiveLocalBackend } from "./backend-registry/active-store";
import { buildAuthHeaders } from "./backend-registry/auth";
import {
  GetSkillsResponse,
  PluginSpec,
  AppConversation,
  AppConversationPage,
} from "./conversation-service/agent-server-conversation-service.types";
import { getAgentServerClientOptions } from "./agent-server-client-options";
import SettingsService from "./settings-service/settings-service.api";
import { getStoredConversationMetadata } from "./conversation-metadata-store";

export interface DirectConversationInfo {
  id: string;
  title?: string | null;
  created_at: string;
  updated_at: string;
  execution_status?: string | null;
  metrics?: {
    accumulated_cost?: number | null;
    max_budget_per_task?: number | null;
    accumulated_token_usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      cache_read_tokens?: number;
      cache_write_tokens?: number;
      context_window?: number;
      per_turn_token?: number;
    } | null;
  } | null;
  agent?: {
    llm?: {
      model?: string | null;
    } | null;
  } | null;
  workspace?: {
    working_dir?: string | null;
  } | null;
}

const DEFAULT_TOOL_NAMES = ["terminal", "file_editor", "task_tracker"];
const BROWSER_TOOL_SET_NAME = "browser_tool_set";

function browserToolsEnabled() {
  return import.meta.env.VITE_ENABLE_BROWSER_TOOLS !== "false";
}

export function toConversationUrl(conversationId: string): string {
  // Local-format conversation URL — points at whichever local agent-server
  // is actually serving the conversation (the bundled one when the active
  // selection is cloud).
  return `${getEffectiveLocalBackend().host}/api/conversations/${conversationId}`;
}

// TODO(i18n): extract "Conversation" once we add CONVERSATION$DEFAULT_TITLE
// with `{{shortId}}` interpolation. Kept as a literal for now to keep the
// fallback inside this pure adapter rather than fanning out to display sites.
export function getDefaultConversationTitle(conversationId: string): string {
  return `Conversation ${conversationId.slice(0, 5)}`;
}

export function toAppConversation(
  info: DirectConversationInfo,
): AppConversation {
  const metadata = getStoredConversationMetadata(info.id);
  return {
    id: info.id,
    created_by_user_id: null,
    selected_repository: metadata?.selected_repository ?? null,
    selected_branch: metadata?.selected_branch ?? null,
    git_provider: metadata?.git_provider ?? null,
    title: info.title?.trim()
      ? info.title
      : getDefaultConversationTitle(info.id),
    trigger: null,
    pr_number: [],
    llm_model: info.agent?.llm?.model ?? DEFAULT_SETTINGS.llm_model,
    metrics: info.metrics
      ? {
          accumulated_cost: info.metrics.accumulated_cost ?? null,
          max_budget_per_task: info.metrics.max_budget_per_task ?? null,
          accumulated_token_usage: info.metrics.accumulated_token_usage
            ? {
                prompt_tokens:
                  info.metrics.accumulated_token_usage.prompt_tokens ?? 0,
                completion_tokens:
                  info.metrics.accumulated_token_usage.completion_tokens ?? 0,
                cache_read_tokens:
                  info.metrics.accumulated_token_usage.cache_read_tokens ?? 0,
                cache_write_tokens:
                  info.metrics.accumulated_token_usage.cache_write_tokens ?? 0,
                context_window:
                  info.metrics.accumulated_token_usage.context_window ?? 0,
                per_turn_token:
                  info.metrics.accumulated_token_usage.per_turn_token ?? 0,
              }
            : null,
        }
      : null,
    created_at: info.created_at,
    updated_at: info.updated_at,
    execution_status:
      (info.execution_status as AppConversation["execution_status"]) ??
      ExecutionStatus.IDLE,
    conversation_url: toConversationUrl(info.id),
    session_api_key: getEffectiveLocalBackend().apiKey || null,
    sandbox_id: null,
    workspace: {
      working_dir: info.workspace?.working_dir ?? getAgentServerWorkingDir(),
    },
    public: false,
    sub_conversation_ids: [],
  };
}

export function toConversationPage(data: {
  items: DirectConversationInfo[];
  next_page_id?: string | null;
}): AppConversationPage {
  return {
    items: data.items.map(toAppConversation),
    next_page_id: data.next_page_id ?? null,
  };
}

type SettingsRecord = Record<string, unknown>;

const AGENT_SETTINGS_METADATA_KEYS = new Set([
  "schema_version",
  "agent_kind",
  "agent",
]);

const CONVERSATION_SETTINGS_METADATA_KEYS = new Set([
  "schema_version",
  "agent_settings",
  "workspace",
  "conversation_id",
  "initial_message",
  "plugins",
]);

function toRecord(value: unknown): SettingsRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return structuredClone(value as SettingsRecord);
}

function normalizeSecretString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function getConversationConfirmationPolicy(
  conversationSettings: SettingsRecord,
) {
  if (conversationSettings.confirmation_mode !== true) {
    return { kind: "NeverConfirm" };
  }

  if (conversationSettings.security_analyzer === "llm") {
    return { kind: "ConfirmRisky", threshold: "HIGH", confirm_unknown: true };
  }

  return { kind: "AlwaysConfirm" };
}

function getConversationSecurityAnalyzer(conversationSettings: SettingsRecord) {
  switch (conversationSettings.security_analyzer) {
    case "llm":
      return { kind: "LLMSecurityAnalyzer" };
    case "pattern":
      return { kind: "PatternSecurityAnalyzer" };
    case "policy_rail":
      return { kind: "PolicyRailSecurityAnalyzer" };
    default:
      return undefined;
  }
}

function getAgentTools() {
  const tools = DEFAULT_TOOL_NAMES.map((name) => ({ name, params: {} }));
  if (
    browserToolsEnabled() &&
    isAgentServerToolAvailable(BROWSER_TOOL_SET_NAME)
  ) {
    tools.push({ name: BROWSER_TOOL_SET_NAME, params: {} });
  }
  return tools;
}

function buildInitialMessage(
  query?: string,
  conversationInstructions?: string,
) {
  const parts = [query?.trim(), conversationInstructions?.trim()].filter(
    Boolean,
  );
  if (parts.length === 0) {
    return null;
  }

  return {
    role: "user",
    content: [{ type: "text", text: parts.join("\n\n") }],
  };
}

function buildCondenserConfig(
  llm: SettingsRecord,
  rawCondenser: unknown,
): SettingsRecord | undefined {
  const condenser = toRecord(rawCondenser);

  if (condenser.enabled !== true) {
    return undefined;
  }

  const condenserLlm = {
    ...llm,
    usage_id: "condenser",
  };

  const config: SettingsRecord = {
    kind: "LLMSummarizingCondenser",
    llm: condenserLlm,
  };

  if (typeof condenser.max_size === "number") {
    config.max_size = condenser.max_size;
  }

  return config;
}

function buildConfiguredAgentSettings(settings: Settings): SettingsRecord {
  const agentSettings = toRecord(settings.agent_settings);
  const llm = toRecord(agentSettings.llm);

  llm.model =
    typeof llm.model === "string" ? llm.model : DEFAULT_SETTINGS.llm_model;

  const apiKey = normalizeSecretString(llm.api_key);
  if (apiKey) {
    llm.api_key = apiKey;
  } else {
    delete llm.api_key;
  }

  const baseUrl = normalizeSecretString(llm.base_url);
  if (baseUrl) {
    llm.base_url = baseUrl;
  } else {
    delete llm.base_url;
  }

  const condenser = buildCondenserConfig(llm, agentSettings.condenser);

  AGENT_SETTINGS_METADATA_KEYS.forEach((key) => delete agentSettings[key]);

  const mcpConfig = toRecord(agentSettings.mcp_config);
  if (Object.keys(mcpConfig).length === 0 || !("mcpServers" in mcpConfig)) {
    delete agentSettings.mcp_config;
  }

  if (condenser) {
    agentSettings.condenser = condenser;
  } else {
    delete agentSettings.condenser;
  }

  return {
    ...agentSettings,
    llm,
    tools: getAgentTools(),
  };
}

function createAgentFromSettings(agentSettings: SettingsRecord) {
  return {
    kind: "Agent",
    ...agentSettings,
    agent_context: {
      load_public_skills: shouldLoadPublicSkills(),
      load_user_skills: true,
    },
  };
}

function buildConfiguredConversationSettings(options: {
  settings: Settings;
  query?: string;
  conversationInstructions?: string;
  plugins?: PluginSpec[];
  workingDir?: string;
}): SettingsRecord {
  const { settings, query, conversationInstructions, plugins, workingDir } =
    options;
  const conversationSettings = toRecord(settings.conversation_settings);
  const initialMessage = buildInitialMessage(query, conversationInstructions);

  CONVERSATION_SETTINGS_METADATA_KEYS.forEach(
    (key) => delete conversationSettings[key],
  );

  return {
    ...conversationSettings,
    workspace: {
      kind: "LocalWorkspace",
      working_dir: workingDir ?? getAgentServerWorkingDir(),
    },
    ...(initialMessage ? { initial_message: initialMessage } : {}),
    ...(plugins?.length
      ? {
          plugins: plugins.map((plugin) => ({
            source: plugin.source,
            ...(plugin.ref ? { ref: plugin.ref } : {}),
            ...(plugin.repo_path ? { repo_path: plugin.repo_path } : {}),
          })),
        }
      : {}),
  };
}

/**
 * A secret looked up from the agent-server at runtime.
 * This allows secrets configured in Settings > Secrets to be available
 * to conversations without exposing values to the frontend.
 */
interface LookupSecret {
  kind: "LookupSecret";
  url: string;
  headers?: Record<string, string>;
  description?: string;
}

export interface StartConversationOptions {
  settings: Settings;
  query?: string;
  conversationInstructions?: string;
  plugins?: PluginSpec[];
  conversationId?: string;
  workingDir?: string;
  /**
   * Pre-fetched agent settings with encrypted secrets.
   * If provided, these will be used instead of settings.agent_settings.
   */
  encryptedAgentSettings?: Record<string, SettingsValue>;
  /**
   * Pre-fetched conversation settings with encrypted secrets.
   * If provided, these will be used instead of settings.conversation_settings.
   */
  encryptedConversationSettings?: Record<string, SettingsValue>;
  /**
   * Whether the secrets in agent/conversation settings are encrypted.
   * If true, the server will decrypt them before use.
   */
  secretsEncrypted?: boolean;
  /**
   * Custom secrets to include in the conversation.
   * Each entry maps a secret name to metadata (description).
   * The actual values are fetched at runtime via LookupSecret.
   */
  customSecrets?: Array<{ name: string; description?: string }>;
}

export function buildStartConversationRequest(
  options: StartConversationOptions,
) {
  // Use encrypted settings if provided, otherwise fall back to regular settings
  const sourceAgentSettings = options.encryptedAgentSettings
    ? { ...options.settings, agent_settings: options.encryptedAgentSettings }
    : options.settings;

  const agentSettings = buildConfiguredAgentSettings(sourceAgentSettings);
  const agent = createAgentFromSettings(agentSettings);

  // For conversation settings, merge encrypted settings if provided
  const sourceConversationOptions = options.encryptedConversationSettings
    ? {
        ...options,
        settings: {
          ...options.settings,
          conversation_settings: options.encryptedConversationSettings,
        },
      }
    : options;

  const conversationSettings = buildConfiguredConversationSettings(
    sourceConversationOptions,
  );

  const payload: Record<string, unknown> = {
    agent,
    workspace: conversationSettings.workspace,
    confirmation_policy:
      getConversationConfirmationPolicy(conversationSettings),
    max_iterations:
      typeof conversationSettings.max_iterations === "number"
        ? conversationSettings.max_iterations
        : 500,
    stuck_detection: true,
    autotitle: true,
    worktree: true,
  };

  // Add secrets_encrypted flag if secrets are encrypted
  if (options.secretsEncrypted) {
    payload.secrets_encrypted = true;
  }

  if (options.conversationId) {
    payload.conversation_id = options.conversationId;
  }

  const securityAnalyzer =
    getConversationSecurityAnalyzer(conversationSettings);
  if (securityAnalyzer) {
    payload.security_analyzer = securityAnalyzer;
  }

  if (conversationSettings.initial_message) {
    payload.initial_message = conversationSettings.initial_message;
  }

  if (conversationSettings.plugins) {
    payload.plugins = conversationSettings.plugins;
  }

  if (conversationSettings.hook_config) {
    payload.hook_config = conversationSettings.hook_config;
  }

  if (conversationSettings.tool_module_qualnames) {
    payload.tool_module_qualnames = conversationSettings.tool_module_qualnames;
  }

  if (conversationSettings.agent_definitions) {
    payload.agent_definitions = conversationSettings.agent_definitions;
  }

  // Add custom secrets as LookupSecret entries.
  // The agent-server fetches the value at runtime from
  // `/api/settings/secrets/{name}` on its own host, so the URL stays
  // host-relative; auth headers come from the active local backend.
  if (options.customSecrets && options.customSecrets.length > 0) {
    const backend = getEffectiveLocalBackend();
    const headers = buildAuthHeaders(backend);

    const secrets: Record<string, LookupSecret> = {};
    for (const secret of options.customSecrets) {
      const lookupSecret: LookupSecret = {
        kind: "LookupSecret",
        url: `/api/settings/secrets/${encodeURIComponent(secret.name)}`,
        description: secret.description,
      };

      if (Object.keys(headers).length > 0) {
        lookupSecret.headers = headers;
      }

      secrets[secret.name] = lookupSecret;
    }

    payload.secrets = secrets;
  }

  return payload;
}

/**
 * Build a start conversation request using encrypted settings from the server.
 * This is the recommended way to start conversations from the frontend,
 * as it ensures secrets are never exposed in plaintext to the browser.
 *
 * Also fetches custom secrets from the settings store and adds them as
 * LookupSecret entries so they're available to the conversation at runtime.
 */
export async function buildStartConversationRequestWithEncryptedSettings(options: {
  settings: Settings;
  query?: string;
  conversationInstructions?: string;
  plugins?: PluginSpec[];
  conversationId?: string;
  workingDir?: string;
}): Promise<Record<string, unknown>> {
  // Import SecretsService dynamically to avoid circular dependencies
  const { SecretsService } = await import("./secrets-service");

  // Fetch settings with encrypted secrets and custom secrets list in parallel
  const [settingsResult, customSecrets] = await Promise.all([
    SettingsService.getSettingsForConversation(),
    SecretsService.getSecrets(),
  ]);

  const { agentSettings, conversationSettings, secretsEncrypted } =
    settingsResult;

  return buildStartConversationRequest({
    ...options,
    encryptedAgentSettings: agentSettings,
    encryptedConversationSettings: conversationSettings,
    secretsEncrypted,
    customSecrets,
  });
}

export async function loadSkillsForConversation(
  conversation: AppConversation | null | undefined,
): Promise<GetSkillsResponse> {
  const projectDir =
    conversation?.workspace?.working_dir ?? getAgentServerWorkingDir();

  const response = await new SkillsClient(
    getAgentServerClientOptions(),
  ).getSkills({
    load_public: shouldLoadPublicSkills(),
    load_user: true,
    load_project: true,
    load_org: false,
    project_dir: projectDir,
  });

  return { skills: response.skills ?? [] };
}
