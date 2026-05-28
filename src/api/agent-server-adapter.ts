import { DEFAULT_SETTINGS } from "#/services/settings";
import { ExecutionStatus } from "#/types/agent-server/core";
import { Settings, SettingsValue } from "#/types/settings";
import {
  ACP_PROVIDERS,
  resolveEffectiveAcpModel,
} from "#/constants/acp-providers";
import { getAgentServerClientOptions } from "./agent-server-client-options";
import { isAgentServerToolAvailable } from "./agent-server-compatibility";
import {
  getAgentServerWorkingDir,
  shouldLoadPublicSkills,
} from "./agent-server-config";
import { getEffectiveLocalBackend } from "./backend-registry/active-store";
import { buildAuthHeaders } from "./backend-registry/auth";
import {
  GetHooksResponse,
  PluginSpec,
  AppConversation,
  AppConversationPage,
  SandboxStatus,
} from "./conversation-service/agent-server-conversation-service.types";
import SettingsService from "./settings-service/settings-service.api";
import { getStoredConversationMetadata } from "./conversation-metadata-store";

export interface DirectConversationInfo {
  id: string;
  title?: string | null;
  created_at: string;
  updated_at: string;
  execution_status?: string | null;
  /** Cloud-only sandbox lifecycle state. Omitted / null for local agent-server conversations. */
  sandbox_status?: string | null;
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
    /**
     * Pydantic discriminator from the SDK union: ``"ACPAgent"`` for ACP CLI
     * subprocesses (model lives on the subprocess via ``acp_model``),
     * ``"Agent"`` for direct litellm. Read by {@link toAppConversation}.
     */
    kind?: string | null;
    acp_model?: string | null;
    llm?: {
      model?: string | null;
    } | null;
  } | null;
  current_model_id?: string | null;
  current_model_name?: string | null;
  workspace?: {
    working_dir?: string | null;
  } | null;
  /**
   * Arbitrary string-keyed conversation tags surfaced by the agent-server
   * (see ``ConversationInfo.tags``). Canvas only consumes one key today —
   * ``ACP_SERVER_TAG_KEY`` ("acpserver") — but the field is typed as a
   * generic record so future readers don't need another wire-shape change.
   * Keys are constrained to ``^[a-z0-9]+$`` by the agent-server validator;
   * values are opaque strings.
   */
  tags?: Record<string, string> | null;
}

// Module qualname for the Canvas-UI tool. The agent-server imports this via
// tool_module_qualnames; the host directory is exposed via OH_EXTRA_PYTHON_PATH
// (see scripts/dev-safe.mjs).
const CANVAS_UI_TOOL_NAME = "canvas_ui";
const CANVAS_UI_TOOL_MODULE = "canvas_ui_tool";

const DEFAULT_TOOL_NAMES = [
  "terminal",
  "file_editor",
  "task_tracker",
  CANVAS_UI_TOOL_NAME,
];
const BROWSER_TOOL_SET_NAME = "browser_tool_set";
const TASK_TOOL_SET_NAME = "task_tool_set";

function browserToolsEnabled() {
  return import.meta.env.VITE_ENABLE_BROWSER_TOOLS !== "false";
}

/**
 * Shape of `VITE_RUNTIME_SERVICES_INFO` (set by the dev launchers in
 * scripts/dev-*.mjs). All URLs are written from the agent's point of view,
 * not the browser's. The block is rendered into the agent's system prompt
 * via `AgentContext.system_message_suffix` so the agent knows what's
 * reachable from inside its sandbox without having to probe.
 */
interface RuntimeServicesInfo {
  mode?: string;
  agent_host_alias?: string;
  services?: {
    agent_server?: { description?: string; url_from_agent?: string };
    ingress?: { description?: string; url_from_agent?: string };
    frontend?: {
      kind?: "vite" | "static";
      description?: string;
      url_from_agent?: string;
    };
    // `vite` is the legacy key name for the frontend entry, accepted for
    // one release while older dev-stack launchers may still emit it.
    vite?: { description?: string; url_from_agent?: string };
    automation?: {
      description?: string;
      url_from_agent?: string;
      api_prefix?: string;
      docs_url?: string;
      openapi_url?: string;
      auth_env_var?: string;
    };
  };
}

