/**
 * Frontend-only ACP preset constants.
 *
 * The list of *real* ACP providers (Claude Code, Codex, Gemini CLI) is
 * imported from ``@openhands/typescript-client`` (which mirrors the
 * canonical Python SDK registry). This file only holds the synthetic
 * ``"custom"`` preset key — the dropdown sentinel that means "the user
 * supplies their own ``acp_command``".
 */
export const ACP_CUSTOM_PRESET_KEY = "custom";
