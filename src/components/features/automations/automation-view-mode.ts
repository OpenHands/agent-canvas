export type AutomationViewMode = "grid" | "list";

export const AUTOMATIONS_VIEW_MODE_STORAGE_KEY = "openhands-automations-view";

export function readStoredAutomationViewMode(): AutomationViewMode {
  if (typeof window === "undefined") {
    return "grid";
  }

  const stored = window.localStorage.getItem(AUTOMATIONS_VIEW_MODE_STORAGE_KEY);
  return stored === "list" ? "list" : "grid";
}

export function writeStoredAutomationViewMode(view: AutomationViewMode): void {
  window.localStorage.setItem(AUTOMATIONS_VIEW_MODE_STORAGE_KEY, view);
}

export const automationListTableClassName =
  "overflow-hidden rounded-md border border-[var(--oh-border)] bg-base-secondary";

export const automationListRowClassName =
  "border-t border-[var(--oh-border)] transition-colors hover:bg-base-tertiary focus-visible:outline-none focus-visible:bg-base-tertiary";