function parseRuntimeServicesInfo(): RuntimeServicesInfo | null {
  const raw = import.meta.env.VITE_RUNTIME_SERVICES_INFO?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as RuntimeServicesInfo;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    // Malformed JSON: ignore and fall back to no runtime info, rather than
    // tearing down conversation creation over a misconfigured dev env var.
    return null;
  }
}

/**
 * Render the runtime services info into a markdown block suitable for
 * appending to the system prompt via `AgentContext.system_message_suffix`.
 *
 * Returns `undefined` when no runtime info is configured, so callers can
 * safely omit the field on production builds (where the launcher doesn't
 * set `VITE_RUNTIME_SERVICES_INFO`).
 */
export function buildRuntimeServicesSystemSuffix(): string | undefined {
  const info = parseRuntimeServicesInfo();
  if (!info?.services) return undefined;

  const lines: string[] = [];
  lines.push("<RUNTIME_SERVICES>");
  if (info.mode) {
    lines.push(
      `You are running inside an agent-canvas dev stack started in '${info.mode}' mode.`,
    );
  } else {
    lines.push("You are running inside an agent-canvas dev stack.");
  }
  lines.push(
    "The following services are reachable from your sandbox. URLs are written",
    "from your point of view (i.e., as you should curl/fetch them).",
    "",
  );

  const { agent_server, ingress, automation } = info.services;
  // Accept `frontend` (current key) or `vite` (legacy key) for the
  // frontend service entry. The legacy fallback can be removed once all
  // launchers in this repo emit `frontend`.
  const frontend = info.services.frontend ?? info.services.vite;

  if (agent_server?.url_from_agent) {
    lines.push(
      `* Agent Server (you): ${agent_server.url_from_agent}`,
      `    ${agent_server.description ?? "The agent-server hosting your tool calls."}`,
    );
  }
  if (ingress?.url_from_agent) {
    lines.push(
      `* Ingress: ${ingress.url_from_agent}`,
      `    ${ingress.description ?? "Unified entry point for browser-facing traffic."}`,
    );
  }
  if (frontend?.url_from_agent) {
    lines.push(
      `* Frontend: ${frontend.url_from_agent}`,
      `    ${frontend.description ?? "Frontend dev server."}`,
    );
  }
  if (automation?.url_from_agent) {
    lines.push(
      `* Automation backend: ${automation.url_from_agent}`,
      `    ${automation.description ?? "OpenHands Automations service."}`,
    );
    if (automation.docs_url) {
      lines.push(`    Docs:    ${automation.docs_url}`);
    }
    if (automation.openapi_url) {
      lines.push(`    OpenAPI: ${automation.openapi_url}`);
    }
    if (automation.auth_env_var) {
      lines.push(
        `    Auth:    header 'X-API-Key: $${automation.auth_env_var}'`,
      );
    }
  } else {
    lines.push(
      "* Automation backend: not running in this dev mode (skip /api/automation calls).",
    );
  }

  // Anchor the "don't guess" warning to the actual agent-server URL for
  // this stack instead of a hardcoded port. The agent-server listens on
  // different ports across dev modes, and baking the wrong port into the
  // system prompt is exactly the kind of confusion this block is meant to
  // prevent.
  const agentServerUrl = agent_server?.url_from_agent;
  lines.push(
    "",
    "Trust this block over guessing: do not assume any other URLs are running.",
  );
  if (agentServerUrl) {
    lines.push(
      `In particular, ${agentServerUrl} inside your sandbox is the Agent Server`,
      "you are running inside of — NOT the automation backend.",
    );
  }
  lines.push("</RUNTIME_SERVICES>");

  return lines.join("\n");
}

