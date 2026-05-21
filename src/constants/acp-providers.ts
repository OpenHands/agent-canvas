import { I18nKey } from "#/i18n/declaration";

export type ACPProviderIcon =
  | "openhands"
  | "claude-code"
  | "codex"
  | "gemini"
  | "cli-generic";

export const ACP_PROVIDER_FALLBACK_ICON: ACPProviderIcon = "cli-generic";

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
    description_key: I18nKey.ONBOARDING$AGENT_GEMINI_CLI_DESCRIPTION,
    icon: "gemini",
  },
];

export const ACP_CUSTOM_PRESET_KEY = "custom";

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
  if (!key) return null;
  const found = ACP_PROVIDERS.find((p) => p.key === key);
  return found ? found.display_name : null;
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
  const provider = isCustom
    ? undefined
    : ACP_PROVIDERS.find(({ key }) => key === providerKey);
  if (!isCustom && !provider && !options.allowUnknownServer) {
    return null;
  }

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
    acp_model: options.model ?? null,
  };
}
