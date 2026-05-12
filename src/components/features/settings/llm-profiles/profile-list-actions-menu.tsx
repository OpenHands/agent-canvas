import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";

interface ProfileListActionsMenuProps {
  isActive: boolean;
  onActivate: () => void;
  onEdit: () => void;
  onRename: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export function ProfileListActionsMenu({
  isActive,
  onActivate,
  onEdit,
  onRename,
  onDelete,
  onClose,
}: ProfileListActionsMenuProps) {
  const { t } = useTranslation("openhands");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
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

  const handleActivate = () => {
    onActivate();
    onClose();
  };

  const handleEdit = () => {
    onEdit();
    onClose();
  };

  const handleRename = () => {
    onRename();
    onClose();
  };

  const handleDelete = () => {
    onDelete();
    onClose();
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={t(I18nKey.SETTINGS$PROFILE_MENU)}
      className="absolute right-0 top-10 z-10 w-40 rounded-md border border-tertiary bg-base shadow-lg"
      data-testid="profile-list-actions-menu"
    >
      {!isActive && (
        <button
          type="button"
          role="menuitem"
          onClick={handleActivate}
          className="w-full px-4 py-2 text-left text-sm text-white hover:bg-tertiary first:rounded-t-md"
          data-testid="profile-action-activate"
        >
          {t(I18nKey.SETTINGS$PROFILE_ACTIVATE)}
        </button>
      )}
      <button
        type="button"
        role="menuitem"
        onClick={handleEdit}
        className="w-full px-4 py-2 text-left text-sm text-white hover:bg-tertiary"
        data-testid="profile-action-edit"
      >
        {t(I18nKey.SETTINGS$PROFILE_EDIT)}
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={handleRename}
        className="w-full px-4 py-2 text-left text-sm text-white hover:bg-tertiary"
        data-testid="profile-action-rename"
      >
        {t(I18nKey.SETTINGS$PROFILE_RENAME)}
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={handleDelete}
        className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-tertiary last:rounded-b-md"
        data-testid="profile-action-delete"
      >
        {t(I18nKey.SETTINGS$PROFILE_DELETE)}
      </button>
    </div>
  );
}
