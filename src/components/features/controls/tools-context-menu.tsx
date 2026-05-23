import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useClickOutsideElement } from "#/hooks/use-click-outside-element";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useUserProviders } from "#/hooks/use-user-providers";
import { cn } from "#/utils/utils";
import { ContextMenu } from "#/ui/context-menu";
import { ContextMenuListItem } from "../context-menu/context-menu-list-item";
import { Divider } from "#/ui/divider";
import { I18nKey } from "#/i18n/declaration";

import CodeBranchIcon from "#/icons/u-code-branch.svg?react";
import SkillsIcon from "#/icons/skills.svg?react";
import FishingHookIcon from "#/icons/fishing-hook.svg?react";
import ToolsIcon from "#/icons/u-tools.svg?react";
import SettingsIcon from "#/icons/settings.svg?react";
import CarretRightFillIcon from "#/icons/carret-right-fill.svg?react";
import { ToolsContextMenuIconText } from "./tools-context-menu-icon-text";
import { GitToolsSubmenu } from "./git-tools-submenu";
import { MacrosSubmenu } from "./macros-submenu";

interface ToolsContextMenuProps {
  onClose: () => void;
  onShowSkills: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onShowHooks: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onShowAgentTools: (event: React.MouseEvent<HTMLButtonElement>) => void;
  shouldShowAgentTools?: boolean;
  shouldShowHooks?: boolean;
}

export function ToolsContextMenu({
  onClose,
  onShowSkills,
  onShowHooks,
  onShowAgentTools,
  shouldShowAgentTools = true,
  shouldShowHooks = false,
}: ToolsContextMenuProps) {
  const { t } = useTranslation("openhands");
  const { data: conversation } = useActiveConversation();
  const { providers } = useUserProviders();

  const [activeSubmenu, setActiveSubmenu] = useState<"git" | "macros" | null>(
    null,
  );

  const hasRepository = !!conversation?.selected_repository;
  const providersAreSet = providers.length > 0;
  const showGitTools = hasRepository && providersAreSet;

  const handleSubmenuClick = (submenu: "git" | "macros") => {
    setActiveSubmenu(activeSubmenu === submenu ? null : submenu);
  };

  const handleClose = () => {
    setActiveSubmenu(null);
    onClose();
  };

  const ref = useClickOutsideElement<HTMLUListElement>(handleClose);

  return (
    <ContextMenu
      ref={ref}
      testId="tools-context-menu"
      position="top"
      alignment="left"
      className="left-[-16px] mb-2 bottom-full overflow-visible min-w-[200px]"
    >
      {/* Git Tools */}
      {showGitTools && (
        <div className="relative group/git">
          <ContextMenuListItem
            testId="git-tools-button"
            onClick={() => handleSubmenuClick("git")}
          >
            <ToolsContextMenuIconText
              icon={<CodeBranchIcon width={16} height={16} />}
              text={t(I18nKey.COMMON$GIT_TOOLS)}
              rightIcon={<CarretRightFillIcon width={10} height={10} />}
            />
          </ContextMenuListItem>
          <div
            className={cn(
              "absolute left-full top-[-6px] z-60 opacity-0 invisible pointer-events-none transition-all duration-200 ml-[1px]",
              "group-hover/git:opacity-100 group-hover/git:visible group-hover/git:pointer-events-auto",
              "hover:opacity-100 hover:visible hover:pointer-events-auto",
              activeSubmenu === "git" &&
                "opacity-100 visible pointer-events-auto",
            )}
          >
            <GitToolsSubmenu onClose={handleClose} />
          </div>
        </div>
      )}

      {/* Macros */}
      <div className="relative group/macros">
        <ContextMenuListItem
          testId="macros-button"
          onClick={() => handleSubmenuClick("macros")}
        >
          <ToolsContextMenuIconText
            icon={<SettingsIcon width={16} height={16} />}
            text={t(I18nKey.COMMON$MACROS)}
            rightIcon={<CarretRightFillIcon width={10} height={10} />}
          />
        </ContextMenuListItem>
        <div
          className={cn(
            "absolute left-full top-[-4px] z-60 opacity-0 invisible pointer-events-none transition-all duration-200 ml-[1px]",
            "group-hover/macros:opacity-100 group-hover/macros:visible group-hover/macros:pointer-events-auto",
            "hover:opacity-100 hover:visible hover:pointer-events-auto",
            activeSubmenu === "macros" &&
              "opacity-100 visible pointer-events-auto",
          )}
        >
          <MacrosSubmenu onClose={handleClose} />
        </div>
      </div>

      {shouldShowAgentTools && <Divider inset="menu" />}

      <ContextMenuListItem testId="show-skills-button" onClick={onShowSkills}>
        <ToolsContextMenuIconText
          icon={
            <SkillsIcon
              width={16}
              height={16}
              className="stroke-[1.75]"
              aria-hidden
            />
          }
          text={t(I18nKey.CONVERSATION$SHOW_SKILLS)}
        />
      </ContextMenuListItem>

      {/* Show Hooks - Only show for V1 conversations */}
      {shouldShowHooks && (
        <ContextMenuListItem testId="show-hooks-button" onClick={onShowHooks}>
          <ToolsContextMenuIconText
            icon={<FishingHookIcon width={16} height={16} aria-hidden />}
            text={t(I18nKey.CONVERSATION$SHOW_HOOKS)}
          />
        </ContextMenuListItem>
      )}

      {/* Show Agent Tools and Metadata - Only show if system message is available */}
      {shouldShowAgentTools && (
        <ContextMenuListItem
          testId="show-agent-tools-button"
          onClick={onShowAgentTools}
        >
          <ToolsContextMenuIconText
            icon={<ToolsIcon width={16} height={16} />}
            text={t(I18nKey.BUTTON$SHOW_AGENT_TOOLS_AND_METADATA)}
          />
        </ContextMenuListItem>
      )}
    </ContextMenu>
  );
}
