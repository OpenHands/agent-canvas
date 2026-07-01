import { Navigate } from "react-router";
import { AgentProfilesLocalView } from "#/components/features/settings/agent-profiles";
import { useActiveBackend } from "#/contexts/active-backend-context";

export const handle = { hideTitle: false };

/**
 * Settings → Agent profiles. A library of named agent setups, reusing the
 * existing Agent settings form as the editor. Local-backend only — the cloud
 * app-server has no `/api/agent-profiles` surface yet (epic #3730), so cloud
 * backends bounce to the standard Agent settings page.
 */
export default function AgentProfilesSettingsRoute() {
  const { backend } = useActiveBackend();

  if (backend.kind !== "local") {
    return <Navigate to="/settings/agent" replace />;
  }

  return <AgentProfilesLocalView />;
}
