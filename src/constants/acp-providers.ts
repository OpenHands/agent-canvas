import { I18nKey } from "#/i18n/declaration";

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
 * Built-in ACP (Agent Client Protocol) provider registry.
 *
 * **Source of truth:** ``openhands.sdk.settings.acp_providers.ACP_PROVIDERS``
 * in https://github.com/OpenHands/software-agent-sdk. This file is a
 * hand-kept TypeScript mirror — keep keys + commands in sync with the
 * Python source. The {@link OnboardingAgentId} and the
 * ``ACPAgentSettings.acp_server`` discriminator
 * (``"claude-code" | "codex" | "gemini-cli" | "custom"``) come from the
 * same Python module.
 *
 * Drift risk is tracked in agent-canvas#587. The richer SDK record
 * (api-key env var, session mode, set-session-model protocol, etc.)
 * is intentionally not mirrored here — canvas only renders this
 * registry in the Settings → Agent and onboarding UIs, so it only
 * needs the fields below.
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
   * Canvas-local suggested ACP model IDs. These mirror the current runtime
   * picker values for the built-in harnesses, but are not authoritative access
   * checks; users can still enter a custom override in Settings -> Agent.
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

// Canonical model IDs the Claude Code CLI binary's model registry recognises
// (verified by string-scanning v2.1.146 of the bundled ``claude`` native
// binary). ``[1m]`` is the SDK-documented 1M-context suffix; we use the
// version-agnostic alias so the option auto-tracks the newest 1M-capable
// model. ``opusplan`` routes planning to Opus and execution to Sonnet.
// Availability for any of these ultimately depends on the user's Anthropic
// plan tier — surfacing them here matches what the CLI *accepts*, not what
// every account can actually invoke.
const CLAUDE_MODELS: ACPModelOption[] = [
  { id: "claude-opus-4-7", label: "Claude Opus 4.7" },
  { id: "claude-opus-4-6", label: "Claude Opus 4.6" },
  // The 1M-context entries use the version-agnostic ``[1m]`` aliases, so the
  // label must stay version-less too — pinning a number here (e.g. "4.6")
  // would lie the moment the alias resolves to a newer model.
  { id: "opus[1m]", label: "Claude Opus (1M)" },
  { id: "claude-opus-4-5", label: "Claude Opus 4.5" },
  { id: "claude-opus-4-1-20250805", label: "Claude Opus 4.1" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { id: "sonnet[1m]", label: "Claude Sonnet (1M)" },
  { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
  { id: "opusplan", label: "Opus (plan) + Sonnet (execute)" },
];

// Model IDs accepted by the ``@zed-industries/codex-acp`` wrapper, mirroring
// the Codex CLI's own ``/model`` picker. Format is ``<base-model>/<effort>``
// where the trailing tier (``low``/``medium``/``high``/``xhigh``) hints the
// reasoning effort for that turn. Sourced from the Codex CLI's documented
// runtime options as of 2026-05-22 — see ``acp_model`` registry tracker
// in agent-canvas#740 for the long-term plan.
const CODEX_MODELS: ACPModelOption[] = [
  { id: "gpt-5.5/low", label: "GPT-5.5 (low)" },
  { id: "gpt-5.5/medium", label: "GPT-5.5 (medium)" },
  { id: "gpt-5.5/high", label: "GPT-5.5 (high)" },
  { id: "gpt-5.5/xhigh", label: "GPT-5.5 (xhigh)" },
  { id: "gpt-5.4/low", label: "GPT-5.4 (low)" },
  { id: "gpt-5.4/medium", label: "GPT-5.4 (medium)" },
  { id: "gpt-5.4/high", label: "GPT-5.4 (high)" },
  { id: "gpt-5.4/xhigh", label: "GPT-5.4 (xhigh)" },
  { id: "gpt-5.4-mini/low", label: "GPT-5.4 Mini (low)" },
  { id: "gpt-5.4-mini/medium", label: "GPT-5.4 Mini (medium)" },
  { id: "gpt-5.4-mini/high", label: "GPT-5.4 Mini (high)" },
  { id: "gpt-5.4-mini/xhigh", label: "GPT-5.4 Mini (xhigh)" },
  { id: "gpt-5.3-codex/low", label: "GPT-5.3 Codex (low)" },
  { id: "gpt-5.3-codex/medium", label: "GPT-5.3 Codex (medium)" },
  { id: "gpt-5.3-codex/high", label: "GPT-5.3 Codex (high)" },
  { id: "gpt-5.3-codex/xhigh", label: "GPT-5.3 Codex (xhigh)" },
  { id: "gpt-5.2/low", label: "GPT-5.2 (low)" },
  { id: "gpt-5.2/medium", label: "GPT-5.2 (medium)" },
  { id: "gpt-5.2/high", label: "GPT-5.2 (high)" },
  { id: "gpt-5.2/xhigh", label: "GPT-5.2 (xhigh)" },
];

// Model IDs accepted by ``@google/gemini-cli --acp``. The ``auto-gemini-*``
// entries delegate version selection to the CLI's router; the explicit
// ``gemini-3.1-*`` / ``gemini-2.5-*`` entries pin to a specific snapshot.
// Sourced from the Gemini CLI's documented model list as of 2026-05-22 —
// see agent-canvas#740 for the long-term plan to move this registry
// upstream.
const GEMINI_MODELS: ACPModelOption[] = [
  { id: "auto-gemini-3", label: "Auto (Gemini 3)" },
  { id: "auto-gemini-2.5", label: "Auto (Gemini 2.5)" },
  { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (preview)" },
  { id: "gemini-3-flash-preview", label: "Gemini 3 Flash (preview)" },
  {
    id: "gemini-3.1-flash-lite-preview",
    label: "Gemini 3.1 Flash Lite (preview)",
  },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
];

// Each entry's ``default_command`` is the published-package npx
// invocation that speaks the ACP JSON-RPC protocol on stdio. Verified
// against the upstream npm registry on the date noted below — if a
// package is renamed/unpublished, the agent-server spawn fails fast
// with ``ENOENT`` and the user can switch to the "Custom" preset.
export const ACP_PROVIDERS: ACPProviderConfig[] = [
  {
    key: "claude-code",
    display_name: "Claude Code",
    // https://www.npmjs.com/package/@agentclientprotocol/claude-agent-acp
    // Verified 2026-05-19. Official Anthropic-maintained ACP wrapper
    // around the Claude Code CLI.
    default_command: ["npx", "-y", "@agentclientprotocol/claude-agent-acp"],
    available_models: CLAUDE_MODELS,
    default_model: "claude-opus-4-7",
    description_key: I18nKey.ONBOARDING$AGENT_CLAUDE_CODE_DESCRIPTION,
    icon: "claude-code",
  },
  {
    key: "codex",
    display_name: "Codex",
    // https://www.npmjs.com/package/@zed-industries/codex-acp
    // Verified 2026-05-19. Zed-maintained ACP wrapper around the
    // OpenAI Codex CLI — NOT ``@openai/codex acp`` (no ``acp``
    // subcommand on that package).
    default_command: ["npx", "-y", "@zed-industries/codex-acp"],
    available_models: CODEX_MODELS,
    default_model: "gpt-5.5/medium",
    description_key: I18nKey.ONBOARDING$AGENT_CODEX_DESCRIPTION,
    icon: "codex",
  },
  {
    key: "gemini-cli",
    display_name: "Gemini CLI",
    // https://www.npmjs.com/package/@google/gemini-cli
    // Verified 2026-05-19. Official Google CLI; ``--acp`` switches it
    // into ACP server mode on stdio.
    default_command: ["npx", "-y", "@google/gemini-cli", "--acp"],
    available_models: GEMINI_MODELS,
    default_model: "gemini-2.5-pro",
    description_key: I18nKey.ONBOARDING$AGENT_GEMINI_CLI_DESCRIPTION,
    icon: "gemini",
  },
];

export const ACP_CUSTOM_PRESET_KEY = "custom";

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
