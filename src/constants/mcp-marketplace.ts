// Curated catalog of well-known MCP servers exposed in the marketplace
// section of the MCP settings page. Order matters here — Slack and Tavily
// are intentionally listed first per product design.
//
// Any item can be installed with a single click; the install modal asks
// for whatever fields the template marks as `required`. Cloud vs Agent
// Server differences are expressed via `availability`: most entries are
// "all", but a small subset that only makes sense against a local
// runtime (filesystem, host postgres) is gated to "local".

export type MarketplaceFieldType = "text" | "password";

export interface MarketplaceField {
  key: string;
  label: string;
  type?: MarketplaceFieldType;
  placeholder?: string;
  helperText?: string;
  required?: boolean;
}

export type MarketplaceTemplate =
  | {
      kind: "tavily-builtin";
      // Tavily has first-class support inside the agent server: it reads
      // `search_api_key` and registers a Tavily MCP server automatically.
      // The marketplace card maps to that flow rather than a manual MCP
      // entry to keep it consistent with the legacy "Built-in search"
      // setting.
    }
  | {
      kind: "shttp";
      url: string;
      apiKeyOptional?: boolean;
    }
  | {
      kind: "sse";
      url: string;
      apiKeyOptional?: boolean;
    }
  | {
      kind: "stdio";
      // Stable name persisted into the SDK mcp_config map.
      serverName: string;
      command: string;
      args: string[];
      envFields?: MarketplaceField[];
      /**
       * Fields whose values are appended to `args` at install time
       * (each non-empty whitespace-separated token becomes its own arg).
       * Useful for templates like Postgres / Filesystem where the
       * user input is a positional argument, not an environment var.
       */
      argFields?: MarketplaceField[];
    };

export interface MarketplaceEntry {
  id: string;
  name: string;
  description: string;
  /** URL pointing at upstream docs/setup instructions. */
  docsUrl?: string;
  /** Single emoji rendered as a fallback icon. */
  icon: string;
  /** Background color for the icon tile. */
  iconBg: string;
  /** "all" by default; "local" hides the entry on cloud backends. */
  availability?: "all" | "local";
  /** Short helpful prose shown in the install modal under the title. */
  installHint?: string;
  template: MarketplaceTemplate;
}

