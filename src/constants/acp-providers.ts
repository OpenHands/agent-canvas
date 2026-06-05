import { getAcpProvider as getClientAcpProvider } from "@openhands/typescript-client";
import { I18nKey } from "#/i18n/declaration";

/** Upstream registry fields not yet on the pinned client's exported type. */
type ClientAcpProviderRegistry = NonNullable<
  ReturnType<typeof getClientAcpProvider>
> & {
  available_models?: Array<{ id: string; label: string }>;
  default_model?: string;
};

export type ACPProviderIcon =
  | "claude-code"
  | "codex"
  | "gemini"
  | "cli-generic";

export const ACP_PROVIDER_FALLBACK_ICON: ACPProviderIcon = "cli-generic";

// SDK placeholder strings the ACP wrapper returns before the user has
// chosen a real model — surfacing either would lie about what's running.
export const ACP_DEFAULT_PLACEHOLDERS = new Set([
  "default",
  "default (recommended)",
]);

// Sentinel ``agent.llm.model`` returned by older SDKs for ACP conversations
// in lieu of a real model. Suppressed at every consumer that resolves a
// display string.
export const ACP_MANAGED_SENTINEL = "acp-managed";

/**
 * Filter for "real" ACP model strings — non-empty, not the SDK's "default"
 * placeholder, not the legacy ``acp-managed`` sentinel. Returns the trimmed
 * value on success, ``null`` otherwise.
 */
function realAcpModel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (ACP_DEFAULT_PLACEHOLDERS.has(trimmed.toLowerCase())) return null;
  if (trimmed === ACP_MANAGED_SENTINEL) return null;
  return trimmed;
}

/**
 * Single source of truth for resolving the model string to surface for an
 * ACP conversation/settings context. Consumed by the conversation adapter
 * (chip text), the conversation-creation path (concrete ``acp_model``
 * payload), the Settings → Agent form (initial value), and the chat-input
 * model label.
 *
 * Precedence: SDK runtime fields → user-configured ``acp_model`` →
 * legacy ``agent.llm.model`` → provider default (when ``providerDefault``
 * is passed). Pass ``providerDefault`` only on surfaces that should
 * silently substitute the registry default; omit it for the conversation
 * chip, which must distinguish "no concrete model" from "default".
 */
export function resolveEffectiveAcpModel(inputs: {
  runtimeName?: string | null;
  runtimeId?: string | null;
  configured?: string | null;
  sdkLlm?: string | null;
  providerDefault?: string | null;
}): string | null {
  for (const candidate of [
    inputs.runtimeName,
    inputs.runtimeId,
    inputs.configured,
    inputs.sdkLlm,
  ]) {
    const value = realAcpModel(candidate);
    if (value) return value;
  }
  return inputs.providerDefault ?? null;
}

/**
 * Shape of a built-in ACP (Agent Client Protocol) provider as Canvas consumes
 * it. The data fields (display name, launch command, model picker + default)
 * are sourced at module load from ``@openhands/typescript-client``'s ACP
 * registry — the generated mirror of the Python source of truth
 * ``openhands.sdk.settings.acp_providers``. This config only adds the
 * Canvas-specific UI fields ({@link ACPProviderConfig.icon} +
 * {@link ACPProviderConfig.description_key}); see {@link ACP_PROVIDER_UI}.
 */
export interface ACPProviderConfig {
  /** Stable registry key, also stored on conversations as ``tags.acpserver``. */
  key: string;
  /** Human-readable name shown in dropdowns and conversation chips. */
  display_name: string;
  /**
   * Tokens passed to the agent-server as ``acp_command`` when this preset
   * is picked. Each entry must be a real ACP-protocol stdio server — the
   * SDK validates this against the {@link ACPProviderConfig.key}.
   *
   * NB: ``npx -y @openai/codex acp`` looks plausible but is **not** an
   * ACP server — the codex CLI has no ``acp`` subcommand and exits with
   * ``Error: stdin is not a terminal`` when spawned without a TTY, which
   * silently deadlocks the agent-server's ACP handshake. Use
   * ``@zed-industries/codex-acp`` (the Zed-shipped wrapper) instead.
   */
  default_command: string[];
  /**
   * Suggested ACP model IDs for the provider's picker, sourced from the
   * typescript-client registry. Not authoritative access checks; users can
   * still enter a custom override in Settings -> Agent.
   */
  available_models?: ACPModelOption[];
  /** Model ID preselected for built-in providers so Canvas never saves blank. */
  default_model?: string;
  /**
   * i18n key for the one-line provider description rendered under the
   * onboarding tile. Stored on the registry so adding a new ACP
   * provider only requires editing this file (not the onboarding tile
   * list separately).
   */
  description_key: I18nKey;
  /**
   * Serializable icon key used by UI surfaces that render provider
   * choices. Kept as a string so the SDK mirror check can continue to
   * parse this registry without importing React components.
   */
  icon?: ACPProviderIcon;
}

