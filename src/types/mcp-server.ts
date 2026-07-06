import type {
  MCPOAuthStartResponse,
  MCPOAuthStatusResponse,
  MCPAuthCredential,
  MCPTestFailureKind,
  MCPTestResponse,
  MCPToolCallResult,
} from "@openhands/typescript-client";

export type MCPServerType = "sse" | "stdio" | "shttp";

export interface MCPServerConfig {
  id: string;
  type: MCPServerType;
  name?: string;
  url?: string;
  headers?: Record<string, string>;
  timeout?: number;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  auth?: MCPAuthCredential;
}

export type { MCPOAuthStartResponse, MCPOAuthStatusResponse };
export type MCPTestToolResult = MCPToolCallResult;

export type ExtendedMCPTestFailureKind = MCPTestFailureKind | "credentials";

export interface ExtendedMCPTestFailure {
  ok: false;
  error: string;
  error_kind: ExtendedMCPTestFailureKind;
}

export type ExtendedMCPTestResponse = MCPTestResponse | ExtendedMCPTestFailure;
