// Curated catalog of well-known MCP servers exposed in the marketplace
// section of the MCP settings page. Order matters — GitHub is the most
// commonly-installed entry per product design, with Slack and Tavily
// pinned right after.
//
// Cloud vs Agent Server differences are expressed via `availability`:
// most entries are "all", but a small subset that only makes sense
// against a local runtime (filesystem, host postgres, host sqlite) is
// gated to "local".
//
// The catalog is intentionally a flat array of `MarketplaceEntry`
// values rather than something more dynamic — it doubles as the data
// source for the marketplace search bar, and keeping it static keeps
// the search trivially fast even with 50+ entries.

import type { ReactNode } from "react";
import {
  BookOpen,
  Bot,
  Brain,
  Clock,
  Database,
  Flame,
  Folder,
  GitBranch,
  Globe,
  Image as ImageIcon,
  ListTree,
  MousePointerClick,
  Search,
  Sparkles,
  Telescope,
  TestTube,
} from "lucide-react";
import {
  SiAirtable,
  SiAtlassian,
  SiBrave,
  SiClickhouse,
  SiCloudflare,
  SiElevenlabs,
  SiFigma,
  SiGithub,
  SiGitlab,
  SiGooglemaps,
  SiHuggingface,
  SiKagi,
  SiLinear,
  SiMattermost,
  SiMongodb,
  SiNotion,
  SiObsidian,
  SiPaypal,
  SiPostgresql,
  SiPuppeteer,
  SiRedis,
  SiResend,
  SiSentry,
  SiSlack,
  SiSqlite,
  SiStripe,
  SiSupabase,
} from "react-icons/si";

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
       * (each non-empty whitespace-separated token becomes its own
       * arg). Useful for templates like Postgres / Filesystem where
       * the user input is a positional argument, not an env var.
       */
      argFields?: MarketplaceField[];
    };

export interface MarketplaceEntry {
  id: string;
  name: string;
  description: string;
  /** URL pointing at upstream docs/setup instructions. */
  docsUrl?: string;
  /**
   * Brand-correct logo rendered inside the icon tile. Sized to fit
   * the 40×40 tile (rendered at h-5/w-5 inside it). Use
   * `currentColor` where possible so the parent's `iconColor`
   * controls the fill.
   */
  logo: ReactNode;
  /** Background color for the icon tile. */
  iconBg: string;
  /**
   * Foreground color for the logo when the icon supports
   * `currentColor`. Defaults to white; tiles on light brand colors
   * (e.g. Notion, HuggingFace) override this.
   */
  iconColor?: string;
  /**
   * Extra free-text keywords used by the search bar in addition to
   * `name` and `description`. Lower-case only.
   */
  keywords?: string[];
  /** "all" by default; "local" hides the entry on cloud backends. */
  availability?: "all" | "local";
  /** Short helpful prose shown in the install modal under the title. */
  installHint?: string;
  template: MarketplaceTemplate;
}

const LOGO = "h-5 w-5";

// ---------------------------------------------------------------------
// Order in this array IS the order users see in the marketplace grid.
// GitHub, Slack, and Tavily are pinned to the front intentionally.
// ---------------------------------------------------------------------

