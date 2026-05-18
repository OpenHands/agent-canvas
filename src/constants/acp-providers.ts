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
 * needs the three fields below.
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
}

export const ACP_PROVIDERS: ACPProviderConfig[] = [
  {
    key: "claude-code",
    display_name: "Claude Code",
    default_command: ["npx", "-y", "@agentclientprotocol/claude-agent-acp"],
  },
  {
    key: "codex",
    display_name: "Codex",
    default_command: ["npx", "-y", "@zed-industries/codex-acp"],
  },
  {
    key: "gemini-cli",
    display_name: "Gemini CLI",
    default_command: ["npx", "-y", "@google/gemini-cli", "--acp"],
  },
];

export const ACP_CUSTOM_PRESET_KEY = "custom";
