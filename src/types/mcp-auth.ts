export type MCPOAuthClientAuthMethod =
  | "none"
  | "client_secret_post"
  | "client_secret_basic";

export type MCPAuthenticationMetadataValue =
  | boolean
  | number
  | string
  | null
  | MCPAuthenticationMetadataValue[]
  | { [key: string]: MCPAuthenticationMetadataValue };

export interface MCPOAuthAuthenticationConfig {
  type: "oauth";
  client_auth_method?: MCPOAuthClientAuthMethod;
  scopes?: string | string[];
  client_name?: string;
  client_metadata_url?: string;
  additional_client_metadata?: Record<string, MCPAuthenticationMetadataValue>;
}

export type MCPAuthenticationConfig = MCPOAuthAuthenticationConfig;