export interface ACPModelOption {
  /** Exact model ID sent as ``acp_model``. */
  id: string;
  /** Human-readable label shown in Settings -> Agent. */
  label: string;
}

// Canvas-only UI metadata per built-in provider, keyed by the ACP registry
// key. Everything else — display name, launch command, model picker list and
// default — comes from the typescript-client registry below. Adding a model
// or a provider happens upstream in the SDK; Canvas only owns the brand icon
// and the onboarding-tile description here. A provider with no entry here is
// intentionally not surfaced in the UI.
const ACP_PROVIDER_UI: Record<
  string,
  { icon: ACPProviderIcon; description_key: I18nKey }
> = {
  "claude-code": {
    icon: "claude-code",
    description_key: I18nKey.ONBOARDING$AGENT_CLAUDE_CODE_DESCRIPTION,
  },
  codex: {
    icon: "codex",
    description_key: I18nKey.ONBOARDING$AGENT_CODEX_DESCRIPTION,
  },
  "gemini-cli": {
    icon: "gemini",
    description_key: I18nKey.ONBOARDING$AGENT_GEMINI_CLI_DESCRIPTION,
  },
};

// Built-in ACP providers Canvas surfaces, built by enriching each upstream
// registry record (``@openhands/typescript-client`` → Python SDK) with the
// Canvas UI metadata above. Model lists + defaults are no longer hand-kept
// here (closes agent-canvas#740) — they track the SDK via the pinned client.
export const ACP_PROVIDERS: ACPProviderConfig[] = Object.entries(
  ACP_PROVIDER_UI,
).map(([key, ui]) => {
  const info = getClientAcpProvider(key) as ClientAcpProviderRegistry | null;
  return {
    key,
    display_name: info?.display_name ?? key,
    default_command: info ? [...info.default_command] : [],
    available_models: info?.available_models?.map((model) => ({
      id: model.id,
      label: model.label,
    })),
    default_model: info?.default_model ?? undefined,
    description_key: ui.description_key,
    icon: ui.icon,
  };
});

export const ACP_CUSTOM_PRESET_KEY = "custom";

/**
 * A credential an ACP provider authenticates with, surfaced during onboarding
 * so the user can populate it without leaving the flow. The {@link name} is
 * both the global-secret name and the environment variable the agent-server
 * exports into the ACP subprocess — keeping them identical is what makes a
 * saved secret actually reach the provider CLI.
 */
export interface ACPProviderSecretField {
  /** Secret name and env var (e.g. ``"ANTHROPIC_API_KEY"``). Must satisfy the
   * secret-name pattern ``^[a-zA-Z][a-zA-Z0-9_]{0,63}$``. */
  name: string;
  /** Render as a masked password input (API keys, OAuth tokens, credential
   * blobs) rather than a plain-text input (base URLs, project IDs). Every field
   * is optional regardless — the whole step is skippable — so this only
   * controls masking, not whether the field gates. */
  secret?: boolean;
  /** Render as a multi-line textarea rather than a single-line input. Set for
   * file-content credentials the user pastes verbatim (Codex ``auth.json``,
   * Gemini Vertex service-account / ADC JSON). */
  multiline?: boolean;
  /**
   * Marks a provider-specific credential a fresh container needs (subscription
   * token, Codex ``auth.json``, Gemini Vertex SA) — as opposed to a generic API
   * key or base URL. This is an **onboarding/validation** concept only: it
   * drives which fields the credential step prompts for and which are required
   * per backend capability (see ``backendRequiresAcpCredentials``). It does
   * **not** affect the wire — every saved credential travels uniformly as a
   * ``LookupSecret`` resolved from the agent-server's store at spawn time (off
   * the event loop, software-agent-sdk#3510). Set ``true`` for every credential
   * canvas collects here except the optional base URL (see the
   * {@link getAcpProviderSecrets} note on ``ANTHROPIC_BASE_URL``).
   */
  reserved?: boolean;
  /** i18n key for the one-line helper text under the field. */
  hint_key: I18nKey;
  /**
   * Interpolation values for {@link hint_key} (e.g. ``{ file: "~/.codex/auth.json" }``
   * for the shared "paste the file contents" hint). Omitted for hints that
   * take no parameters.
   */
  hint_values?: Record<string, string>;
}

