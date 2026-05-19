import { useCallback, useMemo, useRef, useState } from "react";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useNavigation } from "#/context/navigation-context";
import { useCreateConversation } from "#/hooks/mutation/use-create-conversation";
import { useSettings } from "#/hooks/query/use-settings";
import { useConversationStore } from "#/stores/conversation-store";
import { setConversationState } from "#/utils/conversation-local-storage";
import type { RecommendedAutomation } from "@openhands/extensions/automations";
import { parseMcpConfig } from "#/utils/mcp-config";
import { flattenMcpConfig } from "#/utils/mcp-installed-servers";
import {
  MCP_CATALOG as MCP_MARKETPLACE,
  type McpCatalogEntry as MarketplaceEntry,
} from "@openhands/extensions/mcps";
import {
  findInstalledMatch,
  getMarketplaceEntryById,
} from "#/utils/mcp-marketplace-utils";
import { InstallServerModal } from "#/components/features/mcp-page/install-server-modal";
import { RecommendedAutomationsSection } from "./recommended-automations-section";

interface RecommendedAutomationsLauncherProps {
  query?: string;
  onLaunched?: () => void;
}

function getRequiredEntries(automation: RecommendedAutomation) {
  return automation.requiredMcpIds
    .map((id) => getMarketplaceEntryById(id, MCP_MARKETPLACE))
    .filter((entry): entry is MarketplaceEntry => !!entry);
}

/**
 * Augment the catalog prompt with explicit API instructions so the agent
 * calls the correct automation endpoint instead of guessing (e.g. calling
 * the cloud API when running locally, or vice-versa).
 */
export function buildAutomationPrompt(
  basePrompt: string,
  backendKind: "local" | "cloud",
): string {
  if (backendKind === "cloud") {
    return [
      basePrompt,
      "",
      "---",
      "**Which API to use:** Create this automation using the OpenHands Cloud Automations API.",
      "- Endpoint: `POST https://app.all-hands.dev/api/automation/v1/preset/prompt`",
      "- Auth: `Authorization: Bearer $OPENHANDS_API_KEY`",
    ].join("\n");
  }

  // Local backend — the automation sidecar URL is in <RUNTIME_SERVICES>.
  return [
    basePrompt,
    "",
    "---",
    "**Which API to use:** Create this automation using the **local** OpenHands Automations API that is running alongside this agent.",
    "- Use the Automation backend URL from the `<RUNTIME_SERVICES>` block in your system context.",
    "- Endpoint path: `POST /api/automation/v1/preset/prompt`",
    "- Auth: `X-API-Key: $OPENHANDS_AUTOMATION_API_KEY`",
    "- Do **not** call the OpenHands Cloud API at `app.all-hands.dev` — use only the local automation backend.",
  ].join("\n");
}

export function RecommendedAutomationsLauncher({
  query,
  onLaunched,
}: RecommendedAutomationsLauncherProps) {
  const activeBackend = useActiveBackend();
  const { navigate } = useNavigation();
  const { data: settings } = useSettings();
  const createConversation = useCreateConversation();
  const setMessageToSend = useConversationStore(
    (state) => state.setMessageToSend,
  );
  const [pendingAutomation, setPendingAutomation] =
    useState<RecommendedAutomation | null>(null);
  const [installQueue, setInstallQueue] = useState<MarketplaceEntry[]>([]);
  const completedInstallRef = useRef(false);

  const installedMcpServers = useMemo(
    () =>
      flattenMcpConfig(parseMcpConfig(settings?.agent_settings?.mcp_config)),
    [settings?.agent_settings?.mcp_config],
  );

  const launchAutomation = useCallback(
    (automation: RecommendedAutomation) => {
      if (createConversation.isPending) return;

      const prompt = buildAutomationPrompt(
        automation.prompt,
        activeBackend.backend.kind,
      );

      createConversation.mutate(
        {},
        {
          onSuccess: (conversation) => {
            setConversationState(conversation.conversation_id, {
              draftMessage: prompt,
            });
            onLaunched?.();
            navigate?.(`/conversations/${conversation.conversation_id}`);
            window.setTimeout(() => setMessageToSend(prompt), 0);
          },
        },
      );
    },
    [
      activeBackend.backend.kind,
      createConversation,
      navigate,
      onLaunched,
      setMessageToSend,
    ],
  );

  const getMissingEntries = useCallback(
    (automation: RecommendedAutomation) =>
      getRequiredEntries(automation).filter(
        (entry) => !findInstalledMatch(entry.template, installedMcpServers),
      ),
    [installedMcpServers],
  );

  const handleSelectAutomation = (automation: RecommendedAutomation) => {
    if (createConversation.isPending || installQueue.length > 0) return;

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
