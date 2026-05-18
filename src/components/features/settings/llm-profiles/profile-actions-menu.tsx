import {
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useState,
} from "react";
import ReactDOM from "react-dom";
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
  destructive?: boolean;
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
  destructive,
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
      data-destructive={destructive ? "true" : undefined}
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
  /**
   * Element the menu should anchor against. When provided, the menu renders
   * into a portal at the document body using fixed positioning so it cannot be
   * clipped by ancestors with `overflow: auto/hidden` (e.g. the settings
   * `<main>` scroll container).
   */
  anchorRef?: React.RefObject<HTMLElement | null>;
}

export function ProfileActionsMenu({
  onEdit,
  onRename,
  onSetActive,
  onDelete,
  isActive,
  isActivating,
  onClose,
  anchorRef,
}: ProfileActionsMenuProps) {
  const { t } = useTranslation("openhands");
  const menuRef = useRef<HTMLDivElement>(null);
  const menuItemsRef = useRef<(HTMLButtonElement | null)[]>([]);

  const anchorElement = anchorRef?.current ?? null;
  const [portalStyle, setPortalStyle] = useState<React.CSSProperties>();

  useLayoutEffect(() => {
    if (!anchorElement) return undefined;

    const updatePosition = () => {
      const rect = anchorElement.getBoundingClientRect();
      if (!rect) return;
      // 4px gap matches the previous `mt-1` spacing.
      const gap = 4;
      setPortalStyle({
        position: "fixed",
        zIndex: 9999,
        top: rect.bottom + gap,
        right: window.innerWidth - rect.right,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorElement]);

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
  const isPortaled = Boolean(anchorElement);

  const menu = (
    <div
      ref={menuRef}
      className={cn(
        "absolute right-0 top-full mt-1 z-10 bg-base-secondary border border-[var(--oh-border)] rounded-md shadow-lg py-1 w-[160px]",
        // When portaled the menu is positioned via the wrapper's inline
        // `style` (fixed coords from the anchor rect), so we must neutralize
        // the Tailwind absolute positioning that would otherwise pin it to
        // its now-irrelevant offset parent.
        isPortaled &&
          "!static !top-auto !bottom-auto !left-auto !right-auto !mt-0",
      )}
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
        destructive
      />
    </div>
  );

  if (isPortaled) {
    if (typeof document === "undefined" || !portalStyle) {
      return null;
    }
    return ReactDOM.createPortal(
      // portal position computed from DOM bounding rect at runtime
      <div style={portalStyle}>{menu}</div>,
      document.body,
    );
  }

  return menu;
}
