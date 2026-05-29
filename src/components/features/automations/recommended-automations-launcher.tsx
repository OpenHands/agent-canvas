import { useCallback, useMemo, useRef, useState } from "react";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useNavigation } from "#/context/navigation-context";
import { useCreateConversation } from "#/hooks/mutation/use-create-conversation";
import { useSettings } from "#/hooks/query/use-settings";
import { useIsCreatingConversation } from "#/hooks/use-is-creating-conversation";
import { useConversationStore } from "#/stores/conversation-store";
import {
  setConversationState,
  setPendingTaskDraft,
} from "#/utils/conversation-local-storage";
import type { RecommendedAutomation } from "@openhands/extensions/automations";
import { parseMcpConfig } from "#/utils/mcp-config";
import { flattenMcpConfig } from "#/utils/mcp-installed-servers";
import {
  INTEGRATION_CATALOG as INTEGRATION_MARKETPLACE,
  type IntegrationCatalogEntry as MarketplaceEntry,
} from "@openhands/extensions/integrations";
import {
  findInstalledMatch,
  getInstallableTemplate,
  getMarketplaceEntryById,
} from "#/utils/mcp-marketplace-utils";
import { InstallServerModal } from "#/components/features/mcp-page/install-server-modal";
import { RecommendedAutomationsSection } from "./recommended-automations-section";

interface RecommendedAutomationsLauncherProps {
  query?: string;
  onLaunched?: () => void;
}

function getRequiredEntries(automation: RecommendedAutomation) {
  return automation.requiredIntegrationIds
    .map((id) => getMarketplaceEntryById(id, INTEGRATION_MARKETPLACE))
    .filter((entry): entry is MarketplaceEntry => !!entry);
}

/**
 * Augment the catalog prompt with explicit API instructions so the agent
 * calls the correct automation endpoint instead of guessing (e.g. calling
 * the cloud API when running locally, or vice-versa).
 */
function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

export function buildAutomationPrompt(
  basePrompt: string,
  backendKind: "local" | "cloud",
  backendHost?: string,
): string {
  if (backendKind === "cloud") {
    const endpoint = backendHost
      ? `POST ${trimTrailingSlashes(backendHost)}/api/automation/v1/preset/prompt`
      : "POST /api/automation/v1/preset/prompt on the active OpenHands Cloud backend";

    return [
      basePrompt,
      "",
      "---",
      "**Which API to use:** Create this automation using the active OpenHands Cloud Automations API.",
      `- Endpoint: \`${endpoint}\``,
      "- Auth: `Authorization: Bearer $OPENHANDS_API_KEY`",
    ].join("\n");
  }

  // Local backend — the automation sidecar URL is in <RUNTIME_SERVICES>.
  return [
    basePrompt,
    "",
    "---",
    "**Which API to use:** Create this automation using the **local** OpenHands Automations API that is running alongside this agent.",
    "- Read the Automation backend URL from the `<RUNTIME_SERVICES>` block in your system context.",
    "- Endpoint path: `POST /api/automation/v1/preset/prompt`",
    "- Auth: `X-API-Key: $OPENHANDS_AUTOMATION_API_KEY`",
    "- If no local Automation backend is listed in `<RUNTIME_SERVICES>`, stop and ask me to start the full local automation stack instead of using any remote/cloud automation API.",
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
  const isCreatingConversation = useIsCreatingConversation();
  const setMessageToSend = useConversationStore(
    (state) => state.setMessageToSend,
  );
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
      launchInFlightRef.current = true;

      const prompt = buildAutomationPrompt(
        automation.prompt,
        activeBackend.backend.kind,
        activeBackend.backend.host,
      );

      createConversation.mutate(
        {},
        {
          onSuccess: (conversation) => {
            if (
              conversation.conversation_id.startsWith("task-") &&
              conversation.task_id
            ) {
              setPendingTaskDraft(conversation.task_id, prompt);
            } else {
              setConversationState(conversation.conversation_id, {
                draftMessage: prompt,
              });
            }
            onLaunched?.();
            navigate?.(`/conversations/${conversation.conversation_id}`);
            window.setTimeout(() => setMessageToSend(prompt), 0);
          },
          onError: () => {
            launchInFlightRef.current = false;
          },
        },
      );
    },
    [
      activeBackend.backend.kind,
      createConversation,
      isCreatingConversation,
      navigate,
      onLaunched,
      setMessageToSend,
    ],
  );

  const getMissingEntries = useCallback(
    (automation: RecommendedAutomation) =>
      getRequiredEntries(automation).filter((entry) => {
        const template = getInstallableTemplate(entry);
        return !template || !findInstalledMatch(template, installedMcpServers);
      }),
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
