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
    // The Agents hub: the profile library + the catalogs it composes, all
    // nested so they share the one hub nav (no per-page sub-sidebar).
    route("agents", "routes/agents-hub.tsx", [
      // Mobile shows a navigable hub landing; desktop drops into Profiles.
      index("routes/agents-index.tsx"),
      route("profiles", "routes/agent-profiles-settings.tsx"),
      route("llm", "routes/llm-settings.tsx", { id: "agents-llm" }),
      route("mcp", "routes/mcp.tsx", { id: "agents-mcp" }),
      route("skills", "routes/skills-settings.tsx", { id: "agents-skills" }),
      route("plugins", "routes/skills-plugins.tsx", { id: "agents-plugins" }),
      // Verification / critic is a global service config (endpoint + model +
      // API key), so it's a hub building block editing global agent_settings —
      // not a per-profile knob (the profile model is secret-free). #1456.
      route("verification", "routes/verification-settings.tsx", {
        id: "agents-verification",
      }),
      route("secrets", "routes/secrets-settings.tsx", { id: "agents-secrets" }),
    ]),
    // Application prefs — a top-level rail destination (the "Settings" hub was
    // dissolved; see #1456).
    route("application", "routes/application.tsx"),
    // The global agent page is folded out of the nav but kept reachable: the
    // conversation-launch path still reads global agent_settings, and the
    // mock-LLM ACP e2e drives it directly.
    route("settings/agent", "routes/agent-settings.tsx", {
      id: "global-agent-settings",
    }),
    // Legacy settings paths → their new homes (catalogs moved to the hub;
    // behavior pages folded into the profile editor; Application is top-level).
    route("settings", "routes/legacy-redirect.tsx", {
      id: "redirect-settings",
    }),
    route("settings/app", "routes/legacy-redirect.tsx", {
      id: "redirect-settings-app",
    }),
    route("settings/llm", "routes/legacy-redirect.tsx", {
      id: "redirect-settings-llm",
    }),
    route("settings/agents", "routes/legacy-redirect.tsx", {
      id: "redirect-settings-agents",
    }),
    route("settings/condenser", "routes/legacy-redirect.tsx", {
      id: "redirect-settings-condenser",
    }),
    route("settings/verification", "routes/legacy-redirect.tsx", {
      id: "redirect-settings-verification",
    }),
    route("settings/secrets", "routes/legacy-redirect.tsx", {
      id: "redirect-settings-secrets",
    }),
    route("oauth/device/verify", "routes/device-verify.tsx"),
    route("automations", "routes/automations-list.tsx"),
    route("automations/:automationId", "routes/automation-detail.tsx"),
  ]),
  route(
    "shared/conversations/:conversationId",
    "routes/shared-conversation.tsx",
  ),
] satisfies RouteConfig;