export const MCP_MARKETPLACE: MarketplaceEntry[] = [
  {
    id: "slack",
    name: "Slack",
    description:
      "Read channels, post messages, and search workspace history from your agent.",
    docsUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/slack",
    icon: "💬",
    iconBg: "#4A154B",
    installHint:
      "Create a Slack app with the required scopes, then paste its bot token below.",
    template: {
      kind: "stdio",
      serverName: "slack",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-slack"],
      envFields: [
        {
          key: "SLACK_BOT_TOKEN",
          label: "Bot token",
          type: "password",
          placeholder: "xoxb-...",
          required: true,
        },
        {
          key: "SLACK_TEAM_ID",
          label: "Team / Workspace ID",
          type: "text",
          placeholder: "T01234567",
          helperText:
            "Find this in Slack under Workspace settings → About this workspace.",
          required: true,
        },
      ],
    },
  },
  {
    id: "tavily",
    name: "Tavily",
    description:
      "Production-grade web search optimized for LLM agents. Free tier available.",
    docsUrl: "https://tavily.com/",
    icon: "🔎",
    iconBg: "#2563EB",
    installHint:
      "Paste your Tavily API key. OpenHands wires up the Tavily MCP server automatically.",
    template: { kind: "tavily-builtin" },
  },
  {
    id: "github",
    name: "GitHub",
    description:
      "Search code, manage issues and pull requests, and inspect repos via the GitHub API.",
    docsUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/github",
    icon: "🐙",
    iconBg: "#24292F",
    template: {
      kind: "stdio",
      serverName: "github",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      envFields: [
        {
          key: "GITHUB_PERSONAL_ACCESS_TOKEN",
          label: "Personal access token",
          type: "password",
          placeholder: "github_pat_...",
          required: true,
        },
      ],
    },
  },
  {
    id: "linear",
    name: "Linear",
    description:
      "Browse and update Linear issues, cycles, and projects from the agent.",
    docsUrl: "https://linear.app/changelog/2025-05-01-mcp",
    icon: "📐",
    iconBg: "#5E6AD2",
    installHint:
      "Linear's hosted MCP server uses your Linear OAuth login — no key required.",
    template: {
      kind: "sse",
      url: "https://mcp.linear.app/sse",
      apiKeyOptional: true,
    },
  },
  {
    id: "notion",
    name: "Notion",
    description:
      "Read and edit Notion pages, databases, and blocks via Notion's MCP server.",
    docsUrl: "https://developers.notion.com/docs/mcp",
    icon: "📓",
    iconBg: "#FFFFFF",
    template: {
      kind: "stdio",
      serverName: "notion",
      command: "npx",
      args: ["-y", "@notionhq/notion-mcp-server"],
      envFields: [
        {
          key: "NOTION_API_KEY",
          label: "Internal integration token",
          type: "password",
          placeholder: "ntn_...",
          required: true,
        },
      ],
    },
  },
  {
    id: "sentry",
    name: "Sentry",
    description:
      "Triage issues, inspect events, and run Seer fixes against your Sentry org.",
    docsUrl: "https://docs.sentry.io/product/sentry-mcp/",
    icon: "🛰️",
    iconBg: "#362D59",
    template: {
      kind: "shttp",
      url: "https://mcp.sentry.dev/mcp",
      apiKeyOptional: true,
    },
  },
  {
    id: "atlassian",
    name: "Atlassian (Jira & Confluence)",
    description:
      "Search Jira issues and Confluence pages via Atlassian's hosted MCP server.",
    docsUrl: "https://www.atlassian.com/platform/remote-mcp-server",
    icon: "🪐",
    iconBg: "#0052CC",
    template: {
      kind: "sse",
      url: "https://mcp.atlassian.com/v1/sse",
      apiKeyOptional: true,
    },
  },
  {
    id: "brave-search",
    name: "Brave Search",
    description:
      "Privacy-first web and local search using the Brave Search API.",
    docsUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search",
    icon: "🦁",
    iconBg: "#FB542B",
    template: {
      kind: "stdio",
      serverName: "brave_search",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-brave-search"],
      envFields: [
        {
          key: "BRAVE_API_KEY",
          label: "Brave API key",
          type: "password",
          required: true,
        },
      ],
    },
  },
  {
    id: "postgres",
    name: "Postgres",
    description:
      "Read-only SQL queries and schema introspection against any Postgres database.",
    docsUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/postgres",
    icon: "🐘",
    iconBg: "#336791",
    availability: "local",
    template: {
      kind: "stdio",
      serverName: "postgres",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-postgres"],
      argFields: [
        {
          key: "connection_string",
          label: "Connection string",
          type: "password",
          placeholder: "postgresql://user:pass@host:5432/dbname",
          required: true,
          helperText: "Passed to the server as a single positional argument.",
        },
      ],
    },
  },
  {
    id: "filesystem",
    name: "Filesystem",
    description:
      "Give the agent secure, scoped filesystem access outside the workspace.",
    docsUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem",
    icon: "📁",
    iconBg: "#525B6F",
    availability: "local",
    installHint:
      "Each path is exposed read/write. Add as many as you need, separated by spaces.",
    template: {
      kind: "stdio",
      serverName: "filesystem",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem"],
      argFields: [
        {
          key: "paths",
          label: "Paths (space separated)",
          type: "text",
          placeholder: "/Users/me/Documents /Users/me/Projects",
          required: true,
          helperText:
            "Each whitespace-separated token is appended as its own argument.",
        },
      ],
    },
  },
];
