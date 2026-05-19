import React from "react";
import { SdkSectionPage } from "#/components/features/settings/sdk-settings/sdk-section-page";
import { SettingsScope } from "#/types/settings";

export function VerificationSettingsScreen({
  scope = "personal",
  renderTopContent,
  testId = "verification-settings-screen",
}: {
  scope?: SettingsScope;
  renderTopContent?: () => React.ReactNode;
  testId?: string;
}) {
  const header = React.useMemo(
    () => (renderTopContent ? () => renderTopContent() : undefined),
    [renderTopContent],
  );

  return (
    <SdkSectionPage
      scope={scope}
      settingsSource="conversation_settings"
      sectionKeys={["verification"]}
      header={header}
      getInitialView={() => "advanced"}
      testId={testId}
    />
  );
}

export default VerificationSettingsScreen;
