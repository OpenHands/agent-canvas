import { useTranslation } from "react-i18next";
import { TabButton } from "./tab-button";

export type SystemMessageTab = "system" | "dynamic" | "tools";

interface TabNavigationProps {
  activeTab: SystemMessageTab;
  onTabChange: (tab: SystemMessageTab) => void;
  hasDynamicContext: boolean;
  hasTools: boolean;
}

export function TabNavigation({
  activeTab,
  onTabChange,
  hasDynamicContext,
  hasTools,
}: TabNavigationProps) {
  const { t } = useTranslation("openhands");

  return (
    <div
      className="mb-2 flex border-b border-[var(--oh-border)]"
      role="tablist"
    >
      <TabButton
        isActive={activeTab === "system"}
        onClick={() => onTabChange("system")}
      >
        {t("SYSTEM_MESSAGE_MODAL$SYSTEM_MESSAGE_TAB")}
      </TabButton>
      {hasDynamicContext && (
        <TabButton
          isActive={activeTab === "dynamic"}
          onClick={() => onTabChange("dynamic")}
        >
          {t("SYSTEM_MESSAGE_MODAL$DYNAMIC_CONTEXT_TAB")}
        </TabButton>
      )}
      {hasTools && (
        <TabButton
          isActive={activeTab === "tools"}
          onClick={() => onTabChange("tools")}
        >
          {t("SYSTEM_MESSAGE_MODAL$TOOLS_TAB")}
        </TabButton>
      )}
    </div>
  );
}
