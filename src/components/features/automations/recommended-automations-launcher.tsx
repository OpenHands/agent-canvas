import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useNavigation } from "#/context/navigation-context";
import { useCreateConversation } from "#/hooks/mutation/use-create-conversation";
import { useSettings } from "#/hooks/query/use-settings";
import { useAutomationHealth } from "#/hooks/query/use-automation-health";
import { useIsCreatingConversation } from "#/hooks/use-is-creating-conversation";
import { displayErrorToast } from "#/utils/custom-toast-handlers";
import { I18nKey } from "#/i18n/declaration";
import type { RecommendedAutomation } from "@openhands/extensions/automations";
import { parseMcpConfig } from "#/utils/mcp-config";
import { flattenMcpConfig } from "#/utils/mcp-installed-servers";
import {
  INTEGRATION_CATALOG as MCP_MARKETPLACE,
  type IntegrationCatalogEntry as MarketplaceEntry,
} from "@openhands/extensions/integrations";
import {
  findInstalledEntryMatch,
  getMarketplaceEntryById,
  getMcpMarketplaceCatalog,
} from "#/utils/mcp-marketplace-utils";
import { InstallServerModal } from "#/components/features/mcp-page/install-server-modal";
import { RecommendedAutomationsSection } from "./recommended-automations-section";

interface RecommendedAutomationsLauncherProps {
  query?: string;
  onLaunched?: () => void;
}

function getRequiredEntries(automation: RecommendedAutomation) {
  const mcpMarketplace = getMcpMarketplaceCatalog(MCP_MARKETPLACE);
  return automation.requiredIntegrationIds
    .map((id) => getMarketplaceEntryById(id, mcpMarketplace))
    .filter((entry): entry is MarketplaceEntry => !!entry);
}

/**
 * Returns a concise slash-command style trigger for launching a prebuilt
 * automation. The agent receives routing details from the <RUNTIME_SERVICES>
 * block already present in its system context — no implementation scaffolding
 * is injected into the user-visible chat message.
 */
export function buildAutomationSlashCommand(id: string): string {
  return `/create-${id}`;
}

export function RecommendedAutomationsLauncher({
  query,
  onLaunched,
}: RecommendedAutomationsLauncherProps) {
  const activeBackend = useActiveBackend();
  const { t } = useTranslation("openhands");
  const { navigate } = useNavigation();
  const { data: settings } = useSettings();
  const { data: healthData } = useAutomationHealth();
  const createConversation = useCreateConversation();
  const isCreatingConversation = useIsCreatingConversation();
  const [pendingAutomation, setPendingAutomation] =
    useState<RecommendedAutomation | null>(null);
  const [installQueue, setInstallQueue] = useState<MarketplaceEntry[]>([]);
  const completedInstallRef = useRef(false);
  const launchInFlightRef = useRef(false);

  const installedMcpServers = useMemo(
    () =>
      flattenMcpConfig(parseMcpConfig(settings?.agent_settings?.mcp_config)),
    [settings?.agent_settings?.mcp_config],
  );

  const launchAutomation = useCallback(
    (automation: RecommendedAutomation) => {
      if (
        launchInFlightRef.current ||
        createConversation.isPending ||
        isCreatingConversation
      ) {
        return;
      }

      if (healthData?.status === "error") {
        displayErrorToast(
          t(I18nKey.RECOMMENDED_AUTOMATIONS$BACKEND_UNAVAILABLE),
        );
        return;
      }

      launchInFlightRef.current = true;

      // Pass the slash command as the initial query so it is submitted to the
      // agent immediately when the conversation opens — no draft pre-fill needed.
      const query = buildAutomationSlashCommand(automation.id);

      createConversation.mutate(
        { query },
        {
          onSuccess: (conversation) => {
            onLaunched?.();
            navigate?.(`/conversations/${conversation.conversation_id}`);
          },
          onError: () => {
            launchInFlightRef.current = false;
          },
        },
      );
    },
    [
      createConversation,
      healthData?.status,
      isCreatingConversation,
      navigate,
      onLaunched,
      t,
    ],
  );

  const getMissingEntries = useCallback(
    (automation: RecommendedAutomation) =>
      getRequiredEntries(automation).filter(
        (entry) => !findInstalledEntryMatch(entry, installedMcpServers),
      ),
    [installedMcpServers],
  );

  const handleSelectAutomation = (automation: RecommendedAutomation) => {
    if (
      launchInFlightRef.current ||
      createConversation.isPending ||
      isCreatingConversation ||
      installQueue.length > 0
    ) {
      return;
    }

    const missingEntries = getMissingEntries(automation);
    if (missingEntries.length === 0) {
      launchAutomation(automation);
      return;
    }

    setPendingAutomation(automation);
    setInstallQueue(missingEntries);
  };

  const cancelInstallFlow = () => {
    if (completedInstallRef.current) {
      completedInstallRef.current = false;
      return;
    }
    setPendingAutomation(null);
    setInstallQueue([]);
  };

  const handleInstallSuccess = () => {
    completedInstallRef.current = true;

    setInstallQueue((currentQueue) => {
      const nextQueue = currentQueue.slice(1);

      if (nextQueue.length === 0) {
        const automation = pendingAutomation;
        window.setTimeout(() => {
          setPendingAutomation(null);
          if (automation) launchAutomation(automation);
        }, 0);
      }

      return nextQueue;
    });
  };

  const installEntry = installQueue[0] ?? null;

  // Recommended automations are a local-backend-only feature; cloud
  // automations are managed elsewhere.
  if (activeBackend.backend.kind === "cloud") return null;

  return (
    <>
      <RecommendedAutomationsSection
        backendKind={activeBackend.backend.kind}
        installedServers={installedMcpServers}
        query={query}
        onSelect={handleSelectAutomation}
      />

      {installEntry && (
        <InstallServerModal
          key={installEntry.id}
          entry={installEntry}
          onClose={cancelInstallFlow}
          onSuccess={handleInstallSuccess}
        />
      )}
    </>
  );
}
