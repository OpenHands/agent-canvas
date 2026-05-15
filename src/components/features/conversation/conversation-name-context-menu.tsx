import React from "react";
import ReactDOM from "react-dom";
import { useTranslation } from "react-i18next";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useClickOutsideElement } from "#/hooks/use-click-outside-element";
import { useBreakpoint } from "#/hooks/use-breakpoint";
import { cn } from "#/utils/utils";
import { ContextMenu } from "#/ui/context-menu";
import { ContextMenuListItem } from "../context-menu/context-menu-list-item";
import { Divider } from "#/ui/divider";
import { I18nKey } from "#/i18n/declaration";

import EditIcon from "#/icons/u-edit.svg?react";
import RobotIcon from "#/icons/u-robot.svg?react";
import ToolsIcon from "#/icons/u-tools.svg?react";
import DownloadIcon from "#/icons/u-download.svg?react";
import CreditCardIcon from "#/icons/u-credit-card.svg?react";
import CloseIcon from "#/icons/u-close.svg?react";
import DeleteIcon from "#/icons/u-delete.svg?react";
import LinkIcon from "#/icons/link-external.svg?react";
import CopyIcon from "#/icons/copy.svg?react";
import { ConversationNameContextMenuIconText } from "./conversation-name-context-menu-icon-text";
import { CONTEXT_MENU_ICON_TEXT_CLASSNAME } from "#/utils/constants";

const contextMenuListItemClassName = cn(
  "cursor-pointer p-0 h-auto hover:bg-transparent",
  CONTEXT_MENU_ICON_TEXT_CLASSNAME,
);

interface ConversationNameContextMenuProps {
  onClose: () => void;
  onRename?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onDelete?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onStop?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onDisplayCost?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onShowAgentTools?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onShowSkills?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onShowHooks?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onTogglePublic?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onCopyShareLink?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onDownloadConversation?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  shareUrl?: string;
  position?: "top" | "bottom";
  /**
   * Element the menu should anchor against. When provided, the menu renders
   * into a portal at the document body using fixed positioning so it cannot be
   * clipped by ancestors with `overflow: hidden` (e.g. the chat panel that
   * sits next to the right-side tabs panel).
   */
  anchorRef?: React.RefObject<HTMLElement | null>;
}

