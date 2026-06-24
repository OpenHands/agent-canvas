import { Navigate } from "react-router";
import { useBreakpoint } from "#/hooks/use-breakpoint";
import { useAgentsHubNavItems } from "#/hooks/use-agents-hub-nav-items";
import { AgentsMobileHub } from "#/components/features/settings/agents-mobile-hub";
import { getFirstAvailableAgentsPath } from "#/utils/settings-utils";

/**
 * The `/agents` index. On mobile the desktop section sidebar is hidden, so we
 * render a navigable hub landing; on desktop we drop straight into the first
 * available section (Profiles). Mirrors the former settings index.
 */
export default function AgentsIndex() {
  const isMobile = useBreakpoint(768);
  const navigationItems = useAgentsHubNavItems();

  if (isMobile) {
    return <AgentsMobileHub navigationItems={navigationItems} />;
  }

  return <Navigate to={getFirstAvailableAgentsPath()} replace />;
}