export const MCP_MARKETPLACE: MarketplaceEntry[] = [
  // -- Pinned ----------------------------------------------------------
  {
    id: "github",
    name: "GitHub",
    description:
      "Search code, manage issues and pull requests, and inspect repos via the GitHub API.",
    docsUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/github",
    logo: <SiGithub className={LOGO} />,
    iconBg: "var(--oh-surface)",
    keywords: ["git", "pr", "repo", "issues", "code"],
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
    id: "slack",
    name: "Slack",
    description:
      "Read channels, post messages, and search workspace history from your agent.",
    docsUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/slack",
    logo: <SiSlack className={LOGO} />,
    iconBg: "#4A154B",
    keywords: ["chat", "messaging", "team"],
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
    docsUrl: "https://github.com/tavily-ai/tavily-mcp",
    // Tavily isn't in the simple-icons set; use a search glyph on
    // their brand blue tile so the marketplace stays icon-consistent.
    logo: <Search className={LOGO} strokeWidth={2.5} />,
    iconBg: "#2563EB",
    keywords: ["search", "web", "browsing", "research"],
    installHint:
      "Paste your Tavily API key — the official tavily-mcp package runs via npx.",
    template: {
      kind: "stdio",
      serverName: "tavily",
      command: "npx",
      args: ["-y", "tavily-mcp"],
      envFields: [
        {
          key: "TAVILY_API_KEY",
          label: "Tavily API key",
          type: "password",
          placeholder: "tvly-...",
          required: true,
        },
      ],
    },
  },

  // -- Hosted, first-party --------------------------------------------
  {
    id: "linear",
    name: "Linear",
    description:
      "Browse and update Linear issues, cycles, and projects from the agent.",
    docsUrl: "https://linear.app/changelog/2025-05-01-mcp",
    logo: <SiLinear className={LOGO} />,
    iconBg: "#5E6AD2",
    keywords: ["issues", "project management", "tasks", "tickets"],
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
    logo: <SiNotion className={LOGO} />,
    iconBg: "#FFFFFF",
    iconColor: "#000000",
    keywords: ["docs", "notes", "wiki", "knowledge base"],
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
    id: "atlassian",
    name: "Atlassian (Jira & Confluence)",
    description:
      "Search Jira issues and Confluence pages via Atlassian's hosted MCP server.",
    docsUrl: "https://www.atlassian.com/platform/remote-mcp-server",
    logo: <SiAtlassian className={LOGO} />,
    iconBg: "#0052CC",
    keywords: ["jira", "confluence", "tickets", "wiki", "issues"],
    template: {
      kind: "sse",
      url: "https://mcp.atlassian.com/v1/sse",
      apiKeyOptional: true,
    },
  },
  {
    id: "sentry",
    name: "Sentry",
    description:
      "Triage issues, inspect events, and run Seer fixes against your Sentry org.",
    docsUrl: "https://docs.sentry.io/product/sentry-mcp/",
    logo: <SiSentry className={LOGO} />,
    iconBg: "#362D59",
    keywords: ["errors", "observability", "monitoring", "crash"],
    template: {
      kind: "shttp",
      url: "https://mcp.sentry.dev/mcp",
      apiKeyOptional: true,
    },
  },
  {
    id: "stripe",
    name: "Stripe",
    description:
      "Query customers, payments, subscriptions, and invoices via Stripe's hosted MCP server.",
    docsUrl: "https://stripe.com/docs/mcp",
    logo: <SiStripe className={LOGO} />,
    iconBg: "#635BFF",
    keywords: ["payments", "billing", "subscriptions", "finance"],
    template: {
      kind: "shttp",
      url: "https://mcp.stripe.com/",
      apiKeyOptional: true,
    },
  },
  {
    id: "paypal",
    name: "PayPal",
    description:
      "Manage transactions and merchant data via PayPal's MCP server.",
    docsUrl: "https://developer.paypal.com/tools/mcp-server/",
    logo: <SiPaypal className={LOGO} />,
    iconBg: "#003087",
    keywords: ["payments", "billing", "finance"],
    template: {
      kind: "sse",
      url: "https://mcp.paypal.com/sse",
      apiKeyOptional: true,
    },
  },
  {
    id: "cloudflare-docs",
    name: "Cloudflare Docs",
    description:
      "Search and reference Cloudflare's developer documentation directly from the agent.",
    docsUrl: "https://developers.cloudflare.com/agents/model-context-protocol/",
    logo: <SiCloudflare className={LOGO} />,
    iconBg: "#F38020",
    keywords: ["cloudflare", "docs", "reference", "workers"],
    template: {
      kind: "sse",
      url: "https://docs.mcp.cloudflare.com/sse",
      apiKeyOptional: true,
    },
  },
  {
    id: "cloudflare-bindings",
    name: "Cloudflare Workers Bindings",
    description:
      "Inspect and manage KV, D1, R2, and Durable Object bindings on your Cloudflare account.",
    docsUrl: "https://developers.cloudflare.com/agents/model-context-protocol/",
    logo: <SiCloudflare className={LOGO} />,
    iconBg: "#F38020",
    keywords: ["cloudflare", "workers", "kv", "d1", "r2", "durable objects"],
    template: {
      kind: "sse",
      url: "https://bindings.mcp.cloudflare.com/sse",
      apiKeyOptional: true,
    },
  },
  {
    id: "cloudflare-observability",
    name: "Cloudflare Observability",
    description:
      "Tail Workers logs and query observability data from your Cloudflare account.",
    docsUrl: "https://developers.cloudflare.com/agents/model-context-protocol/",
    logo: <SiCloudflare className={LOGO} />,
    iconBg: "#F38020",
    keywords: ["cloudflare", "logs", "tail", "observability", "workers"],
    template: {
      kind: "sse",
      url: "https://observability.mcp.cloudflare.com/sse",
      apiKeyOptional: true,
    },
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    description:
      "Search models, datasets, and Spaces on the Hugging Face Hub from your agent.",
    docsUrl: "https://huggingface.co/docs/hub/en/mcp",
    logo: <SiHuggingface className={LOGO} />,
    iconBg: "#FFD21E",
    iconColor: "#000000",
    keywords: ["ml", "models", "datasets", "ai", "hub"],
    template: {
      kind: "shttp",
      url: "https://huggingface.co/mcp",
      apiKeyOptional: true,
    },
  },
  {
    id: "deepwiki",
    name: "DeepWiki",
    description:
      "Ask grounded questions about any public GitHub repository via Devin's DeepWiki MCP.",
    docsUrl: "https://docs.devin.ai/work-with-devin/deepwiki-mcp",
    logo: <BookOpen className={LOGO} />,
    iconBg: "var(--oh-color-base)",
    keywords: ["devin", "code", "wiki", "github", "docs", "qa"],
    template: {
      kind: "sse",
      url: "https://mcp.deepwiki.com/sse",
      apiKeyOptional: true,
    },
  },

  // -- Source control & code intelligence ------------------------------
  {
    id: "gitlab",
    name: "GitLab",
    description:
      "Search projects, browse merge requests, and update issues on GitLab.",
    docsUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/gitlab",
    logo: <SiGitlab className={LOGO} />,
    iconBg: "#FC6D26",
    keywords: ["git", "mr", "repo", "issues", "code"],
    template: {
      kind: "stdio",
      serverName: "gitlab",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-gitlab"],
      envFields: [
        {
          key: "GITLAB_PERSONAL_ACCESS_TOKEN",
          label: "Personal access token",
          type: "password",
          required: true,
        },
        {
          key: "GITLAB_API_URL",
          label: "API URL (optional)",
          type: "text",
          placeholder: "https://gitlab.example.com/api/v4",
          helperText: "Leave blank to use gitlab.com.",
        },
      ],
    },
  },
  {
    id: "git",
    name: "Git",
    description:
      "Local git repository operations: log, diff, blame, status, and more.",
    docsUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/git",
    logo: <GitBranch className={LOGO} strokeWidth={2.25} />,
    iconBg: "#F1502F",
    availability: "local",
    keywords: ["version control", "log", "diff", "blame"],
    installHint:
      "Runs the official Python server via uvx — no setup beyond the path.",
    template: {
      kind: "stdio",
      serverName: "git",
      command: "uvx",
      // The repo path is appended as the value of `--repository`; the
      // flag belongs on the base command so it lands immediately
      // before the user-supplied path when the modal concatenates
      // them.
      args: ["mcp-server-git", "--repository"],
      argFields: [
        {
          key: "repo_path",
          label: "Repository path",
          type: "text",
          placeholder: "/Users/me/code/my-repo",
          required: true,
          helperText: "Appended as --repository <path>.",
        },
      ],
    },
  },

  // -- Search & browsing -----------------------------------------------
  {
    id: "brave-search",
    name: "Brave Search",
    description:
      "Privacy-first web and local search using the Brave Search API.",
    docsUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search",
    logo: <SiBrave className={LOGO} />,
    iconBg: "#FB542B",
    keywords: ["search", "web"],
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
    id: "exa",
    name: "Exa",
    description:
      "Neural web search with semantic ranking, content extraction, and similar-page lookup.",
    docsUrl: "https://docs.exa.ai/reference/exa-mcp",
    logo: <Telescope className={LOGO} strokeWidth={2.25} />,
    iconBg: "var(--oh-surface)",
    keywords: ["search", "web", "research", "neural"],
    template: {
      kind: "stdio",
      serverName: "exa",
      command: "npx",
      args: ["-y", "exa-mcp-server"],
      envFields: [
        {
          key: "EXA_API_KEY",
          label: "Exa API key",
          type: "password",
          required: true,
        },
      ],
    },
  },
  {
    id: "firecrawl",
    name: "Firecrawl",
    description:
      "Crawl any site and return clean markdown, structured data, or screenshots.",
    docsUrl: "https://docs.firecrawl.dev/mcp",
    logo: <Flame className={LOGO} strokeWidth={2.25} />,
    iconBg: "#F97316",
    keywords: ["scraping", "crawl", "web", "markdown"],
    template: {
      kind: "stdio",
      serverName: "firecrawl",
      command: "npx",
      args: ["-y", "firecrawl-mcp"],
      envFields: [
        {
          key: "FIRECRAWL_API_KEY",
          label: "Firecrawl API key",
          type: "password",
          required: true,
        },
      ],
    },
  },
  {
    id: "apify",
    name: "Apify Actors",
    description:
      "Run any of Apify's 5,000+ Actors (scrapers, automations) from the agent.",
    docsUrl: "https://docs.apify.com/platform/integrations/mcp",
    logo: <Bot className={LOGO} strokeWidth={2.25} />,
    iconBg: "#10b981",
    keywords: ["scraping", "automation", "crawl", "actors"],
    template: {
      kind: "stdio",
      serverName: "apify",
      command: "npx",
      args: ["-y", "@apify/actors-mcp-server"],
      envFields: [
        {
          key: "APIFY_TOKEN",
          label: "Apify token",
          type: "password",
          required: true,
        },
      ],
    },
  },
  {
    id: "fetch",
    name: "Fetch",
    description:
      "Plain HTTP fetcher: download a URL and convert HTML to readable markdown.",
    docsUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/fetch",
    logo: <Globe className={LOGO} strokeWidth={2.25} />,
    iconBg: "var(--oh-interactive-hover)",
    keywords: ["http", "web", "url", "scrape"],
    template: {
      kind: "stdio",
      serverName: "fetch",
      command: "uvx",
      args: ["mcp-server-fetch"],
    },
  },
  {
    id: "browser-mcp",
    name: "Browser MCP",
    description:
      "Control your local browser tab — navigate, click, type, and read DOM contents.",
    docsUrl: "https://browsermcp.io/",
    logo: <MousePointerClick className={LOGO} strokeWidth={2.25} />,
    iconBg: "#0EA5E9",
    availability: "local",
    keywords: ["browser", "automation", "chrome", "playwright"],
    template: {
      kind: "stdio",
      serverName: "browser_mcp",
      command: "npx",
      args: ["-y", "@browsermcp/mcp"],
    },
  },
  {
    id: "playwright",
    name: "Playwright",
    description: "Headless-browser automation backed by Microsoft Playwright.",
    docsUrl: "https://github.com/microsoft/playwright-mcp",
    logo: <TestTube className={LOGO} strokeWidth={2.25} />,
    iconBg: "#2EAD33",
    keywords: ["browser", "automation", "e2e", "testing", "scrape"],
    template: {
      kind: "stdio",
      serverName: "playwright",
      command: "npx",
      args: ["-y", "@playwright/mcp"],
    },
  },
  {
    id: "puppeteer",
    name: "Puppeteer",
    description:
      "Headless Chrome via Puppeteer — navigate, screenshot, and scrape pages.",
    docsUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/puppeteer",
    logo: <SiPuppeteer className={LOGO} />,
    iconBg: "#40B5A4",
    keywords: ["browser", "automation", "scrape", "chrome"],
    template: {
      kind: "stdio",
      serverName: "puppeteer",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-puppeteer"],
    },
  },
  {
    id: "google-maps",
    name: "Google Maps",
    description:
      "Geocoding, directions, places search, and distance matrix lookups.",
    docsUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/google-maps",
    logo: <SiGooglemaps className={LOGO} />,
    iconBg: "#4285F4",
    keywords: ["maps", "geocode", "directions", "places"],
    template: {
      kind: "stdio",
      serverName: "google_maps",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-google-maps"],
      envFields: [
        {
          key: "GOOGLE_MAPS_API_KEY",
          label: "Google Maps API key",
          type: "password",
          required: true,
        },
      ],
    },
  },

  // -- Databases -------------------------------------------------------
  {
    id: "postgres",
    name: "Postgres",
    description:
      "Read-only SQL queries and schema introspection against any Postgres database.",
    docsUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/postgres",
    logo: <SiPostgresql className={LOGO} />,
    iconBg: "#336791",
    availability: "local",
    keywords: ["sql", "database", "postgresql"],
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
    id: "supabase",
    name: "Supabase",
    description:
      "Query and manage your Supabase project, including database, auth, and storage.",
    docsUrl: "https://supabase.com/docs/guides/getting-started/mcp",
    logo: <SiSupabase className={LOGO} />,
    iconBg: "#3ECF8E",
    keywords: ["database", "auth", "storage", "postgres"],
    template: {
      kind: "stdio",
      serverName: "supabase",
      command: "npx",
      args: ["-y", "@supabase/mcp-server-supabase@latest"],
      envFields: [
        {
          key: "SUPABASE_ACCESS_TOKEN",
          label: "Supabase access token",
          type: "password",
          required: true,
          helperText: "Personal access token from your Supabase dashboard.",
        },
      ],
    },
  },
  {
    id: "neon",
    name: "Neon",
    description:
      "Serverless Postgres: list projects, run queries, manage branches.",
    docsUrl: "https://neon.com/docs/ai/neon-mcp-server",
    logo: <Database className={LOGO} strokeWidth={2.25} />,
    iconBg: "#00E599",
    iconColor: "var(--oh-surface-deep)",
    keywords: ["database", "postgres", "serverless"],
    template: {
      kind: "stdio",
      serverName: "neon",
      command: "npx",
      args: ["-y", "@neondatabase/mcp-server-neon", "start"],
      envFields: [
        {
          key: "NEON_API_KEY",
          label: "Neon API key",
          type: "password",
          required: true,
        },
      ],
    },
  },
  {
    id: "mongodb",
    name: "MongoDB",
    description:
      "Query MongoDB collections, inspect schemas, and run aggregation pipelines.",
    docsUrl: "https://www.mongodb.com/docs/mcp-server/",
    logo: <SiMongodb className={LOGO} />,
    iconBg: "#00684A",
    keywords: ["database", "nosql", "atlas"],
    template: {
      kind: "stdio",
      serverName: "mongodb",
      command: "npx",
      args: ["-y", "mongodb-mcp-server"],
      envFields: [
        {
          key: "MDB_MCP_CONNECTION_STRING",
          label: "MongoDB connection string",
          type: "password",
          placeholder: "mongodb+srv://user:pass@cluster.mongodb.net",
          required: true,
        },
      ],
    },
  },
  {
    id: "redis",
    name: "Redis",
    description:
      "Get, set, scan, and inspect data on a Redis or Redis-compatible instance.",
    docsUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/redis",
    logo: <SiRedis className={LOGO} />,
    iconBg: "#DC382D",
    availability: "local",
    keywords: ["cache", "kv", "database"],
    template: {
      kind: "stdio",
      serverName: "redis",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-redis"],
      argFields: [
        {
          key: "redis_url",
          label: "Redis URL",
          type: "password",
          placeholder: "redis://localhost:6379",
          required: true,
          helperText: "Passed as a single positional argument.",
        },
      ],
    },
  },
  {
    id: "sqlite",
    name: "SQLite",
    description:
      "Open a SQLite database file and run queries, schema dumps, and explorations.",
    docsUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/sqlite",
    logo: <SiSqlite className={LOGO} />,
    iconBg: "#003B57",
    availability: "local",
    keywords: ["database", "sql", "local"],
    template: {
      kind: "stdio",
      serverName: "sqlite",
      command: "uvx",
      // `--db-path` is the flag the official mcp-server-sqlite expects
      // before the user-supplied path; keeping it on the base command
      // means the modal can concatenate the path verbatim.
      args: ["mcp-server-sqlite", "--db-path"],
      argFields: [
        {
          key: "db_path",
          label: "Database file path",
          type: "text",
          placeholder: "/Users/me/my.db",
          required: true,
          helperText: "Appended as --db-path <path>.",
        },
      ],
    },
  },

  // -- Agent toolbelt --------------------------------------------------
  {
    id: "filesystem",
    name: "Filesystem",
    description:
      "Give the agent secure, scoped filesystem access outside the workspace.",
    docsUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem",
    logo: <Folder className={LOGO} strokeWidth={2.25} />,
    iconBg: "var(--oh-interactive-hover)",
    availability: "local",
    keywords: ["files", "local", "disk"],
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
  {
    id: "memory",
    name: "Memory",
    description:
      "Persistent key-value memory for the agent across conversations.",
    docsUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/memory",
    logo: <Brain className={LOGO} strokeWidth={2.25} />,
    iconBg: "#7C3AED",
    keywords: ["memory", "kv", "state", "persistence"],
    template: {
      kind: "stdio",
      serverName: "memory",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-memory"],
    },
  },
  {
    id: "sequential-thinking",
    name: "Sequential Thinking",
    description:
      "Lets the agent emit and revise a chain of structured thoughts.",
    docsUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking",
    logo: <ListTree className={LOGO} strokeWidth={2.25} />,
    iconBg: "var(--oh-color-base)",
    keywords: ["reasoning", "planning", "thoughts"],
    template: {
      kind: "stdio",
      serverName: "sequential_thinking",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
    },
  },
  {
    id: "time",
    name: "Time",
    description:
      "Timezone-aware current time, conversions, and timestamp formatting.",
    docsUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/time",
    logo: <Clock className={LOGO} strokeWidth={2.25} />,
    iconBg: "var(--oh-surface)",
    keywords: ["clock", "timezone", "date"],
    template: {
      kind: "stdio",
      serverName: "time",
      command: "uvx",
      args: ["mcp-server-time"],
    },
  },
  {
    id: "everart",
    name: "EverArt",
    description: "Generate AI images via EverArt's image models.",
    docsUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/everart",
    logo: <ImageIcon className={LOGO} strokeWidth={2.25} />,
    iconBg: "#EC4899",
    keywords: ["image", "ai", "generation"],
    template: {
      kind: "stdio",
      serverName: "everart",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-everart"],
      envFields: [
        {
          key: "EVERART_API_KEY",
          label: "EverArt API key",
          type: "password",
          required: true,
        },
      ],
    },
  },
  {
    id: "everything",
    name: "Everything (demo)",
    description:
      "Reference server exercising every MCP capability — useful for testing.",
    docsUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/everything",
    logo: <Sparkles className={LOGO} strokeWidth={2.25} />,
    iconBg: "#6366F1",
    keywords: ["demo", "test", "reference"],
    template: {
      kind: "stdio",
      serverName: "everything",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-everything"],
    },
  },
  {
    id: "aws-kb",
    name: "AWS Knowledge Base",
    description:
      "Retrieval-augmented search against AWS Bedrock knowledge bases.",
    docsUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/aws-kb-retrieval-server",
    logo: <BookOpen className={LOGO} strokeWidth={2.25} />,
    iconBg: "#FF9900",
    iconColor: "var(--oh-surface-deep)",
    keywords: ["aws", "bedrock", "rag", "knowledge"],
    template: {
      kind: "stdio",
      serverName: "aws_kb_retrieval",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-aws-kb-retrieval"],
      envFields: [
        {
          key: "AWS_ACCESS_KEY_ID",
          label: "AWS access key ID",
          type: "password",
          required: true,
        },
        {
          key: "AWS_SECRET_ACCESS_KEY",
          label: "AWS secret access key",
          type: "password",
          required: true,
        },
        {
          key: "AWS_REGION",
          label: "AWS region",
          type: "text",
          placeholder: "us-east-1",
          required: true,
        },
      ],
    },
  },

  // -- Productivity / design / media -----------------------------------
  {
    id: "figma",
    name: "Figma",
    description:
      "Read Figma frames, components, and styles to ground UI work in your designs.",
    docsUrl: "https://github.com/GLips/Figma-Context-MCP",
    logo: <SiFigma className={LOGO} />,
    iconBg: "var(--oh-surface)",
    keywords: ["design", "ui", "frames", "components"],
    template: {
      kind: "stdio",
      serverName: "figma",
      command: "npx",
      args: ["-y", "figma-developer-mcp", "--stdio"],
      envFields: [
        {
          key: "FIGMA_API_KEY",
          label: "Figma personal access token",
          type: "password",
          required: true,
        },
      ],
    },
  },
  {
    id: "airtable",
    name: "Airtable",
    description:
      "List bases, query records, and update fields across your Airtable workspace.",
    docsUrl: "https://github.com/domdomegg/airtable-mcp-server",
    logo: <SiAirtable className={LOGO} />,
    iconBg: "#FCB400",
    iconColor: "var(--oh-surface-deep)",
    keywords: ["spreadsheet", "database", "records", "bases"],
    template: {
      kind: "stdio",
      serverName: "airtable",
      command: "npx",
      args: ["-y", "airtable-mcp-server"],
      envFields: [
        {
          key: "AIRTABLE_API_KEY",
          label: "Airtable personal access token",
          type: "password",
          required: true,
        },
      ],
    },
  },
  {
    id: "obsidian",
    name: "Obsidian",
    description:
      "Read and edit Markdown notes inside an Obsidian vault on the local disk.",
    docsUrl: "https://github.com/MarkusPfundstein/mcp-obsidian",
    logo: <SiObsidian className={LOGO} />,
    iconBg: "#7C3AED",
    availability: "local",
    keywords: ["notes", "knowledge", "markdown", "vault"],
    template: {
      kind: "stdio",
      serverName: "obsidian",
      command: "uvx",
      args: ["mcp-obsidian"],
      envFields: [
        {
          key: "OBSIDIAN_API_KEY",
          label: "Local REST API key",
          type: "password",
          required: true,
          helperText: "From the Obsidian 'Local REST API' community plugin.",
        },
      ],
    },
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs",
    description:
      "Generate speech, clone voices, and transcribe audio via ElevenLabs.",
    docsUrl: "https://elevenlabs.io/docs/api-reference/mcp",
    logo: <SiElevenlabs className={LOGO} />,
    iconBg: "var(--oh-color-base)",
    keywords: ["tts", "speech", "voice", "audio"],
    template: {
      kind: "stdio",
      serverName: "elevenlabs",
      command: "uvx",
      args: ["elevenlabs-mcp"],
      envFields: [
        {
          key: "ELEVENLABS_API_KEY",
          label: "ElevenLabs API key",
          type: "password",
          required: true,
        },
      ],
    },
  },
  {
    id: "resend",
    name: "Resend",
    description: "Send transactional and marketing emails via the Resend API.",
    docsUrl: "https://resend.com/docs/send-with-mcp",
    logo: <SiResend className={LOGO} />,
    iconBg: "var(--oh-surface-deep)",
    keywords: ["email", "transactional", "smtp"],
    template: {
      kind: "stdio",
      serverName: "resend",
      command: "npx",
      args: ["-y", "mcp-send-email"],
      envFields: [
        {
          key: "RESEND_API_KEY",
          label: "Resend API key",
          type: "password",
          required: true,
        },
        {
          key: "SENDER_EMAIL_ADDRESS",
          label: "From address",
          type: "text",
          placeholder: "you@example.com",
          required: true,
        },
      ],
    },
  },
  {
    id: "cloudflare-builds",
    name: "Cloudflare Builds",
    description:
      "Inspect Workers Builds — logs, statuses, and rerun failed deploys.",
    docsUrl: "https://developers.cloudflare.com/agents/model-context-protocol/",
    logo: <SiCloudflare className={LOGO} />,
    iconBg: "#F38020",
    keywords: ["cloudflare", "workers", "ci", "builds", "deploys"],
    template: {
      kind: "sse",
      url: "https://builds.mcp.cloudflare.com/sse",
      apiKeyOptional: true,
    },
  },
  {
    id: "cloudflare-browser-rendering",
    name: "Cloudflare Browser Rendering",
    description:
      "Fetch and screenshot pages using Cloudflare's hosted browser rendering.",
    docsUrl: "https://developers.cloudflare.com/agents/model-context-protocol/",
    logo: <SiCloudflare className={LOGO} />,
    iconBg: "#F38020",
    keywords: ["cloudflare", "browser", "rendering", "screenshots"],
    template: {
      kind: "sse",
      url: "https://browser.mcp.cloudflare.com/sse",
      apiKeyOptional: true,
    },
  },
  {
    id: "kagi",
    name: "Kagi Search",
    description:
      "Paid, privacy-first search with high signal-to-noise — great for research.",
    docsUrl: "https://help.kagi.com/kagi/api/mcp.html",
    logo: <SiKagi className={LOGO} />,
    iconBg: "#FFB319",
    iconColor: "var(--oh-surface-deep)",
    keywords: ["search", "web", "privacy"],
    template: {
      kind: "stdio",
      serverName: "kagi",
      command: "uvx",
      args: ["kagimcp"],
      envFields: [
        {
          key: "KAGI_API_KEY",
          label: "Kagi API key",
          type: "password",
          required: true,
        },
      ],
    },
  },
  {
    id: "clickhouse",
    name: "ClickHouse",
    description: "Run analytical SQL queries against a ClickHouse cluster.",
    docsUrl: "https://github.com/ClickHouse/mcp-clickhouse",
    logo: <SiClickhouse className={LOGO} />,
    iconBg: "#FFFF00",
    iconColor: "var(--oh-surface-deep)",
    keywords: ["analytics", "olap", "database", "sql"],
    template: {
      kind: "stdio",
      serverName: "clickhouse",
      command: "uvx",
      args: ["mcp-clickhouse"],
      envFields: [
        {
          key: "CLICKHOUSE_HOST",
          label: "Host",
          type: "text",
          placeholder: "clickhouse.example.com",
          required: true,
        },
        {
          key: "CLICKHOUSE_USER",
          label: "Username",
          type: "text",
          required: true,
        },
        {
          key: "CLICKHOUSE_PASSWORD",
          label: "Password",
          type: "password",
          required: true,
        },
      ],
    },
  },
  {
    id: "mattermost",
    name: "Mattermost",
    description: "Post and read messages in self-hosted Mattermost workspaces.",
    docsUrl: "https://github.com/EvilFreelancer/mattermost-mcp-server",
    logo: <SiMattermost className={LOGO} />,
    iconBg: "#0058CC",
    keywords: ["chat", "messaging", "team", "open source"],
    template: {
      kind: "stdio",
      serverName: "mattermost",
      command: "npx",
      args: ["-y", "mattermost-mcp-server"],
      envFields: [
        {
          key: "MATTERMOST_URL",
          label: "Server URL",
          type: "text",
          placeholder: "https://mattermost.example.com",
          required: true,
        },
        {
          key: "MATTERMOST_TOKEN",
          label: "Personal access token",
          type: "password",
          required: true,
        },
      ],
    },
  },
];