export function ConversationNameContextMenu({
  onClose,
  onRename,
  onDelete,
  onStop,
  onDisplayCost,
  onShowAgentTools,
  onShowSkills,
  onShowHooks,
  onTogglePublic,
  onCopyShareLink,
  onDownloadConversation,
  shareUrl,
  position = "bottom",
  anchorRef,
}: ConversationNameContextMenuProps) {
  const isMobile = useBreakpoint();

  const { t } = useTranslation("openhands");
  const { backend } = useActiveBackend();
  const { data: conversation } = useActiveConversation();
  const ref = useClickOutsideElement<HTMLUListElement>(onClose);

  // When anchored, render via a portal with fixed positioning computed from
  // the anchor's bounding rect. This avoids being clipped by ancestors with
  // `overflow: hidden`.
  const anchorElement = anchorRef?.current ?? null;
  const [portalStyle, setPortalStyle] = React.useState<React.CSSProperties>();
  React.useLayoutEffect(() => {
    if (!anchorElement) return undefined;

    const updatePosition = () => {
      const rect = anchorElement.getBoundingClientRect();
      if (!rect) return;
      // 8px gap roughly matching the previous `mt-2` spacing.
      const gap = 8;
      const style: React.CSSProperties = {
        position: "fixed",
        zIndex: 9999,
      };
      if (position === "top") {
        style.bottom = window.innerHeight - rect.top + gap;
      } else {
        style.top = rect.bottom + gap;
      }
      style.left = rect.left;
      setPortalStyle(style);
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorElement, position]);
  const hasTools = Boolean(onShowAgentTools || onShowSkills || onShowHooks);
  const hasInfo = Boolean(onDisplayCost);
  const hasControl = Boolean(onStop || onDelete);
  const stopLabelKey =
    backend.kind === "cloud"
      ? I18nKey.COMMON$CLOSE_CONVERSATION_STOP_RUNTIME
      : I18nKey.COMMON$STOP_CONVERSATION;
  // Public sharing is a cloud-only SaaS feature; hide it on local backends.
  const shouldShowPublicSharing =
    backend.kind === "cloud" && Boolean(onTogglePublic);

  const isPortaled = Boolean(anchorElement);
  // When portaled the menu is positioned via inline `style` (fixed coords from
  // the anchor rect), so we must drop the variant-driven absolute positioning
  // that would otherwise pin it to its now-irrelevant offset parent.
  const portalClassName = isPortaled
    ? "!static !top-auto !bottom-auto !left-auto !right-auto !mt-0"
    : "";

  const menu = (
    <ContextMenu
      ref={ref}
      testId="conversation-name-context-menu"
      position={position}
      alignment="left"
      className={cn(
        isMobile ? "right-0 translate-x-[34%] left-auto" : "",
        portalClassName,
      )}
    >
      {onRename && (
        <ContextMenuListItem
          testId="rename-button"
          onClick={onRename}
          className={contextMenuListItemClassName}
        >
          <ConversationNameContextMenuIconText
            icon={<EditIcon width={16} height={16} />}
            text={t(I18nKey.BUTTON$RENAME)}
            className={CONTEXT_MENU_ICON_TEXT_CLASSNAME}
          />
        </ContextMenuListItem>
      )}

      {hasTools && <Divider testId="separator-tools" />}

      {onShowSkills && (
        <ContextMenuListItem
          testId="show-skills-button"
          onClick={onShowSkills}
          className={contextMenuListItemClassName}
        >
          <ConversationNameContextMenuIconText
            icon={<RobotIcon width={16} height={16} />}
            text={t(I18nKey.CONVERSATION$SHOW_SKILLS)}
            className={CONTEXT_MENU_ICON_TEXT_CLASSNAME}
          />
        </ContextMenuListItem>
      )}

      {onShowHooks && (
        <ContextMenuListItem
          testId="show-hooks-button"
          onClick={onShowHooks}
          className={contextMenuListItemClassName}
        >
          <ConversationNameContextMenuIconText
            icon={<ToolsIcon width={16} height={16} />}
            text={t(I18nKey.CONVERSATION$SHOW_HOOKS)}
            className={CONTEXT_MENU_ICON_TEXT_CLASSNAME}
          />
        </ContextMenuListItem>
      )}

      {onShowAgentTools && (
        <ContextMenuListItem
          testId="show-agent-tools-button"
          onClick={onShowAgentTools}
          className={contextMenuListItemClassName}
        >
          <ConversationNameContextMenuIconText
            icon={<ToolsIcon width={16} height={16} />}
            text={t(I18nKey.BUTTON$SHOW_AGENT_TOOLS_AND_METADATA)}
            className={CONTEXT_MENU_ICON_TEXT_CLASSNAME}
          />
        </ContextMenuListItem>
      )}

      {onDownloadConversation && (
        <ContextMenuListItem
          testId="download-trajectory-button"
          onClick={onDownloadConversation}
          className={contextMenuListItemClassName}
        >
          <ConversationNameContextMenuIconText
            icon={<DownloadIcon width={16} height={16} />}
            text={t(I18nKey.BUTTON$EXPORT_CONVERSATION)}
            className={CONTEXT_MENU_ICON_TEXT_CLASSNAME}
          />
        </ContextMenuListItem>
      )}

      {(hasInfo || hasControl) && <Divider testId="separator-info-control" />}

      {onDisplayCost && (
        <ContextMenuListItem
          testId="display-cost-button"
          onClick={onDisplayCost}
          className={contextMenuListItemClassName}
        >
          <ConversationNameContextMenuIconText
            icon={<CreditCardIcon width={16} height={16} />}
            text={t(I18nKey.BUTTON$DISPLAY_COST)}
            className={CONTEXT_MENU_ICON_TEXT_CLASSNAME}
          />
        </ContextMenuListItem>
      )}

      {shouldShowPublicSharing && onTogglePublic && (
        <li className="flex items-center gap-2 justify-between w-full px-4 h-10 hover:bg-white/10">
          <button
            type="button"
            data-testid="share-publicly-button"
            onClick={onTogglePublic}
            className="flex items-center gap-2 flex-1 text-sm text-start cursor-pointer"
          >
            <input
              type="checkbox"
              checked={conversation?.public || false}
              readOnly
              className="w-4 h-4 cursor-pointer"
            />
            <span>{t(I18nKey.CONVERSATION$SHARE_PUBLICLY)}</span>
          </button>
          {conversation?.public && shareUrl && onCopyShareLink && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                data-testid="copy-share-link-button"
                onClick={onCopyShareLink}
                className="p-1 hover:bg-[var(--oh-interactive-selected)] rounded cursor-pointer"
                title={t(I18nKey.BUTTON$COPY_TO_CLIPBOARD)}
              >
                <CopyIcon width={16} height={16} />
              </button>
              <a
                data-testid="open-share-link-button"
                href={shareUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="p-1 hover:bg-[var(--oh-interactive-selected)] rounded cursor-pointer"
                title={t(I18nKey.BUTTON$OPEN_IN_NEW_TAB)}
              >
                <LinkIcon width={16} height={16} />
              </a>
            </div>
          )}
        </li>
      )}

      {onStop && (
        <ContextMenuListItem
          testId="stop-button"
          onClick={onStop}
          className={contextMenuListItemClassName}
        >
          <ConversationNameContextMenuIconText
            icon={<CloseIcon width={16} height={16} />}
            text={t(stopLabelKey)}
            className={CONTEXT_MENU_ICON_TEXT_CLASSNAME}
          />
        </ContextMenuListItem>
      )}

      {onDelete && (
        <ContextMenuListItem
          testId="delete-button"
          onClick={onDelete}
          className={contextMenuListItemClassName}
        >
          <ConversationNameContextMenuIconText
            icon={<DeleteIcon width={16} height={16} />}
            text={t(I18nKey.COMMON$DELETE_CONVERSATION)}
            className={CONTEXT_MENU_ICON_TEXT_CLASSNAME}
          />
        </ContextMenuListItem>
      )}
    </ContextMenu>
  );

  if (isPortaled) {
    if (typeof document === "undefined" || !portalStyle) {
      return null;
    }
    return ReactDOM.createPortal(
      <div style={portalStyle}>{menu}</div>,
      document.body,
    );
  }

  return menu;
}
