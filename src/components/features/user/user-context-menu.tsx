import React from "react";
import { useTranslation } from "react-i18next";
import { cn } from "#/utils/utils";
import { useSettingsNavItems } from "#/hooks/use-settings-nav-items";
import DocumentIcon from "#/icons/document.svg?react";
import { BackendSelector } from "#/components/features/backends/backend-selector";
import { AddBackendMenuItem } from "#/components/features/backends/add-backend-menu-item";
import { ContextMenuContainer } from "../context-menu/context-menu-container";
import { ContextMenuNavLink } from "../context-menu/context-menu-nav-link";
import { SettingsNavHeader } from "../settings/settings-nav-header";
import { SettingsNavDivider } from "../settings/settings-nav-divider";
import { I18nKey } from "#/i18n/declaration";

const contextMenuListItemClassName = cn(
  "flex items-center gap-2 p-2 h-auto hover:bg-white/10 hover:text-white rounded text-xs",
);

interface UserContextMenuProps {
  onClose: () => void;
  onOpenAddBackend: () => void;
}

export function UserContextMenu({
  onClose,
  onOpenAddBackend,
}: UserContextMenuProps) {
  const { t } = useTranslation("openhands");
  const settingsNavItems = useSettingsNavItems();

  return (
    <ContextMenuContainer testId="user-context-menu" onClose={onClose}>
      <div className="flex flex-col gap-3 w-[248px]">
        <h3 className="text-lg font-semibold text-white">
          {t(I18nKey.USER$ACCOUNT_SETTINGS)}
        </h3>

        <BackendSelector />

        <div className="flex flex-col items-start gap-0 w-full">
          <AddBackendMenuItem onOpen={onOpenAddBackend} />

          <SettingsNavDivider className="my-1.5" />

          {settingsNavItems.map((renderedItem, index) => {
            if (renderedItem.type === "header") {
              return (
                <SettingsNavHeader
                  key={`header-${renderedItem.text}`}
                  text={renderedItem.text}
                  className="px-2 pt-2 pb-1"
                />
              );
            }

            if (renderedItem.type === "divider") {
              return (
                <SettingsNavDivider
                  key={`divider-${index}`}
                  className="my-1.5"
                />
              );
            }

            return (
              <ContextMenuNavLink
                key={renderedItem.item.to}
                item={renderedItem.item}
                onClick={onClose}
              />
            );
          })}

          <SettingsNavDivider className="my-1.5" />

          <a
            href="https://docs.openhands.dev"
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClose}
            className={contextMenuListItemClassName}
          >
            <DocumentIcon className="text-white" width={16} height={16} />
            {t(I18nKey.SIDEBAR$DOCS)}
          </a>
        </div>
      </div>
    </ContextMenuContainer>
  );
}
