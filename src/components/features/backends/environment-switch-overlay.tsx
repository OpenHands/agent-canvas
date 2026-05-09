import React from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";

export const ENVIRONMENT_SWITCH_DURATION_MS = 980;
export const ENVIRONMENT_SWITCH_SETACTIVE_DELAY_MS = 400;

// Module-level store. The overlay state must survive the unmount of the
// component that triggers a switch — the user-context menu remounts
// (`menuResetCount` key flip in user-actions.tsx) the moment the dropdown's
// portaled option list is clicked, because that click registers as outside
// the menu's `useClickOutsideElement` ref. If state lived inside
// BackendSelector, the trigger would fire and immediately get torn down
// before React paints the overlay.
interface EnvironmentSwitchSnapshot {
  visible: boolean;
  target: string;
}

let snapshot: EnvironmentSwitchSnapshot = { visible: false, target: "" };
const listeners = new Set<() => void>();
let hideTimeoutId: ReturnType<typeof setTimeout> | null = null;

function setSnapshot(next: EnvironmentSwitchSnapshot) {
  snapshot = next;
  if (typeof document !== "undefined") {
    if (next.visible) {
      document.body.setAttribute("data-environment-switching", "true");
    } else {
      document.body.removeAttribute("data-environment-switching");
    }
  }
  listeners.forEach((listener) => listener());
}

export function triggerEnvironmentSwitch(target: string) {
  setSnapshot({ visible: true, target });
  if (hideTimeoutId) clearTimeout(hideTimeoutId);
  hideTimeoutId = setTimeout(() => {
    setSnapshot({ visible: false, target: "" });
    hideTimeoutId = null;
  }, ENVIRONMENT_SWITCH_DURATION_MS);
}

export function dismissEnvironmentSwitch() {
  if (hideTimeoutId) {
    clearTimeout(hideTimeoutId);
    hideTimeoutId = null;
  }
  setSnapshot({ visible: false, target: "" });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return snapshot;
}

/** Test-only: clear the pending hide timer and reset the snapshot. */
// eslint-disable-next-line @typescript-eslint/naming-convention
export function __resetEnvironmentSwitchOverlayForTests() {
  if (hideTimeoutId) {
    clearTimeout(hideTimeoutId);
    hideTimeoutId = null;
  }
  setSnapshot({ visible: false, target: "" });
}

function EnvironmentSwitchIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 74.17 22"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <g>
        <rect
          x="1"
          y="1"
          width="20"
          height="8"
          rx="2"
          ry="2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <rect
          x="1"
          y="13"
          width="20"
          height="8"
          rx="2"
          ry="2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <line
          x1="5"
          y1="5"
          x2="5.01"
          y2="5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <line
          x1="5"
          y1="17"
          x2="5.01"
          y2="17"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </g>
      <g>
        <rect
          x="53.17"
          y="1"
          width="20"
          height="8"
          rx="2"
          ry="2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <rect
          x="53.17"
          y="13"
          width="20"
          height="8"
          rx="2"
          ry="2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <line
          x1="57.17"
          y1="5"
          x2="57.18"
          y2="5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <line
          x1="57.17"
          y1="17"
          x2="57.18"
          y2="17"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </g>
      <g>
        <path
          d="M43.09,7l4,4-4,4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M27.09,11h20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M31.09,7l-4,4,4,4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

export function EnvironmentSwitchOverlay() {
  const { t } = useTranslation("openhands");
  const { visible, target } = React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot,
  );

  if (!visible || typeof document === "undefined") return null;

  return createPortal(
    <div
      data-testid="environment-switch-overlay"
      data-target={target}
      className="environment-switch-overlay pointer-events-none fixed inset-0 z-[2147483646] flex items-center justify-center"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="pointer-events-none flex min-w-[280px] max-w-[420px] flex-col items-center gap-2 rounded-xl border border-border bg-card px-5 py-4 text-foreground shadow-2xl">
        <EnvironmentSwitchIcon className="mb-2 h-6 w-20 shrink-0 text-foreground" />
        <p className="text-center text-sm font-medium">
          {t(I18nKey.BACKEND$SWITCHING_TO, { environment: target })}
        </p>
      </div>
    </div>,
    document.body,
  );
}
