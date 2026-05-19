import { SdkSectionPage } from "#/components/features/settings/sdk-settings/sdk-section-page";

function AgentSettingsScreen() {
  return (
    <SdkSectionPage sectionKeys={["general"]} testId="agent-settings-screen" />
  );
}

export default AgentSettingsScreen;
