import { redirect } from "react-router";

// MCP settings used to live at /settings/mcp. It now has a dedicated
// top-level entry under the main left-hand navigation, so this route
// just redirects to keep old links working.
export const clientLoader = async () => redirect("/mcp");

export default function MCPSettingsRedirect() {
  return null;
}
