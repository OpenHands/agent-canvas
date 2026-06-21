import { AgentProfilesManager } from "#/components/features/settings/agent-profiles";

/**
 * Settings → Agent profiles. The kind-aware AgentProfile library + editor
 * (#3726). The page header (title/subtitle) is rendered by `settings.tsx` from
 * the nav item; the manager collapses it while its editor is open.
 */
export default function AgentProfilesSettingsRoute() {
  return <AgentProfilesManager />;
}
