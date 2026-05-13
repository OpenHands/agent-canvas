// Shared MCPServerConfig shape used by the MCP page UI components.
//
// Historically each component duplicated this interface. Centralizing
// it here keeps the marketplace utilities, hooks, and form in sync.

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
