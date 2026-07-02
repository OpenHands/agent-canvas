import { Navigate } from "react-router";
import { AgentProfilesManager } from "#/components/features/settings/agent-profiles";
import { useActiveBackend } from "#/contexts/active-backend-context";

/**
 * Settings → Agent profiles. The kind-aware AgentProfile library + editor
 * (#3726). The page header (title/subtitle) is rendered by `settings.tsx` from
 * the nav item; the manager collapses it while its editor is open.
 *
 * AgentProfiles are local-first: the cloud app-server has no /api/agent-profiles
 * surface yet (#3730). Cloud backends hide the nav item (see
 * `useSettingsNavItems`); guard the route too so a direct URL lands somewhere
 * real instead of rendering against a missing API.
 */
export default function AgentProfilesSettingsRoute() {
  const { backend } = useActiveBackend();
  if (backend.kind === "cloud") {
    return <Navigate to="/settings/agent" replace />;
  }
  return <AgentProfilesManager />;
}
