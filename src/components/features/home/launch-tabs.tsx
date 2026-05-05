import React from "react";
import { useTranslation } from "react-i18next";

import { cn } from "#/utils/utils";
import { I18nKey } from "#/i18n/declaration";
import { GitRepository } from "#/types/git";

import { RepositorySelectionForm } from "./repo-selection-form";
import { WorkspaceSelectionForm } from "./workspace-selection-form";

type LaunchTab = "repositories" | "workspaces";

interface LaunchTabsProps {
  onRepoSelection: (repo: GitRepository | null) => void;
  isLoadingSettings?: boolean;
}

interface TabButtonProps {
  isActive: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testId: string;
}

function TabButton({ isActive, onClick, children, testId }: TabButtonProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      data-testid={testId}
      onClick={onClick}
      className={cn(
        "px-4 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer",
        isActive
          ? "border-[#C9B974] text-white"
          : "border-transparent text-[#B7BDC2] hover:text-white",
      )}
    >
      {children}
    </button>
  );
}

export function LaunchTabs({
  onRepoSelection,
  isLoadingSettings = false,
}: LaunchTabsProps) {
  const { t } = useTranslation("openhands");
  const [activeTab, setActiveTab] = React.useState<LaunchTab>("repositories");

  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        className="flex border-b border-[#727987]"
        data-testid="launch-tabs"
      >
        <TabButton
          testId="repositories-tab"
          isActive={activeTab === "repositories"}
          onClick={() => setActiveTab("repositories")}
        >
          {t(I18nKey.HOME$REPOSITORIES_TAB)}
        </TabButton>
        <TabButton
          testId="workspaces-tab"
          isActive={activeTab === "workspaces"}
          onClick={() => setActiveTab("workspaces")}
        >
          {t(I18nKey.HOME$WORKSPACES_TAB)}
        </TabButton>
      </div>

      <div className="min-h-[240px]">
        {activeTab === "repositories" && (
          <RepositorySelectionForm
            onRepoSelection={onRepoSelection}
            isLoadingSettings={isLoadingSettings}
          />
        )}
        {activeTab === "workspaces" && (
          <WorkspaceSelectionForm isLoadingSettings={isLoadingSettings} />
        )}
      </div>
    </div>
  );
}
