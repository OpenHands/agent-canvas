import type {
  MCPAuthCredential,
  MCPJsonValue,
  MCPOAuthAuthentication,
  MCPOAuthClientAuthMethod,
  MCPOAuthState,
} from "@openhands/typescript-client";

export type {
  MCPAuthCredential,
  MCPJsonValue,
  MCPOAuthClientAuthMethod,
  MCPOAuthState,
};

export type MCPOAuthAuthenticationConfig = MCPOAuthAuthentication;
export type MCPAuthenticationConfig = MCPOAuthAuthenticationConfig;

export const MCP_AUTH_STRATEGIES = [
  "none",
  "api_key",
  "bearer",
  "basic",
  "header",
  "oauth2",
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

export const isMcpAuthCredential = (
  value: unknown,
): value is MCPAuthCredential =>
  isRecord(value) &&
  typeof value.strategy === "string" &&
  (MCP_AUTH_STRATEGIES as readonly string[]).includes(value.strategy);
