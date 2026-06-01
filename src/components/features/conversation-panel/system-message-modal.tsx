import { useEffect, useState } from "react";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { ModalBody } from "#/components/shared/modals/modal-body";
import { SystemMessageHeader } from "./system-message-modal/system-message-header";
import {
  TabNavigation,
  SystemMessageTab,
} from "./system-message-modal/tab-navigation";
import { TabContent } from "./system-message-modal/tab-content";
import { SystemMessageForModal } from "#/utils/system-message-adapter";

interface SystemMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  systemMessage: SystemMessageForModal | null;
}

export function SystemMessageModal({
  isOpen,
  onClose,
  systemMessage,
}: SystemMessageModalProps) {
  const [activeTab, setActiveTab] = useState<SystemMessageTab>("system");
  const [expandedTools, setExpandedTools] = useState<Record<number, boolean>>(
    {},
  );

  // Reset to System on open so a previously selected, now-hidden tab can't
  // leave the modal showing an empty panel.
  useEffect(() => {
    if (isOpen) {
      setActiveTab("system");
    }
  }, [isOpen]);

  if (!systemMessage) {
    return null;
  }

  const toggleTool = (index: number) => {
    setExpandedTools((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  return (
    isOpen && (
      <ModalBackdrop onClose={onClose}>
        <ModalBody
          width="lg"
          className="relative max-h-[80vh] flex flex-col items-start border border-[var(--oh-border)]"
          testID="system-message-modal"
        >
          <SystemMessageHeader
            agentClass={systemMessage.agent_class}
            openhandsVersion={systemMessage.openhands_version}
            onClose={onClose}
          />

          <div className="w-full">
            <TabNavigation
              activeTab={activeTab}
              onTabChange={setActiveTab}
              hasDynamicContext={!!systemMessage.dynamicContext}
              hasTools={
                !!(systemMessage.tools && systemMessage.tools.length > 0)
              }
            />

            <div className="h-[60vh] overflow-auto rounded-md border border-[var(--oh-border)] bg-surface-raised custom-scrollbar-always">
              <TabContent
                activeTab={activeTab}
                systemMessage={systemMessage}
                expandedTools={expandedTools}
                onToggleTool={toggleTool}
              />
            </div>
          </div>
        </ModalBody>
      </ModalBackdrop>
    )
  );
}