/**
 * Reserved credentials — beyond the registry's API key / base URL — that canvas
 * collects per provider so a *containerized* agent-server (no host login state)
 * can authenticate the ACP CLI. These are the file-content blobs and Vertex
 * config the SDK's ``acp_file_secrets`` materialisation consumes; they have no
 * registry env-var entry because they're a deployment concern, not a model
 * registry field. Keyed by ACP provider registry key.
 *
 * Sourced from the validated container contract (agent-canvas#1013/#1014):
 *   - Codex subscription → ``CODEX_AUTH_JSON`` (contents of ``~/.codex/auth.json``;
 *     materialised back to ``auth.json`` under ``CODEX_HOME``).
 *   - Claude subscription → ``CLAUDE_CODE_OAUTH_TOKEN`` (Pro/Max OAuth token).
 *   - Gemini Vertex → ``GOOGLE_APPLICATION_CREDENTIALS_JSON`` (SA / ADC JSON,
 *     materialised to a file referenced by ``GOOGLE_APPLICATION_CREDENTIALS``)
 *     plus ``GOOGLE_CLOUD_PROJECT`` / ``GOOGLE_CLOUD_LOCATION`` /
 *     ``GOOGLE_GENAI_USE_VERTEXAI`` (the last three are plain config / a routing
 *     flag, not secrets; grouped here only because they travel with the SA blob).
 */
const ACP_RESERVED_CREDENTIALS: Record<string, ACPProviderSecretField[]> = {
  codex: [
    {
      name: "CODEX_AUTH_JSON",
      secret: true,
      multiline: true,
      reserved: true,
      hint_key: I18nKey.ONBOARDING$ACP_SECRET_FILE_BLOB_HINT,
      hint_values: { file: "~/.codex/auth.json" },
    },
  ],
  "claude-code": [
    {
      name: "CLAUDE_CODE_OAUTH_TOKEN",
      secret: true,
      reserved: true,
      hint_key: I18nKey.ONBOARDING$ACP_SECRET_OAUTH_TOKEN_HINT,
    },
  ],
  "gemini-cli": [
    {
      name: "GOOGLE_APPLICATION_CREDENTIALS_JSON",
      secret: true,
      multiline: true,
      reserved: true,
      hint_key: I18nKey.ONBOARDING$ACP_SECRET_FILE_BLOB_HINT,
      hint_values: {
        file: "~/.config/gcloud/application_default_credentials.json",
      },
    },
    {
      name: "GOOGLE_CLOUD_PROJECT",
      reserved: true,
      hint_key: I18nKey.ONBOARDING$ACP_SECRET_GCP_PROJECT_HINT,
    },
    {
      name: "GOOGLE_CLOUD_LOCATION",
      reserved: true,
      hint_key: I18nKey.ONBOARDING$ACP_SECRET_GCP_LOCATION_HINT,
    },
    {
      name: "GOOGLE_GENAI_USE_VERTEXAI",
      reserved: true,
      hint_key: I18nKey.ONBOARDING$ACP_SECRET_VERTEXAI_FLAG_HINT,
    },
  ],
};

/**
 * Vertex AI-safe ``acp_model`` for Gemini.
 *
 * When ``acp_model`` is left unset, gemini-cli falls back to its own internal
 * default (``gemini-3-flash-preview``), which 404s in the many Google Cloud
 * projects that don't have the preview models enabled. ``gemini-2.5-flash`` is
 * broadly available on Vertex AND on the API-key / Google-login paths, so canvas
 * preselects it as the concrete default rather than relying on gemini-cli's
 * preview pick. Users can still choose a stronger model (e.g. ``gemini-2.5-pro``)
 * from the Settings → Agent picker. Kept as a named constant so the onboarding
 * selection and any other model-default consumer agree.
 */
export const ACP_VERTEX_SAFE_MODEL = "gemini-2.5-flash";

/**
 * The ``acp_model`` canvas preselects for ``providerKey`` when the user picks it.
 * Overrides only Gemini (→ {@link ACP_VERTEX_SAFE_MODEL}, see why above); every
 * other provider keeps its registry {@link ACPProviderConfig.default_model}.
 * Returns ``null`` when there's no override and no registry default, letting the
 * ACP server pick its own.
 *
 * Distinct from {@link ACPProviderConfig.default_model} (which mirrors the SDK
 * registry verbatim, closing agent-canvas#740): this is the *preferred* default
 * to write into settings, deliberately diverging for Gemini where the registry
 * value isn't safe on every backend.
 */
