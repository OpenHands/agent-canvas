import { redirect } from "react-router";

/**
 * Single redirect module for the pre-Agents-hub URLs (#1456). The catalogs and
 * the profile library moved under `/agents/*`, and the per-profile editor
 * absorbed the standalone agent/condenser/verification pages — old links and
 * bookmarks resolve here and bounce to the new home.
 */
const REDIRECTS: Record<string, string> = {
  "/customize": "/agents",
  "/skills": "/agents/skills",
  "/plugins": "/agents/plugins",
  "/mcp": "/agents/mcp",
  "/settings/llm": "/agents/llm",
  "/settings/secrets": "/agents/secrets",
  "/settings/agents": "/agents/profiles",
  // The "Settings" hub was dissolved; Application is now a top-level rail item.
  "/settings": "/application",
  "/settings/app": "/application",
  // Behavior pages folded into the profile editor. (`/settings/agent` stays a
  // real, nav-less route — the launch path + ACP e2e still use it.)
  "/settings/condenser": "/agents/profiles",
  "/settings/verification": "/agents/profiles",
};

export const clientLoader = ({ request }: { request: Request }) => {
  const { pathname } = new URL(request.url);
  throw redirect(REDIRECTS[pathname] ?? "/agents");
};

export default function LegacyRedirect() {
  return null;
}
