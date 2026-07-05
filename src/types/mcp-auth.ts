export type MCPOAuthClientAuthMethod =
  | "none"
  | "client_secret_post"
  | "client_secret_basic"
  | "private_key_jwt";

export type MCPJsonValue =
  | boolean
  | number
  | string
  | null
  | MCPJsonValue[]
  | { [key: string]: MCPJsonValue };

export interface MCPOAuthAuthenticationConfig {
  type: "oauth";
  client_auth_method?: MCPOAuthClientAuthMethod;
  scopes?: string | string[];
  client_name?: string;
  client_metadata_url?: string;
  client_id?: string;
  client_secret?: string;
  additional_client_metadata?: Record<string, MCPJsonValue>;
}

export type MCPAuthenticationConfig = MCPOAuthAuthenticationConfig;

export interface MCPOAuthState {
  tokens?: Record<string, MCPJsonValue> | null;
  client_info?: Record<string, MCPJsonValue> | null;
  token_expires_at?: number | null;
}

export type MCPAuthCredential =
  | { strategy: "none" }
  | { strategy: "api_key"; value: string; header_name?: string }
  | { strategy: "bearer"; value: string }
  | { strategy: "basic"; username: string; password: string }
  | { strategy: "header"; headers: Record<string, string> }
  | {
      strategy: "oauth2";
      authentication?: MCPAuthenticationConfig;
      state?: MCPOAuthState;
    };

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