export function toConversationUrl(conversationId: string): string {
  // Local-format conversation URL — points at whichever local agent-server
  // is actually serving the conversation (the bundled one when the active
  // selection is cloud).
  const { host } = getAgentServerClientOptions();
  return `${host}/api/conversations/${conversationId}`;
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
  // ACPAgent conversations carry a sentinel ``llm`` on older SDKs. Prefer the
  // runtime model fields when available, then the configured ``acp_model`` that
  // Canvas saves for built-in providers. ``agent_kind`` still gates model
  // switching, so surfacing this string is display-only.
  const isAcp = info.agent?.kind === "ACPAgent";
  // Only surface ``acp_server`` for ACP conversations even if the wire
  // payload accidentally carries an ``acpserver`` tag on an OpenHands
  // conversation — the chip is identity info for the ACP CLI subprocess,
  // and showing it on a non-ACP conversation would be a lie.
  const acpServer = isAcp ? (info.tags?.[ACP_SERVER_TAG_KEY] ?? null) : null;
  return {
    id: info.id,
    created_by_user_id: null,
    selected_repository: metadata?.selected_repository ?? null,
    selected_branch: metadata?.selected_branch ?? null,
    git_provider: metadata?.git_provider ?? null,
    selected_workspace: metadata?.selected_workspace ?? null,
    title: info.title?.trim()
      ? info.title
      : getDefaultConversationTitle(info.id),
    trigger: null,
    pr_number: [],
    agent_kind: isAcp ? "acp" : "openhands",
    acp_server: acpServer,
    // Chip path: no ``providerDefault`` — the chip must distinguish
    // "no concrete model" (fall back to the provider display name in
    // ConversationCardFooter) from "default" (would lie about what's
    // running on the subprocess).
    llm_model: isAcp
      ? resolveEffectiveAcpModel({
          runtimeName: info.current_model_name,
          runtimeId: info.current_model_id,
          configured: info.agent?.acp_model,
          sdkLlm: info.agent?.llm?.model,
        })
      : (info.agent?.llm?.model ?? DEFAULT_SETTINGS.llm_model),
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
    sandbox_status: (info.sandbox_status as SandboxStatus | null) ?? null,
    conversation_url: toConversationUrl(info.id),
    session_api_key: getAgentServerClientOptions().apiKey ?? null,
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

interface AgentToolSpec {
  name: string;
  params: SettingsRecord;
}

type AgentSettingsPayload = SettingsRecord & {
  llm?: SettingsRecord;
  agent_context: SettingsRecord;
  tools?: AgentToolSpec[];
};

interface LocalWorkspacePayload {
  kind: "LocalWorkspace";
  working_dir: string;
}

interface InitialMessagePayload {
  role: "user";
  content: Array<{ type: "text"; text: string }>;
  run: true;
}

type ConversationSettingsPayload = SettingsRecord & {
  workspace: LocalWorkspacePayload;
  initial_message?: InitialMessagePayload;
};

const ACP_SETTINGS_KEYS = [
  "acp_command",
  "acp_args",
  "acp_env",
  "acp_model",
  "acp_session_mode",
  "acp_prompt_timeout",
] as const;

export const ACP_SERVER_TAG_KEY = "acpserver";

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

function isToolRecord(
  value: unknown,
): value is { name: string; params?: unknown } {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as { name?: unknown }).name === "string"
  );
}

function shouldIncludeTool(name: string, agentSettings: SettingsRecord) {
  if (name === BROWSER_TOOL_SET_NAME) {
    return browserToolsEnabled() && isAgentServerToolAvailable(name);
  }

  if (name === TASK_TOOL_SET_NAME) {
    return (
      agentSettings.enable_sub_agents === true &&
      isAgentServerToolAvailable(name)
    );
  }

  return true;
}

function getAgentTools(agentSettings: SettingsRecord): AgentToolSpec[] {
  const tools = new Map<string, AgentToolSpec>();

  for (const name of DEFAULT_TOOL_NAMES) {
    tools.set(name, { name, params: {} });
  }

  for (const name of [BROWSER_TOOL_SET_NAME, TASK_TOOL_SET_NAME]) {
    if (shouldIncludeTool(name, agentSettings)) {
      tools.set(name, { name, params: {} });
    }
  }

  const configuredTools = agentSettings.tools;
  if (
    Array.isArray(configuredTools) &&
    configuredTools.every((tool) => isToolRecord(tool))
  ) {
    for (const tool of configuredTools) {
      if (shouldIncludeTool(tool.name, agentSettings)) {
        tools.set(tool.name, {
          name: tool.name,
          params: toRecord(tool.params),
        });
      }
    }
  }

  return Array.from(tools.values());
}

