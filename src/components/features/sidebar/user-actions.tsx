import React from "react";
import { UserAvatar } from "./user-avatar";
import { UserContextMenu } from "../user/user-context-menu";
import { AddBackendModal } from "../backends/add-backend-modal";
import { cn } from "#/utils/utils";

interface UserActionsProps {
  user?: { avatar_url: string };
  isLoading?: boolean;
}

export function UserActions({ user, isLoading }: UserActionsProps) {
  const [accountContextMenuIsVisible, setAccountContextMenuIsVisible] =
    React.useState(false);
  const [menuResetCount, setMenuResetCount] = React.useState(0);
  const [addBackendModalOpen, setAddBackendModalOpen] = React.useState(false);
  const hideTimeoutRef = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    },
    [],
  );

  const showAccountMenu = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    setAccountContextMenuIsVisible(true);
  };

  const hideAccountMenu = () => {
    // Don't auto-hide while the Add Backend modal is open — the user is
    // interacting with content outside the menu's hover area.
    if (addBackendModalOpen) return;
    hideTimeoutRef.current = window.setTimeout(() => {
      setAccountContextMenuIsVisible(false);
      setMenuResetCount((c) => c + 1);
    }, 500);
  };

  const closeAccountMenu = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    if (accountContextMenuIsVisible) {
      setAccountContextMenuIsVisible(false);
      setMenuResetCount((c) => c + 1);
    }
  };

  const openAddBackendModal = () => {
    closeAccountMenu();
    setAddBackendModalOpen(true);
  };

  return (
    <div
      data-testid="user-actions"
      className="relative cursor-pointer group"
      onMouseEnter={showAccountMenu}
      onMouseLeave={hideAccountMenu}
    >
      <UserAvatar avatarUrl={user?.avatar_url} isLoading={isLoading} />

      <div
        data-testid="user-context-menu-wrapper"
        className={cn(
          "opacity-0 pointer-events-none",
          // Suppress hover-visible behavior whenever the Add Backend modal
          // is open so the menu doesn't bleed through behind the dialog.
          !addBackendModalOpen &&
            "group-hover:opacity-100 group-hover:pointer-events-auto",
          accountContextMenuIsVisible &&
            !addBackendModalOpen &&
            "opacity-100 pointer-events-auto",
        )}
      >
        <UserContextMenu
          key={menuResetCount}
          onClose={closeAccountMenu}
          onOpenAddBackend={openAddBackendModal}
        />
      </div>

      {addBackendModalOpen ? (
        <AddBackendModal onClose={() => setAddBackendModalOpen(false)} />
      ) : null}
    </div>
  );
}