export function getAcpPreferredDefaultModel(
  key: string | null | undefined,
): string | null {
  if (key === "gemini-cli") return ACP_VERTEX_SAFE_MODEL;
  return getAcpProvider(key)?.default_model ?? null;
}

/**
 * List the credentials Canvas should prompt for when onboarding the given ACP
 * provider. The API-key and base-URL field *names* track the SDK registry's
 * ``api_key_env_var`` / ``base_url_env_var`` (mirrored via
 * ``@openhands/typescript-client``) so they can't drift as providers are added
 * or renamed; the per-provider reserved credentials (subscription / Vertex
 * blobs) come from {@link ACP_RESERVED_CREDENTIALS}, since those are a
 * containerized-deployment concern with no model-registry entry. Each field
 * name equals the env var the agent-server exports into the provider subprocess
 * (which is what makes a saved secret reach the CLI).
 *
 * Field order is: reserved subscription/Vertex credentials → API key → optional
 * base URL. Everything except the base URL is {@link ACPProviderSecretField.reserved}
 * (a credential a fresh container needs; an onboarding/validation marker, not a
 * wire distinction — all of them ride as ``LookupSecret``s).
 *
 * Every field is optional at the UI level — the step is skippable, and a
 * subscription / OAuth login on the backend takes precedence over a key at
 * runtime. (Whether the *step* is required is a backend-capability decision the
 * onboarding modal makes; see ``backendRequiresAcpCredentials``.)
 *
 * NB: the base URL is deliberately **not** ``reserved``. Sending
 * ``ANTHROPIC_BASE_URL`` alongside a ``CLAUDE_CODE_OAUTH_TOKEN`` silently breaks
 * the token's bearer auth (an inherited LiteLLM base URL routes the request away
 * from Anthropic), so canvas never auto-promotes it to a request secret — it only
 * travels if the user explicitly set it as a global secret.
 *
 * Returns ``[]`` for OpenHands, the ``"custom"`` preset, any unknown key, and a
 * future OAuth-only provider whose registry entry has no ``api_key_env_var`` —
 * callers treat an empty list as "no credentials step for this provider".
 */
export function getAcpProviderSecrets(
  key: string | null | undefined,
): ACPProviderSecretField[] {
  const info = key ? getClientAcpProvider(key) : null;
  if (!info) return [];
  const fields: ACPProviderSecretField[] = [];
  // Subscription / Vertex credentials first — they're the primary auth path for
  // ACP providers (Claude Pro/Max OAuth token, Codex ChatGPT auth.json), with
  // the API key as the fallback below.
  fields.push(...(key ? (ACP_RESERVED_CREDENTIALS[key] ?? []) : []));
  if (info.api_key_env_var) {
    fields.push({
      name: info.api_key_env_var,
      secret: true,
      reserved: true,
      hint_key: I18nKey.ONBOARDING$ACP_SECRET_API_KEY_HINT,
    });
  }
  if (info.base_url_env_var) {
    fields.push({
      name: info.base_url_env_var,
      hint_key: I18nKey.ONBOARDING$ACP_SECRET_BASE_URL_HINT,
    });
  }
  return fields;
}

/**
 * Look up a built-in ACP provider config by its registry key.
 *
 * Returns ``undefined`` for an empty / null key, for the ``"custom"`` preset
 * (which has no registry entry), and for any forward-compatible key Canvas's
 * registry doesn't know about yet. Centralizes the ``ACP_PROVIDERS.find(...)``
 * lookup shared by the resolvers below and by the adapter / settings surfaces
 * so the key-comparison shape lives in one place.
 */
export function getAcpProvider(
  key: string | null | undefined,
): ACPProviderConfig | undefined {
  if (!key) return undefined;
  return ACP_PROVIDERS.find((provider) => provider.key === key);
}

/**
 * Resolve an ACP provider registry key (the value stored under
 * ``tags.acpserver`` on a conversation) to a human display name for the
 * sidebar chip.
 *
 * Returns ``null`` for an empty / null key and for keys not in
 * {@link ACP_PROVIDERS} — most notably ``"custom"`` (the user-supplied
 * command preset has no canonical brand name) and any forward-compatible
 * value Canvas's registry doesn't know about yet. Callers should fall
 * back to a generic ``"ACP"`` label in that case so the chip still
 * communicates "this is an ACP conversation".
 *
 * Kept separate from {@link buildAcpAgentSettingsDiff}'s lookup so the
 * conversation-card render path can resolve display names without
 * importing the settings-payload builder.
 */