function buildInitialMessage(
  query?: string,
  conversationInstructions?: string,
): InitialMessagePayload | null {
  const parts = [query?.trim(), conversationInstructions?.trim()].filter(
    Boolean,
  );
  if (parts.length === 0) {
    return null;
  }

  return {
    role: "user",
    content: [{ type: "text", text: parts.join("\n\n") }],
    run: true,
  };
}

function buildAgentContext(agentSettings: SettingsRecord): SettingsRecord {
  const runtimeServicesSuffix = buildRuntimeServicesSystemSuffix();
  return {
    ...toRecord(agentSettings.agent_context),
    load_public_skills: shouldLoadPublicSkills(),
    load_user_skills: true,
    ...(runtimeServicesSuffix
      ? { system_message_suffix: runtimeServicesSuffix }
      : {}),
  };
}

function buildConfiguredOpenHandsAgentSettings(
  settings: Settings,
): Record<string, unknown> {
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

  const mcpConfig = toRecord(agentSettings.mcp_config);
  if (Object.keys(mcpConfig).length === 0 || !("mcpServers" in mcpConfig)) {
    delete agentSettings.mcp_config;
  }

  delete agentSettings.acp_server;
  for (const key of ACP_SETTINGS_KEYS) {
    delete agentSettings[key];
  }

  return {
    ...agentSettings,
    llm,
    agent_context: buildAgentContext(agentSettings),
    tools: getAgentTools(agentSettings),
  };
}

function buildConfiguredAgentSettings(
  settings: Settings,
): Record<string, unknown> {
  return isAcpAgent(settings)
    ? buildConfiguredAcpAgentSettings(settings)
    : buildConfiguredOpenHandsAgentSettings(settings);
}

function buildConfiguredAcpAgentSettings(settings: Settings): SettingsRecord {
  const agentSettings = toRecord(settings.agent_settings);

  // Only forward fields the ACPAgent model knows about. Everything else
  // (``llm``, ``condenser``, ``mcp_config``, ``agent``, ``schema_version``,
  // ``tools``, ``agent_kind``) is irrelevant on this path; the agent-server
  // would either ignore it or reject it as a pydantic extra. ``acp_server``
  // is a UI bookkeeping field — it does not belong in the agent payload
  // either, but we surface it on the conversation tags instead (see
  // ``buildStartConversationRequest``).
  const payload: SettingsRecord = {};
  for (const key of ACP_SETTINGS_KEYS) {
    if (agentSettings[key] !== undefined && agentSettings[key] !== null) {
      payload[key] = agentSettings[key];
    }
  }

  // The Settings → Agent page (and onboarding) stores ``acp_command: []``
  // for the "default preset" path, expecting the registry to resolve it.
  // The agent-server's ACPAgent model takes only an explicit ``acp_command``
  // though — empty list means ``subprocess(command[0], ...)`` raises
  // ``IndexError: list index out of range`` at spawn time, the agent loop
  // dies silently, and the conversation hangs in ``idle``. Resolve the
  // command from ``ACP_PROVIDERS`` here so the agent-server sees a real
  // command for every built-in preset, while leaving ``acp_server: custom``
  // (and any unknown key) untouched — those genuinely require the user's
  // ``acp_command`` entry.
  const cmd = payload.acp_command;
  const isEmpty = Array.isArray(cmd) && cmd.length === 0;
  const noCommand = cmd === undefined;
  if (isEmpty || noCommand) {
    const serverKey =
      typeof agentSettings.acp_server === "string"
        ? agentSettings.acp_server
        : undefined;
    const provider = ACP_PROVIDERS.find(({ key }) => key === serverKey);
    if (provider) {
      payload.acp_command = [...provider.default_command];
    }
  }

  return payload;
}

