import { useMemo, useState } from "react";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useNavigation } from "#/context/navigation-context";
import { useCreateConversation } from "#/hooks/mutation/use-create-conversation";
import { useSettings } from "#/hooks/query/use-settings";
import type { RecommendedAutomation } from "#/constants/recommended-automations";
import { MCP_MARKETPLACE, MarketplaceEntry } from "#/constants/mcp-marketplace";
import { parseMcpConfig } from "#/utils/mcp-config";
import { flattenMcpConfig } from "#/utils/mcp-installed-servers";
import { getMarketplaceEntryById } from "#/utils/mcp-marketplace-utils";
import { InstallServerModal } from "#/components/features/mcp-page";
import { RecommendedAutomationsSection } from "./recommended-automations-section";
import { RecommendedAutomationSetupModal } from "./recommended-automation-setup-modal";

interface RecommendedAutomationsLauncherProps {
  query?: string;
  onLaunched?: () => void;
}

function getRequiredMarketplaceEntries(automation: RecommendedAutomation) {
  return automation.requiredMcpIds
    .map((id) => getMarketplaceEntryById(id, MCP_MARKETPLACE))
    .filter((entry): entry is MarketplaceEntry => !!entry);
}

export function RecommendedAutomationsLauncher({
  query,
  onLaunched,
}: RecommendedAutomationsLauncherProps) {
  const [selectedAutomation, setSelectedAutomation] =
    useState<RecommendedAutomation | null>(null);
  const [installEntry, setInstallEntry] = useState<MarketplaceEntry | null>(
    null,
  );

  const activeBackend = useActiveBackend();
  const { navigate } = useNavigation();
  const { data: settings, refetch: refetchSettings } = useSettings();
  const createConversation = useCreateConversation();

  const installedMcpServers = useMemo(
    () =>
      flattenMcpConfig(parseMcpConfig(settings?.agent_settings?.mcp_config)),
    [settings?.agent_settings?.mcp_config],
  );

  const selectedRequiredMcpEntries = useMemo(
    () =>
      selectedAutomation
        ? getRequiredMarketplaceEntries(selectedAutomation)
        : [],
    [selectedAutomation],
  );

  const handleLaunch = () => {
    if (!selectedAutomation) return;
    createConversation.mutate(
      { query: selectedAutomation.prompt },
      {
        onSuccess: (conversation) => {
          setSelectedAutomation(null);
          onLaunched?.();
          navigate?.(`/conversations/${conversation.conversation_id}`);
        },
      },
    );
  };

  return (
    <>
      <RecommendedAutomationsSection
        backendKind={activeBackend.backend.kind}
        installedServers={installedMcpServers}
        query={query}
        onSelect={setSelectedAutomation}
      />

      {selectedAutomation && (
        <RecommendedAutomationSetupModal
          automation={selectedAutomation}
          requiredEntries={selectedRequiredMcpEntries}
          installedServers={installedMcpServers}
          isLaunching={createConversation.isPending}
          onInstallMcp={setInstallEntry}
          onLaunch={handleLaunch}
          onClose={() => setSelectedAutomation(null)}
        />
      )}

      {installEntry && (
        <InstallServerModal
          entry={installEntry}
          onSuccess={() => void refetchSettings()}
          onClose={() => setInstallEntry(null)}
        />
      )}
    </>
  );
}
