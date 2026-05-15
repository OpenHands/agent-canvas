import { useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "#/utils/utils";
import { I18nKey } from "#/i18n/declaration";

interface MenuItemProps {
  index: number;
  label: string;
  onClick: () => void;
  onKeyDown: (e: React.KeyboardEvent, index: number) => void;
  menuItemsRef: React.MutableRefObject<(HTMLButtonElement | null)[]>;
  disabled?: boolean;
  className?: string;
  testId: string;
}

function MenuItem({
  index,
  label,
  onClick,
  onKeyDown,
  menuItemsRef,
  disabled,
  className,
  testId,
}: MenuItemProps) {
  return (
    <button
      ref={(el) => {
        // eslint-disable-next-line no-param-reassign
        menuItemsRef.current[index] = el;
      }}
      type="button"
      onClick={onClick}
      onKeyDown={(e) => onKeyDown(e, index)}
      disabled={disabled}
      className={cn(
        "w-full text-left px-4 py-2 text-sm text-white hover:bg-tertiary cursor-pointer",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        className,
      )}
      role="menuitem"
      data-testid={testId}
    >
      {label}
    </button>
  );
}

interface ProfileActionsMenuProps {
  onEdit: () => void;
  onRename: () => void;
  onSetActive: () => void;
  onDelete: () => void;
  isActive: boolean;
  isActivating: boolean;
  onClose: () => void;
}

export function ProfileActionsMenu({
  onEdit,
  onRename,
  onSetActive,
  onDelete,
  isActive,
  isActivating,
  onClose,
}: ProfileActionsMenuProps) {
  const { t } = useTranslation("openhands");
  const menuRef = useRef<HTMLDivElement>(null);
  const menuItemsRef = useRef<(HTMLButtonElement | null)[]>([]);

  // Focus first item when menu opens
  useEffect(() => {
    menuItemsRef.current[0]?.focus();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  const handleAction = (action: () => void) => {
    action();
    onClose();
  };

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, currentIndex: number) => {
      if (e.key === "Tab") {
        onClose();
        return;
      }
      const itemCount = menuItemsRef.current.filter(Boolean).length;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const nextIndex = (currentIndex + 1) % itemCount;
        menuItemsRef.current[nextIndex]?.focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prevIndex = (currentIndex - 1 + itemCount) % itemCount;
        menuItemsRef.current[prevIndex]?.focus();
      }
    },
    [onClose],
  );

  const setActiveDisabled = isActive || isActivating;

  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-full mt-1 z-10 bg-base-secondary border border-[var(--oh-border)] rounded-md shadow-lg py-1 min-w-[160px]"
      role="menu"
      aria-orientation="vertical"
      data-testid="profile-actions-menu"
    >
      <MenuItem
        index={0}
        label={t(I18nKey.SETTINGS$PROFILE_EDIT)}
        onClick={() => handleAction(onEdit)}
        onKeyDown={handleKeyDown}
        menuItemsRef={menuItemsRef}
        testId="profile-edit"
      />
      <MenuItem
        index={1}
        label={t(I18nKey.BUTTON$RENAME)}
        onClick={() => handleAction(onRename)}
        onKeyDown={handleKeyDown}
        menuItemsRef={menuItemsRef}
        testId="profile-rename"
      />
      <MenuItem
        index={2}
        label={t(I18nKey.SETTINGS$PROFILE_SET_ACTIVE)}
        onClick={() => handleAction(onSetActive)}
        onKeyDown={handleKeyDown}
        menuItemsRef={menuItemsRef}
        disabled={setActiveDisabled}
        testId="profile-set-active"
      />
      <MenuItem
        index={3}
        label={t(I18nKey.BUTTON$DELETE)}
        onClick={() => handleAction(onDelete)}
        onKeyDown={handleKeyDown}
        menuItemsRef={menuItemsRef}
        className="text-red-400"
        testId="profile-delete"
      />
    </div>
  );
}
