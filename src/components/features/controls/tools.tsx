import React from "react";
import { Wrench } from "lucide-react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { useConversationId } from "#/hooks/use-conversation-id";
import ChevronDownSmallIcon from "#/icons/chevron-down-small.svg?react";
import { ToolsContextMenu } from "./tools-context-menu";
import { useConversationNameContextMenu } from "#/hooks/use-conversation-name-context-menu";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { SystemMessageModal } from "../conversation-panel/system-message-modal";
import { SkillsModal } from "../conversation-panel/skills-modal";
import { HooksModal } from "../conversation-panel/hooks-modal";

export function Tools() {
  const { t } = useTranslation("openhands");
  const { conversationId } = useConversationId();
  const { data: conversation } = useActiveConversation();
  const [contextMenuOpen, setContextMenuOpen] = React.useState(false);

  const {
    handleShowAgentTools,
    handleShowSkills,
    handleShowHooks,
    systemModalVisible,
    setSystemModalVisible,
    skillsModalVisible,
    setSkillsModalVisible,
    hooksModalVisible,
    setHooksModalVisible,
    systemMessage,
    shouldShowAgentTools,
    shouldShowHooks,
  } = useConversationNameContextMenu({
    conversationId,
    executionStatus: conversation?.execution_status,
    showOptions: true,
    onContextMenuToggle: setContextMenuOpen,
  });

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenuOpen(!contextMenuOpen);
  };

  return (
    <div className="relative">
      <button
        type="button"
        className="group flex items-center gap-1 rounded-[100px] border border-transparent px-1.5 text-[#959CB2] transition-[border-color,color] cursor-pointer hover:text-white hover:bg-white/10"
        onClick={handleClick}
      >
        <Wrench
          className="h-[13px] w-[13px] shrink-0"
          strokeWidth={2}
          aria-hidden="true"
        />
        <span className="text-sm font-normal leading-5">
          {t(I18nKey.MICROAGENTS_MODAL$TOOLS)}
        </span>
        <ChevronDownSmallIcon
          width={18}
          height={18}
          color="currentColor"
          aria-hidden
        />
      </button>
      {contextMenuOpen && (
        <ToolsContextMenu
          onClose={() => setContextMenuOpen(false)}
          onShowSkills={handleShowSkills}
          onShowHooks={handleShowHooks}
          onShowAgentTools={handleShowAgentTools}
          shouldShowAgentTools={shouldShowAgentTools}
          shouldShowHooks={shouldShowHooks}
        />
      )}

      {/* System Message Modal */}
      <SystemMessageModal
        isOpen={systemModalVisible}
        onClose={() => setSystemModalVisible(false)}
        systemMessage={systemMessage || null}
      />

      {/* Skills Modal */}
      {skillsModalVisible && (
        <SkillsModal onClose={() => setSkillsModalVisible(false)} />
      )}

      {/* Hooks Modal */}
      {hooksModalVisible && (
        <HooksModal onClose={() => setHooksModalVisible(false)} />
      )}
    </div>
  );
}
