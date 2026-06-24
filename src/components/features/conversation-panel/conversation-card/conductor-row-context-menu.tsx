import React from "react";
import { useTranslation } from "react-i18next";
import {
  Archive,
  ArchiveRestore,
  Bell,
  BellOff,
  Check,
  ChevronRight,
  CircleDashed,
  Mail,
  MailOpen,
  Pencil,
  Pin,
  Trash2,
  X,
} from "lucide-react";
import { useClickOutsideElement } from "#/hooks/use-click-outside-element";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { dropdownMenuRowForegroundClassName } from "#/utils/dropdown-classes";
import { ContextMenu } from "#/ui/context-menu";
import { Divider } from "#/ui/divider";
import {
  CONVERSATION_STATUS_BUCKET_ORDER,
  type ConversationStatusBucketId,
} from "../conversation-panel-list-helpers";
import { StatusBucketIcon } from "../status-bucket-icon";

const STATUS_LABEL_KEYS: Record<ConversationStatusBucketId, I18nKey> = {
  in_progress: I18nKey.CONVERSATION_PANEL$STATUS_IN_PROGRESS,
  in_review: I18nKey.CONVERSATION_PANEL$STATUS_IN_REVIEW,
  done: I18nKey.CONVERSATION_PANEL$STATUS_DONE,
};

interface RowProps {
  icon: React.ReactNode;
  label: string;
  trailing?: React.ReactNode;
  testId?: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseEnter?: () => void;
}

function Row({
  icon,
  label,
  trailing,
  testId,
  onClick,
  onMouseEnter,
}: RowProps) {
  return (
    <li>
      <button
        type="button"
        data-testid={testId}
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        className={cn(dropdownMenuRowForegroundClassName, "text-nowrap")}
      >
        <span className="flex w-full items-center gap-2.5">
          <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[var(--oh-muted)]">
            {icon}
          </span>
          <span className="min-w-0 flex-1 truncate text-left">{label}</span>
          {trailing != null ? (
            <span className="ml-3 flex shrink-0 items-center text-[var(--oh-text-dim)]">
              {trailing}
            </span>
          ) : null}
        </span>
      </button>
    </li>
  );
}

function MenuDivider() {
  return (
    <li role="none">
      <Divider inset="menu" />
    </li>
  );
}

export interface ConductorRowContextMenuProps {
  /** Fixed coordinates for the cursor-anchored portal. */
  style: React.CSSProperties;
  onClose: () => void;
  isUnread: boolean;
  onToggleUnread: () => void;
  isPinned: boolean;
  onTogglePin: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  statusOverride: ConversationStatusBucketId | null;
  onSetStatus: (bucket: ConversationStatusBucketId) => void;
  onClearStatus: () => void;
  onRename: () => void;
  isArchived: boolean;
  onToggleArchive: () => void;
  onDelete: () => void;
}

