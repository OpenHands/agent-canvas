/**
 * Built-in ACP (Agent Client Protocol) provider registry.
 *
 * Mirrors the Python SDK source of truth at
 * ``openhands.sdk.settings.ACP_PROVIDERS`` so the UI can list presets and
 * resolve a brand name from a stored ``acp_server`` key without an extra
 * backend round-trip. Keep keys in sync with ``ACPServerKind`` on the SDK
 * side (``claude-code`` / ``codex`` / ``gemini-cli`` / ``custom``).
 */
export interface ACPProviderConfig {
  /** Stable registry key, also stored on conversations as ``tags.acp_server``. */
  key: string;
  /** Human-readable name shown in dropdowns and conversation chips. */
  display_name: string;
  /** Tokens passed to the agent-server as ``acp_command`` when this preset is picked. */
  default_command: string[];
}

export const ACP_PROVIDERS: ACPProviderConfig[] = [
  {
    key: "claude-code",
    display_name: "Claude Code",
    default_command: ["npx", "-y", "@zed-industries/claude-code-acp"],
  },
  {
    key: "codex",
    display_name: "Codex",
    default_command: ["npx", "-y", "@openai/codex", "acp"],
  },
  {
    key: "gemini-cli",
    display_name: "Gemini CLI",
    default_command: ["npx", "-y", "@google/gemini-cli", "--experimental-acp"],
  },
];

export const ACP_CUSTOM_PRESET_KEY = "custom";
