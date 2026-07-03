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

export type MCPAuthValue =
  | boolean
  | number
  | string
  | null
  | MCPAuthValue[]
  | { [key: string]: MCPAuthValue };

export type MCPAuthCredential =
  | { strategy: "none" }
  | { strategy: "api_key"; value: string; header_name?: string }
  | { strategy: "bearer"; value: string }
  | { strategy: "basic"; username: string; password: string }
  | { strategy: "header"; headers: Record<string, string> }
  | {
      strategy: "oauth2";
      authentication?: MCPAuthenticationConfig;
      credentials?: Record<string, MCPAuthValue>;
    }
  | { strategy: "custom"; fastmcp: Record<string, MCPAuthValue> };