export function ConductorRowContextMenu({
  style,
  onClose,
  isUnread,
  onToggleUnread,
  isPinned,
  onTogglePin,
  isMuted,
  onToggleMute,
  statusOverride,
  onSetStatus,
  onClearStatus,
  onRename,
  isArchived,
  onToggleArchive,
  onDelete,
}: ConductorRowContextMenuProps) {
  const { t } = useTranslation("openhands");
  const ref = useClickOutsideElement<HTMLUListElement>(onClose);
  const [statusSubmenuOpen, setStatusSubmenuOpen] = React.useState(false);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const run = (action: () => void) => (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    action();
    onClose();
  };

  return (
    <ContextMenu
      ref={ref}
      testId="conductor-row-context-menu"
      theme="popover"
      position="none"
      spacing="none"
      style={style}
      // overflow-visible so the "Set status" submenu flyout (positioned
      // left-full of its row) isn't clipped by the menu's rounded overflow.
      className="min-w-[220px] w-max max-w-[min(280px,100vw-16px)] overflow-visible"
    >
      <Row
        testId="conductor-row-mark-unread"
        icon={
          isUnread ? (
            <MailOpen width={16} height={16} />
          ) : (
            <Mail width={16} height={16} />
          )
        }
        label={t(
          isUnread
            ? I18nKey.CONVERSATION_PANEL$MARK_AS_READ
            : I18nKey.CONVERSATION_PANEL$MARK_AS_UNREAD,
        )}
        trailing="R"
        onClick={run(onToggleUnread)}
        onMouseEnter={() => setStatusSubmenuOpen(false)}
      />
      <Row
        testId="conductor-row-pin"
        icon={
          <Pin
            width={16}
            height={16}
            className={cn(isPinned && "fill-current")}
          />
        }
        label={t(
          isPinned
            ? I18nKey.CONVERSATION_PANEL$UNPIN_CONVERSATION
            : I18nKey.CONVERSATION_PANEL$PIN_CONVERSATION,
        )}
        trailing="P"
        onClick={run(onTogglePin)}
        onMouseEnter={() => setStatusSubmenuOpen(false)}
      />
      <Row
        testId="conductor-row-mute"
        icon={
          isMuted ? (
            <Bell width={16} height={16} />
          ) : (
            <BellOff width={16} height={16} />
          )
        }
        label={t(
          isMuted
            ? I18nKey.CONVERSATION_PANEL$UNMUTE_CONVERSATION
            : I18nKey.CONVERSATION_PANEL$MUTE_CONVERSATION,
        )}
        trailing="M"
        onClick={run(onToggleMute)}
        onMouseEnter={() => setStatusSubmenuOpen(false)}
      />

      <li className="relative">
        <button
          type="button"
          data-testid="conductor-row-set-status"
          aria-haspopup="menu"
          aria-expanded={statusSubmenuOpen}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setStatusSubmenuOpen(true);
          }}
          onMouseEnter={() => setStatusSubmenuOpen(true)}
          className={cn(dropdownMenuRowForegroundClassName, "text-nowrap")}
        >
          <span className="flex w-full items-center gap-2.5">
            <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[var(--oh-muted)]">
              <CircleDashed width={16} height={16} />
            </span>
            <span className="min-w-0 flex-1 truncate text-left">
              {t(I18nKey.CONVERSATION_PANEL$SET_STATUS)}
            </span>
            <ChevronRight
              width={16}
              height={16}
              className="ml-3 shrink-0 text-[var(--oh-text-dim)]"
            />
          </span>
        </button>

        {statusSubmenuOpen ? (
          <ContextMenu
            testId="conductor-row-status-submenu"
            theme="popover"
            position="none"
            spacing="none"
            className="absolute left-full top-0 ml-1 min-w-[160px]"
          >
            {CONVERSATION_STATUS_BUCKET_ORDER.map((bucket) => (
              <Row
                key={bucket}
                testId={`conductor-row-status-${bucket}`}
                icon={<StatusBucketIcon bucketId={bucket} />}
                label={t(STATUS_LABEL_KEYS[bucket])}
                trailing={
                  statusOverride === bucket ? (
                    <Check
                      width={14}
                      height={14}
                      className="text-[var(--oh-status-success)]"
                      aria-label="selected"
                    />
                  ) : undefined
                }
                onClick={run(() => onSetStatus(bucket))}
              />
            ))}
            <MenuDivider />
            <Row
              testId="conductor-row-status-clear"
              icon={<X width={16} height={16} />}
              label={t(I18nKey.CONVERSATION_PANEL$CLEAR_STATUS)}
              onClick={run(onClearStatus)}
            />
          </ContextMenu>
        ) : null}
      </li>

      <MenuDivider />

      <Row
        testId="conductor-row-rename"
        icon={<Pencil width={16} height={16} />}
        label={t(I18nKey.BUTTON$RENAME)}
        onClick={run(onRename)}
        onMouseEnter={() => setStatusSubmenuOpen(false)}
      />
      <Row
        testId="conductor-row-archive"
        icon={
          isArchived ? (
            <ArchiveRestore width={16} height={16} />
          ) : (
            <Archive width={16} height={16} />
          )
        }
        label={t(
          isArchived
            ? I18nKey.CONVERSATION_PANEL$UNARCHIVE
            : I18nKey.CONVERSATION_PANEL$ARCHIVE,
        )}
        trailing="⌘⇧A"
        onClick={run(onToggleArchive)}
        onMouseEnter={() => setStatusSubmenuOpen(false)}
      />

      <MenuDivider />

      <Row
        testId="conductor-row-delete"
        icon={<Trash2 width={16} height={16} />}
        label={t(I18nKey.COMMON$DELETE_CONVERSATION)}
        onClick={run(onDelete)}
        onMouseEnter={() => setStatusSubmenuOpen(false)}
      />
    </ContextMenu>
  );
}
