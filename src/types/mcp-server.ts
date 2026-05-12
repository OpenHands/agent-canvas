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

/**
 * Discriminated union describing the "existing install" referenced
 * from various MCP UI surfaces (install modal, delete confirmation,
 * etc.). Previously these surfaces juggled
 * `MCPServerConfig | "tavily-builtin" | null`, which made the
 * Tavily-builtin case look like an arbitrary string and required
 * the same string check at every callsite.
 */
export type ExistingInstall =
  | { kind: "mcp"; server: MCPServerConfig }
  | { kind: "tavily-builtin" };

export const isMcpInstall = (
  i: ExistingInstall | null | undefined,
): i is { kind: "mcp"; server: MCPServerConfig } => i?.kind === "mcp";
