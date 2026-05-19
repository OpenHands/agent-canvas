export const ProviderOptions = {
  github: "github",
  gitlab: "gitlab",
  bitbucket: "bitbucket",
  bitbucket_data_center: "bitbucket_data_center",
  azure_devops: "azure_devops",
  forgejo: "forgejo",
} as const;

export type Provider = keyof typeof ProviderOptions;

export type ProviderToken = {
  token: string;
  host: string | null;
};

export type MCPSSEServer = {
  url: string;
  api_key?: string;
};

export type MCPStdioServer = {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
};

export type MCPSHTTPServer = {
  url: string;
  api_key?: string;
  timeout?: number;
};

export type MCPConfig = {
  sse_servers: (string | MCPSSEServer)[];
  stdio_servers: MCPStdioServer[];
  shttp_servers: (string | MCPSHTTPServer)[];
};

export type SettingsChoiceValue = boolean | number | string;

export type SettingsChoice = {
  label: string;
  value: SettingsChoiceValue;
};

export type SettingsValue =
  | boolean
  | number
  | string
  | null
  | SettingsValue[]
  | { [key: string]: SettingsValue };

export type SettingsValueType =
  | "string"
  | "integer"
  | "number"
  | "boolean"
  | "array"
  | "object";

export type SettingProminence = "critical" | "major" | "minor";

export type SettingsFieldSchema = {
  key: string;
  label: string;
  description?: string | null;
  section: string;
  section_label: string;
  value_type: SettingsValueType;
  default?: SettingsValue;
  choices: SettingsChoice[];
  depends_on: string[];
  prominence: SettingProminence;
  secret: boolean;
  required: boolean;
};

export type SettingsSectionSchema = {
  key: string;
  label: string;
  fields: SettingsFieldSchema[];
};

export type SettingsSchema = {
  model_name: string;
  sections: SettingsSectionSchema[];
};

export type SkillType = "repo" | "knowledge" | "agentskills";

export type SkillInfo = {
  name: string;
  type: SkillType;
  source: string | null;
  description?: string | null;
  triggers?: string[];
  version?: string;
  license?: string | null;
  compatibility?: string | null;
  metadata?: Record<string, string> | null;
  allowed_tools?: string[] | null;
  is_agentskills_format?: boolean;
  disable_model_invocation?: boolean;
  content?: string;
};

export type SettingsScope = "personal";

/**
 * Agent kind stored on ``Settings.agent_settings.agent_kind``.
 *
 * - ``"openhands"`` (default): the conversation runs through OpenHands' built-in
 *   LLM-driven Agent. The other agent_settings fields (``llm``, ``condenser``,
 *   ``mcp_config``, ``tools``) apply.
 * - ``"acp"``: the conversation is driven by an external ACP subprocess
 *   (Claude Code / Codex / Gemini CLI / Custom). The LLM / condenser / MCP
 *   settings are inert; ``acp_command`` / ``acp_args`` / ``acp_model`` /
 *   ``acp_env`` / ``acp_server`` apply instead.
 */
export type AgentKind = "openhands" | "acp";

export type Settings = {
  llm_model: string;
  llm_base_url: string;
  agent: string;
  language: string;
  llm_api_key: string | null;
  llm_api_key_set: boolean;
  search_api_key_set: boolean;
  confirmation_mode: boolean;
  security_analyzer: string | null;
  max_iterations: number | null;
  remote_runtime_resource_factor: number | null;
  provider_tokens_set: Partial<Record<Provider, string | null>>;
  enable_default_condenser: boolean;
  condenser_max_size: number | null;
  enable_sound_notifications: boolean;
  enable_proactive_conversation_starters: boolean;
  enable_solvability_analysis: boolean;
  user_consents_to_analytics: boolean | null;
  search_api_key?: string;
  is_new_user?: boolean;
  mcp_config?: MCPConfig;
  disabled_skills?: string[];
  max_budget_per_task: number | null;
  email?: string;
  email_verified?: boolean;
  git_user_name?: string;
  git_user_email?: string;
  agent_settings_schema?: SettingsSchema | null;
  agent_settings?: Record<string, SettingsValue> | null;
  conversation_settings_schema?: SettingsSchema | null;
  conversation_settings?: Record<string, SettingsValue> | null;
};