function createAgentFromSettings(
  agentSettings: SettingsRecord,
  options: { acp?: boolean; projectSkills?: Record<string, unknown>[] } = {},
) {
  const runtimeServicesSuffix = buildRuntimeServicesSystemSuffix();
  // ``load_public_skills``, ``load_user_skills``, and
  // ``system_message_suffix`` are all marked ``acp_compatible: true`` in
  // the SDK's AgentContext model — they're rendered into the system
  // prompt the ACP CLI receives via ``ACPAgent._render_suffix``, so
  // building the same agent_context here means a Claude-Code / Codex
  // user gets the same skill catalog and runtime-services awareness an
  // OpenHands-driven conversation does. Leaving it off (the previous
  // ACP branch returned ``{kind:"ACPAgent",...agentSettings}`` with no
  // ``agent_context``) silently dropped both, matching neither the
  // SDK contract nor OpenHands' own behaviour.
  //
  // The ``acp_compatible`` markers live on the SDK fields themselves
  // in ``openhands-sdk/openhands/sdk/context/agent_context.py``:
  //   - ``system_message_suffix``  (Field, json_schema_extra at L66)
  //   - ``load_user_skills``       (Field, json_schema_extra at L80)
  //   - ``load_public_skills``     (Field, json_schema_extra at L89)
  // ``AgentContext.validate_acp_compatibility`` rejects any field not
  // tagged that way at ``ACPAgent`` init time. If a future SDK bump
  // demotes one of these (drops the marker), the ACP conversation start
  // will 422 here — at which point the right move is to drop the
  // demoted field from this dict, not to wrap a workaround.
  //
  // ``secrets`` is filled in later by the secret bridge in
  // ``buildStartConversationRequest`` (when ``customSecrets`` is set);
  // we don't seed it here so non-secret start paths don't end up with
  // an empty ``secrets: {}`` map.
  const agentContext: Record<string, unknown> = {
    load_public_skills: true,
    load_user_skills: true,
    // Project skills (``.agents/skills/`` in the workspace) are not
    // auto-loaded by the AgentContext (it only auto-loads user/public
    // skills, and agent-server 1.23.0 has no wire field to request project
    // skills for a conversation). They are pre-loaded by the caller and
    // injected here as explicit ``skills`` so repo skills reach the agent.
    // ``skills`` is marked ``acp_compatible: true`` in the SDK, so this is
    // valid on both the Agent and ACPAgent paths. ``_load_auto_skills``
    // dedupes auto-loaded user/public skills against these by name.
    ...(options.projectSkills?.length ? { skills: options.projectSkills } : {}),
    // When the dev launcher provided ``VITE_RUNTIME_SERVICES_INFO``,
    // append a <RUNTIME_SERVICES> block to the system prompt so the
    // agent knows which services exist in this dev stack (e.g.
    // automation backend URL, ingress URL) instead of having to probe.
    ...(runtimeServicesSuffix
      ? { system_message_suffix: runtimeServicesSuffix }
      : {}),
  };
  if (options.acp) {
    return {
      kind: "ACPAgent",
      ...agentSettings,
      agent_context: agentContext,
    };
  }
  return {
    kind: "Agent",
    ...agentSettings,
    agent_context: agentContext,
  };
}

function isAcpAgent(settings: Settings): boolean {
  const agentSettings = toRecord(settings.agent_settings);
  return agentSettings.agent_kind === "acp";
}

