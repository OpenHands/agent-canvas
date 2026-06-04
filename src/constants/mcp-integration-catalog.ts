import {
  INTEGRATION_CATALOG as EXTENSIONS_INTEGRATION_CATALOG,
  type IntegrationCatalogEntry,
  type IntegrationConnectionOption,
} from "@openhands/extensions/integrations";

export const GITHUB_HOSTED_MCP_URL = "https://api.githubcopilot.com/mcp/";

const githubHostedApiOption: IntegrationConnectionOption = {
  id: "api",
  provider: "mcp",
  transport: {
    kind: "shttp",
    url: GITHUB_HOSTED_MCP_URL,
  },
  auth: {
    strategy: "api_key",
    credentialLabel: "Personal access token",
    credentialPlaceholder: "github_pat_...",
    credentialHelp:
      "Classic or fine-grained personal access token from GitHub settings.",
  },
};

function patchGitHubCatalogEntry(
  entry: IntegrationCatalogEntry,
): IntegrationCatalogEntry {
  if (entry.id !== "github") {
    return entry;
  }

  const otherOptions = entry.connectionOptions.filter(
    (option) => option.id !== "api",
  );

  return {
    ...entry,
    installHint:
      "Paste a GitHub personal access token with repo scope. Uses GitHub's hosted MCP server — no Docker required.",
    defaultConnectionOptionId: "api",
    connectionOptions: [...otherOptions, githubHostedApiOption],
  };
}

export const MCP_INTEGRATION_CATALOG = EXTENSIONS_INTEGRATION_CATALOG.map(
  patchGitHubCatalogEntry,
);