export function getAcpProviderDisplayName(
  key: string | null | undefined,
): string | null {
  const found = getAcpProvider(key);
  return found ? found.display_name : null;
}

/**
 * Resolve an ACP provider registry key to the icon discriminator the
 * conversation chip should render alongside the model text.
 *
 * Falls back to {@link ACP_PROVIDER_FALLBACK_ICON} for ``"custom"``,
 * unknown keys, or a missing key — the chip then shows a neutral
 * terminal glyph that still communicates "this is an ACP conversation"
 * without claiming a brand identity we don't know.
 */
export function resolveAcpProviderIcon(
  key: string | null | undefined,
): ACPProviderIcon {
  return getAcpProvider(key)?.icon ?? ACP_PROVIDER_FALLBACK_ICON;
}

/**
 * Resolve a raw ``acp_model`` ID to the human-readable label the provider's
 * picker shows for it (e.g. ``"claude-opus-4-7"`` → ``"Claude Opus 4.7"``).
 *
 * Falls back to the raw ID when the provider is unknown or the ID isn't one
 * of its registered {@link ACPModelOption}s — so a user's custom override
 * still renders something meaningful rather than nothing. Returns ``null``
 * only when there is no model to show, letting the conversation chip decide
 * to display the provider name instead.
 */
export function labelForAcpModel(
  serverKey: string | null | undefined,
  modelId: string | null | undefined,
): string | null {
  if (!modelId) return null;
  const provider = getAcpProvider(serverKey);
  const match = provider?.available_models?.find((m) => m.id === modelId);
  return match?.label ?? modelId;
}

/**
 * Build the ``agent_settings_diff`` payload PATCH /api/settings expects
 * for the agent-kind/provider choice the user just made.
 *
 * Used by both the Settings → Agent page and the onboarding "choose
 * agent" step — keeping the shape in one helper means a future change
 * (e.g. always seeding ``acp_command`` from the registry instead of
 * sending ``[]``, or adding new ``acp_*`` reset fields) lands in both
 * surfaces atomically.
 *
 * Returns ``null`` for an unknown ACP provider key by default — the
 * caller can skip the save (the UI shouldn't surface unknown options,
 * but the defensive path keeps a buggy preset list from corrupting
 * settings).
 *
 * Pass ``allowUnknownServer: true`` to opt into pass-through for keys
 * that aren't in {@link ACP_PROVIDERS} or ``ACP_CUSTOM_PRESET_KEY``.
 * The Settings → Agent page uses this when the user opens settings
 * that already carry an ``acp_server`` value canvas's registry
 * doesn't know about (e.g. set out-of-band via the API for a provider
 * we haven't mirrored yet) and saves without changing the command —
 * otherwise the original key would be silently demoted to ``"custom"``.
 */
export function buildAcpAgentSettingsDiff(
  providerKey: string,
  options: {
    command?: string[];
    model?: string | null;
    allowUnknownServer?: boolean;
  } = {},
): Record<string, unknown> | null {
  if (providerKey === "openhands") {
    // Switching back to OpenHands. The agent-server's ``Settings.update``
    // applies a fresh ``{'agent_kind': ...}`` base whenever the kind
    // flips, so any ``acp_*`` fields would be discarded before
    // validation. Send the kind alone.
    return { agent_kind: "openhands" };
  }

  const isCustom = providerKey === ACP_CUSTOM_PRESET_KEY;
  const provider = isCustom ? undefined : getAcpProvider(providerKey);
  if (!isCustom && !provider && !options.allowUnknownServer) {
    return null;
  }

  const model =
    options.model === undefined
      ? (provider?.default_model ?? null)
      : options.model;

  // ``acp_args: []`` resets any API-set ``acp_args`` that would
  // otherwise survive and concatenate to ``acp_command`` at spawn time
  // (the agent-server merges the two before exec). Callers building the
  // payload from a textarea that already shows the merged command
  // (Settings → Agent) round-trip correctly — the merged tokens land in
  // ``acp_command`` here, so no args are lost.
  return {
    agent_kind: "acp",
    acp_server: providerKey,
    acp_command: options.command ?? [],
    acp_args: [],
    acp_model: model ?? null,
  };
}
