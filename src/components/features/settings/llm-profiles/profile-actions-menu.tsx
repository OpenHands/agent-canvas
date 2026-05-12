import { useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";

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
      className="absolute right-0 top-full mt-1 z-10 bg-base-secondary border border-tertiary rounded-md shadow-lg py-1 min-w-[160px]"
      role="menu"
      aria-orientation="vertical"
      data-testid="profile-actions-menu"
    >
      <button
        ref={(el) => {
          menuItemsRef.current[0] = el;
        }}
        type="button"
        onClick={() => handleAction(onEdit)}
        onKeyDown={(e) => handleKeyDown(e, 0)}
        className="w-full text-left px-4 py-2 text-sm text-white hover:bg-tertiary cursor-pointer"
        role="menuitem"
        data-testid="profile-edit"
      >
        {t(I18nKey.SETTINGS$PROFILE_EDIT)}
      </button>
      <button
        ref={(el) => {
          menuItemsRef.current[1] = el;
        }}
        type="button"
        onClick={() => handleAction(onRename)}
        onKeyDown={(e) => handleKeyDown(e, 1)}
        className="w-full text-left px-4 py-2 text-sm text-white hover:bg-tertiary cursor-pointer"
        role="menuitem"
        data-testid="profile-rename"
      >
        {t(I18nKey.BUTTON$RENAME)}
      </button>
      <button
        ref={(el) => {
          menuItemsRef.current[2] = el;
        }}
        type="button"
        onClick={() => handleAction(onSetActive)}
        onKeyDown={(e) => handleKeyDown(e, 2)}
        disabled={setActiveDisabled}
        className="w-full text-left px-4 py-2 text-sm text-white hover:bg-tertiary cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        role="menuitem"
        data-testid="profile-set-active"
      >
        {t(I18nKey.SETTINGS$PROFILE_SET_ACTIVE)}
      </button>
      <button
        ref={(el) => {
          menuItemsRef.current[3] = el;
        }}
        type="button"
        onClick={() => handleAction(onDelete)}
        onKeyDown={(e) => handleKeyDown(e, 3)}
        className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-tertiary cursor-pointer"
        role="menuitem"
        data-testid="profile-delete"
      >
        {t(I18nKey.BUTTON$DELETE)}
      </button>
    </div>
  );
}
