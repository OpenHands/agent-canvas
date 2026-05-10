import React from "react";

/**
 * Lightweight context exposing the sidebar's collapsed state to descendant
 * components (e.g. the conversation list and the "+ New" button) so they can
 * render a compact icon-only variant when the parent sidebar is collapsed.
 */
export const SidebarCollapseContext = React.createContext<boolean>(false);

export const useSidebarCollapsed = (): boolean =>
  React.useContext(SidebarCollapseContext);
