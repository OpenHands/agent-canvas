import { useMemo } from "react";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useNavigation } from "#/context/navigation-context";
import { useCreateConversation } from "#/hooks/mutation/use-create-conversation";
import { useSettings } from "#/hooks/query/use-settings";
import { useConversationStore } from "#/stores/conversation-store";
import { setConversationState } from "#/utils/conversation-local-storage";
import type { RecommendedAutomation } from "#/constants/recommended-automations";
import { parseMcpConfig } from "#/utils/mcp-config";
import { flattenMcpConfig } from "#/utils/mcp-installed-servers";
import { RecommendedAutomationsSection } from "./recommended-automations-section";

interface RecommendedAutomationsLauncherProps {
  query?: string;
  onLaunched?: () => void;
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

  const installedMcpServers = useMemo(
    () =>
      flattenMcpConfig(parseMcpConfig(settings?.agent_settings?.mcp_config)),
    [settings?.agent_settings?.mcp_config],
  );

  const launchAutomation = (automation: RecommendedAutomation) => {
    if (createConversation.isPending) return;

    createConversation.mutate(
      {},
      {
        onSuccess: (conversation) => {
          setConversationState(conversation.conversation_id, {
            draftMessage: automation.prompt,
          });
          onLaunched?.();
          navigate?.(`/conversations/${conversation.conversation_id}`);
          window.setTimeout(() => setMessageToSend(automation.prompt), 0);
        },
      },
    );
  };

  return (
    <RecommendedAutomationsSection
      backendKind={activeBackend.backend.kind}
      installedServers={installedMcpServers}
      query={query}
      onSelect={launchAutomation}
    />
  );
}
