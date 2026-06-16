// Shared MCPServerConfig shape used by the MCP page UI components.
//
// Historically each component duplicated this interface. Centralizing
// it here keeps the marketplace utilities, hooks, and form in sync.

import type { MCPTestFailureKind } from "@openhands/typescript-client";

export type MCPServerType = "sse" | "stdio" | "shttp";

export interface MCPServerConfig {
  id: string;
  type: MCPServerType;
  name?: string;
  url?: string;
  api_key?: string;
  timeout?: number;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}

// Extensions of the published `@openhands/typescript-client` MCP test
// types (frozen at the released version). The agent server's
// /api/mcp/test additionally accepts a `tool_call` (a read-only tool to
// invoke so credentials get exercised) and reports its outcome in
// `tool_result`; the service layer maps an interpreted credential
// failure to the GUI-local `"credentials"` error kind.

export interface MCPTestToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface MCPTestToolResult {
  is_error: boolean;
  text: string;
}

export type ExtendedMCPTestFailureKind = MCPTestFailureKind | "credentials";

export interface ExtendedMCPTestSuccess {
  ok: true;
  tools: string[];
  tool_result?: MCPTestToolResult | null;
}

export interface ExtendedMCPTestFailure {
  ok: false;
  error: string;
  error_kind: ExtendedMCPTestFailureKind;
}

export type ExtendedMCPTestResponse =
  | ExtendedMCPTestSuccess
  | ExtendedMCPTestFailure;
