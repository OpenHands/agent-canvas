import {
  type RouteConfig,
  layout,
  index,
  route,
} from "@react-router/dev/routes";

export default [
  layout("routes/root-layout.tsx", [
    index("routes/index-redirect.tsx"),
    route("conversations", "routes/home.tsx"),
    route(
      "conversations/:conversationId/panel",
      "routes/conversation-panel.tsx",
    ),
    route("conversations/:conversationId", "routes/conversation.tsx"),
    route("launch", "routes/launch.tsx"),
    // Legacy catalog paths → Agents hub (#1456). Kept so old links/bookmarks
    // resolve instead of 404ing.
    route("customize", "routes/legacy-redirect.tsx", {
      id: "redirect-customize",
    }),
    route("skills", "routes/legacy-redirect.tsx", { id: "redirect-skills" }),
    route("plugins", "routes/legacy-redirect.tsx", { id: "redirect-plugins" }),
    route("mcp", "routes/legacy-redirect.tsx", { id: "redirect-mcp" }),
    // The Agents hub: the profile library + the content-style building-block
    // pages, reusing the existing page modules under a single hub nav.
    route("agents", "routes/agents-hub.tsx", [
      index("routes/legacy-redirect.tsx", { id: "agents-index" }),
      route("profiles", "routes/agent-profiles-settings.tsx"),
      route("llm", "routes/llm-settings.tsx", { id: "agents-llm" }),
      route("secrets", "routes/secrets-settings.tsx", { id: "agents-secrets" }),
    ]),
    // Catalog pages bring their own ExtensionsNavigation full-page layout, so
    // they sit beside the hub (not nested) to avoid a double sidebar.
    route("agents/mcp", "routes/mcp.tsx", { id: "agents-mcp" }),
    route("agents/skills", "routes/skills-settings.tsx", {
      id: "agents-skills",
    }),
    route("agents/plugins", "routes/skills-plugins.tsx", {
      id: "agents-plugins",
    }),
    route("settings", "routes/settings.tsx", [
      index("routes/settings-index.tsx"),
      route("app", "routes/app-settings.tsx"),
      // Pages that moved into the Agents hub / were folded into the profile
      // editor — redirect rather than 404.
      route("llm", "routes/legacy-redirect.tsx", {
        id: "redirect-settings-llm",
      }),
      route("agent", "routes/legacy-redirect.tsx", {
        id: "redirect-settings-agent",
      }),
      route("agents", "routes/legacy-redirect.tsx", {
        id: "redirect-settings-agents",
      }),
      route("condenser", "routes/legacy-redirect.tsx", {
        id: "redirect-settings-condenser",
      }),
      route("verification", "routes/legacy-redirect.tsx", {
        id: "redirect-settings-verification",
      }),
      route("secrets", "routes/legacy-redirect.tsx", {
        id: "redirect-settings-secrets",
      }),
    ]),
    route("oauth/device/verify", "routes/device-verify.tsx"),
    route("automations", "routes/automations-list.tsx"),
    route("automations/:automationId", "routes/automation-detail.tsx"),
  ]),
  route(
    "shared/conversations/:conversationId",
    "routes/shared-conversation.tsx",
  ),
] satisfies RouteConfig;
