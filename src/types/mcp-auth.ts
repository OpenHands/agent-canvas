export type MCPOAuthClientAuthMethod =
  | "none"
  | "client_secret_post"
  | "client_secret_basic"
  | "private_key_jwt";

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

export type MCPAuthValue =
  | boolean
  | number
  | string
  | null
  | MCPAuthValue[]
  | { [key: string]: MCPAuthValue };

export interface MCPOAuthTokenState {
  access_token?: string;
  token_type?: "Bearer";
  expires_in?: number | null;
  scope?: string | null;
  refresh_token?: string | null;
}

export interface MCPOAuthClientInfoState {
  redirect_uris?: string[] | null;
  token_endpoint_auth_method?: MCPOAuthClientAuthMethod | null;
  grant_types?: string[];
  response_types?: string[];
  scope?: string | null;
  client_name?: string | null;
  client_uri?: string | null;
  logo_uri?: string | null;
  contacts?: string[] | null;
  tos_uri?: string | null;
  policy_uri?: string | null;
  jwks_uri?: string | null;
  jwks?: MCPAuthValue;
  software_id?: string | null;
  software_version?: string | null;
  client_id?: string | null;
  client_secret?: string | null;
  client_id_issued_at?: number | null;
  client_secret_expires_at?: number | null;
}

export interface MCPOAuthState {
  tokens?: MCPOAuthTokenState | null;
  client_info?: MCPOAuthClientInfoState | null;
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
