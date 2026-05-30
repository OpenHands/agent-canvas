import { useActiveBackend } from "#/contexts/active-backend-context";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useSettings } from "#/hooks/query/use-settings";
import { useAcpModelContext } from "#/hooks/use-acp-model-context";
import { useOptionalConversationId } from "#/hooks/use-conversation-id";
import {
  getAcpProvider,
  labelForAcpModel,
  resolveEffectiveAcpModel,
  type ACPModelOption,
} from "#/constants/acp-providers";

export interface ChatInputModelState {
  isAcpContext: boolean;
  displayModel: string | null;
  currentModelId: string | null;
  availableAcpModels: ACPModelOption[];
  showAcpPicker: boolean;
  switchConversationId: string | null;
  destinationPath: "/settings/agent" | "/settings";
  destinationLabel: string;
}

export function useChatInputModelState(): ChatInputModelState {
  const { data: conversation } = useActiveConversation();
  const { data: settings } = useSettings();
  const { backend } = useActiveBackend();
  const { conversationId } = useOptionalConversationId();
  const {
    isActiveAcpConversation,
    isHomeAcp,
    isAcpContext,
    destinationPath,
    destinationLabel,
  } = useAcpModelContext();

  const acpServerKey = isActiveAcpConversation
    ? conversation?.acp_server
    : isHomeAcp
      ? typeof settings?.agent_settings?.acp_server === "string"
        ? settings.agent_settings.acp_server
        : null
      : null;
  const acpProvider = isAcpContext ? getAcpProvider(acpServerKey) : undefined;

  let currentModelId: string | null = null;
  if (isActiveAcpConversation) {
    currentModelId = conversation?.llm_model ?? null;
  } else if (isHomeAcp) {
    currentModelId = resolveEffectiveAcpModel({
      configured:
        typeof settings?.agent_settings?.acp_model === "string"
          ? settings.agent_settings.acp_model
          : null,
      providerDefault: acpProvider?.default_model,
    });
  } else {
    currentModelId = conversation?.llm_model ?? settings?.llm_model ?? null;
  }

  const displayModel =
    currentModelId && isAcpContext
      ? (labelForAcpModel(acpServerKey, currentModelId) ?? currentModelId)
      : currentModelId;
  const availableAcpModels = acpProvider?.available_models ?? [];
  const showAcpPicker =
    isAcpContext && backend.kind !== "cloud" && availableAcpModels.length > 0;
  const switchConversationId = isActiveAcpConversation
    ? (conversationId ?? null)
    : null;

  return {
    isAcpContext,
    displayModel,
    currentModelId,
    availableAcpModels,
    showAcpPicker,
    switchConversationId,
    destinationPath,
    destinationLabel,
  };
}