function getAcpServerTag(settings: Settings): string | undefined {
  const agentSettings = toRecord(settings.agent_settings);
  const value = agentSettings.acp_server;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function buildConfiguredConversationSettings(options: {
  settings: Settings;
  query?: string;
  conversationInstructions?: string;
  plugins?: PluginSpec[];
  workingDir?: string;
}): ConversationSettingsPayload {
  const { settings, query, conversationInstructions, plugins, workingDir } =
    options;
  const conversationSettings = toRecord(settings.conversation_settings);
  const initialMessage = buildInitialMessage(query, conversationInstructions);

  CONVERSATION_SETTINGS_METADATA_KEYS.forEach(
    (key) => delete conversationSettings[key],
  );

  const payload: ConversationSettingsPayload = {
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

  return payload;
}

interface LookupSecret {
  kind: "LookupSecret";
  url: string;
  headers?: Record<string, string>;
  description?: string;
}

type StartConversationPayload = Record<string, unknown> & {
  agent: Record<string, unknown>;
  agent_settings?: AgentSettingsPayload;
  workspace: LocalWorkspacePayload;
  confirmation_policy: SettingsRecord;
  security_analyzer?: SettingsRecord;
  initial_message?: InitialMessagePayload;
  max_iterations: number;
  stuck_detection: true;
  autotitle: true;
  worktree: true;
  secrets_encrypted?: true;
  conversation_id?: string;
  secrets?: Record<string, LookupSecret>;
  tags?: Record<string, string>;
  tool_module_qualnames?: Record<string, string>;
};

export interface StartConversationOptions {
  settings: Settings;
  query?: string;
  conversationInstructions?: string;
  plugins?: PluginSpec[];
  conversationId?: string;
  workingDir?: string;
  encryptedAgentSettings?: Record<string, SettingsValue>;
  encryptedConversationSettings?: Record<string, SettingsValue>;
  secretsEncrypted?: boolean;
  customSecrets?: Array<{ name: string; description?: string }>;
  /**
   * Project skills (from ``.agents/skills/`` in the workspace) to seed the
   * agent context with, as SDK ``Skill`` wire objects. Pre-loaded by the
   * caller because the fetch is async and this builder is synchronous; see
   * ``buildStartConversationRequestWithEncryptedSettings``.
   */
  projectSkills?: Record<string, unknown>[];
}

export function buildStartConversationRequest(
  options: StartConversationOptions,
): Record<string, unknown> {
  const sourceAgentSettings = options.encryptedAgentSettings
    ? { ...options.settings, agent_settings: options.encryptedAgentSettings }
    : options.settings;

  const acpMode = isAcpAgent(sourceAgentSettings);
  const agentSettings = buildConfiguredAgentSettings(sourceAgentSettings);
  const agent = createAgentFromSettings(agentSettings, {
    acp: acpMode,
    projectSkills: options.projectSkills,
  });
  const acpServerTag = acpMode
    ? getAcpServerTag(sourceAgentSettings)
    : undefined;

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

  const payload: StartConversationPayload = {
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

  if (acpServerTag) {
    payload.tags = { [ACP_SERVER_TAG_KEY]: acpServerTag };
  }

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

  payload.tool_module_qualnames = {
    [CANVAS_UI_TOOL_NAME]: CANVAS_UI_TOOL_MODULE,
    ...((conversationSettings.tool_module_qualnames as
      | Record<string, string>
      | undefined) ?? {}),
  };

  if (conversationSettings.agent_definitions) {
    payload.agent_definitions = conversationSettings.agent_definitions;
  }

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

    if (acpMode) {
      payload.agent.agent_context = {
        ...((payload.agent.agent_context as Record<string, unknown>) ?? {}),
        secrets,
      };
    }
  }

  return payload;
}

export async function buildStartConversationRequestWithEncryptedSettings(options: {
  settings: Settings;
  query?: string;
  conversationInstructions?: string;
  plugins?: PluginSpec[];
  conversationId?: string;
  workingDir?: string;
  /**
   * Workspace root to load project skills (`.agents/skills/`) from. This is
   * the workspace root, NOT `workingDir` — the latter is the per-conversation
   * worktree subdir (`<workspace>/<conversationId>`), which has no
   * `.agents/skills/` and may not exist yet at request-build time. Defaults to
   * the configured workspace dir inside `getProjectSkills`.
   */
  skillsProjectDir?: string;
}): Promise<Record<string, unknown>> {
  const { SecretsService } = await import("./secrets-service");
  const { default: SkillsService } = await import("./skills-service");

  // Fetch settings, custom secrets, and project skills in parallel.
  // Project skills are loaded here (an async call) so the synchronous
  // buildStartConversationRequest can inject them into the agent context.
  const [settingsResult, customSecrets, projectSkills] = await Promise.all([
    SettingsService.getSettingsForConversation(),
    SecretsService.getSecrets(),
    SkillsService.getProjectSkills(options.skillsProjectDir),
  ]);

  const { agentSettings, conversationSettings, secretsEncrypted } =
    settingsResult;

  return buildStartConversationRequest({
    ...options,
    encryptedAgentSettings: agentSettings,
    encryptedConversationSettings: conversationSettings,
    secretsEncrypted,
    customSecrets,
    projectSkills,
  });
}

export function emptyHooksResponse(): GetHooksResponse {
  return { hooks: [] };
}
