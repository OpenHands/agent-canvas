import { useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";

interface ProfileActionsMenuProps {
  /** Unique ID for the menu, used for aria-controls */
  menuId: string;
  /** Ref to the trigger button for focus restoration */
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
  onEdit: () => void;
  onRename: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export function ProfileActionsMenu({
  menuId,
  triggerRef,
  onEdit,
  onRename,
  onDelete,
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
      // Don't close if clicking inside menu or on the trigger button
      // This prevents the toggle-reopen issue when clicking trigger to close
      if (menuRef.current && !menuRef.current.contains(target)) {
        if (triggerRef?.current?.contains(target)) {
          // Click on trigger - let the toggle handler in parent handle it
          return;
        }
        // Restore focus to trigger button when closing
        triggerRef?.current?.focus();
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Restore focus to trigger button when closing via Escape
        triggerRef?.current?.focus();
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose, triggerRef]);

  const handleAction = (action: () => void) => {
    action();
    // Restore focus to trigger button after action
    triggerRef?.current?.focus();
    onClose();
  };

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, currentIndex: number) => {
      // Tab should close the menu per WAI-ARIA menu button practices
      if (e.key === "Tab") {
        onClose();
        return;
      }
      // Use dynamic item count based on actual menu items
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

  return (
    <div
      ref={menuRef}
      id={menuId}
      className="absolute right-0 top-full mt-1 z-10 bg-base-secondary border border-tertiary rounded-md shadow-lg py-1 min-w-[140px]"
      role="menu"
      aria-orientation="vertical"
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
        data-testid="profile-action-edit"
      >
        {t(I18nKey.BUTTON$EDIT)}
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
        data-testid="profile-action-rename"
      >
        {t(I18nKey.BUTTON$RENAME)}
      </button>
      <button
        ref={(el) => {
          menuItemsRef.current[2] = el;
        }}
        type="button"
        onClick={() => handleAction(onDelete)}
        onKeyDown={(e) => handleKeyDown(e, 2)}
        className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-tertiary cursor-pointer"
        role="menuitem"
        data-testid="profile-action-delete"
      >
        {t(I18nKey.BUTTON$DELETE)}
      </button>
    </div>
  );
}
