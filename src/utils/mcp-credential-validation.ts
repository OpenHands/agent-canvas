import { INTEGRATION_CATALOG as MCP_MARKETPLACE } from "@openhands/extensions/integrations";
import {
  findCatalogEntryForServer,
  getMcpMarketplaceCatalog,
} from "#/utils/mcp-marketplace-utils";
import type {
  MCPServerConfig,
  MCPTestToolCall,
  MCPTestToolResult,
} from "#/types/mcp-server";

/**
 * Credential validation specs for marketplace MCP servers whose credentials
 * are only exercised on tool invocation (listing tools succeeds with any
 * credentials). The test endpoint runs `toolCall` after listing and reports
 * the outcome verbatim; `interpret` decides whether that outcome proves the
 * credentials are invalid.
 *
 * `toolCall` MUST be read-only — it runs on every "Test connection" /
 * pre-save validation.
 */
export interface CredentialValidation {
  toolCall: MCPTestToolCall;
  /** Returns the provider's error code/message, or null when creds pass. */
  interpret: (toolResult: MCPTestToolResult) => string | null;
}

/**
 * Slack error codes that mean the credentials themselves are bad. Anything
 * else (e.g. `missing_scope`) proves the token *authenticated* — a valid
 * token lacking a scope must not be reported as invalid credentials.
 */
const SLACK_AUTH_FAILURES = new Set([
  "invalid_auth",
  "not_authed",
  "account_inactive",
  "token_revoked",
  "token_expired",
]);

const VALIDATION_BY_ENTRY_ID: Record<string, CredentialValidation> = {
  slack: {
    // Read-only: lists at most one channel. The Slack MCP server returns
    // the raw Slack API JSON ({ok: boolean, error?: string}) as text.
    toolCall: { name: "slack_list_channels", arguments: { limit: 1 } },
    interpret: (toolResult) => {
      if (toolResult.is_error) {
        return toolResult.text || "tool call failed";
      }
      try {
        const parsed = JSON.parse(toolResult.text);
        if (parsed?.ok === false && SLACK_AUTH_FAILURES.has(parsed.error)) {
          return String(parsed.error);
        }
      } catch {
        // Non-JSON payload — make no claim about the credentials.
      }
      return null;
    },
  },
};

/**
 * Look up the credential validation for a server by matching it to its
 * marketplace catalog entry (same matching the MCP page uses for icons).
 * Returns undefined for custom servers — their test behaves as before.
 */
export function getCredentialValidationForServer(
  server: MCPServerConfig,
): CredentialValidation | undefined {
  const entry = findCatalogEntryForServer(
    server,
    getMcpMarketplaceCatalog(MCP_MARKETPLACE),
  );
  return entry ? VALIDATION_BY_ENTRY_ID[entry.id] : undefined;
}
