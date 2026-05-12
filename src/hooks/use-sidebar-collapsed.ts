import React from "react";

const STORAGE_KEY = "openhands-sidebar-collapsed";

const readPersisted = (): boolean => {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
};

/**
 * Persisted boolean for whether the desktop sidebar is collapsed to the
 * icon-only rail. The value is stored in localStorage so the user's choice
 * survives reloads.
 */
export function useSidebarCollapsedState(): readonly [
  boolean,
  (next: boolean | ((prev: boolean) => boolean)) => void,
] {
  const [collapsed, setCollapsed] = React.useState<boolean>(readPersisted);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, collapsed ? "true" : "false");
    } catch {
      // ignore quota / privacy-mode failures; the in-memory state is still fine
    }
  }, [collapsed]);

  return [collapsed, setCollapsed] as const;
}
