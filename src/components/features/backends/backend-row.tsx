import { useTranslation } from "react-i18next";
import { Pencil, Trash2 } from "lucide-react";

import { type Backend } from "#/api/backend-registry/types";
import {
  isInvalidBackendApiKeyHealthError,
  type BackendHealth,
} from "#/hooks/query/use-backends-health";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { BackendStatusDot } from "./backend-status-dot";
import { BackendVersion } from "./backend-version";

const ROW_ACTION_BUTTON_CLASS =
  "inline-flex cursor-pointer items-center justify-center rounded-md p-1 text-muted transition-colors hover:bg-interactive-hover hover:text-white";

interface BackendRowProps {
  backend: Backend;
  health: BackendHealth | undefined;
  onSelect: () => void;
  onEdit: () => void;
  onRemove: () => void;
}

export function BackendRow({
  backend,
  health,
  onSelect,
  onEdit,
  onRemove,
}: BackendRowProps) {
  const { t } = useTranslation("openhands");
  const isInvalidApiKey = isInvalidBackendApiKeyHealthError(health?.lastError);
  const statusDetail =
    !isInvalidApiKey && health?.isConnected === false && health.lastError
      ? health.lastError
      : null;
  let statusLabel: string;
  let statusClassName = "text-[var(--oh-muted)]";

  if (isInvalidApiKey) {
    statusLabel = t(I18nKey.AUTH$INVALID_KEY);
    statusClassName = "text-red-300";
  } else if (health?.isConnected === true) {
    statusLabel = t(I18nKey.ONBOARDING$BACKEND_STATUS_CONNECTED);
    statusClassName = "text-green-300";
  } else if (health?.isConnected === false) {
    statusLabel = t(I18nKey.ONBOARDING$BACKEND_STATUS_DISCONNECTED);
    statusClassName = "text-red-300";
  } else {
    statusLabel = t(I18nKey.ONBOARDING$BACKEND_STATUS_CHECKING);
  }
  const dotStatus = isInvalidApiKey ? false : (health?.isConnected ?? null);
  const canSelect = health?.isConnected === true && !isInvalidApiKey;

  return (
    <li
      className="flex items-stretch"
      data-testid={`manage-backends-row-${backend.name}`}
    >
      <button
        type="button"
        disabled={!canSelect}
        onClick={onSelect}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left",
          canSelect
            ? "cursor-pointer transition-colors hover:bg-interactive-hover focus-visible:bg-interactive-hover focus-visible:outline-none"
            : "cursor-default",
        )}
      >
        <BackendStatusDot isConnected={dotStatus} />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm text-white">{backend.name}</span>
            <BackendVersion backend={backend} />
          </div>
          <span className="truncate text-xs text-[var(--oh-muted)]">
            {backend.host}
          </span>
          <span
            data-testid={`manage-backends-status-${backend.name}`}
            className={cn("truncate text-xs", statusClassName)}
          >
            {statusLabel}
          </span>
          {statusDetail ? (
            <span
              data-testid={`manage-backends-status-detail-${backend.name}`}
              title={statusDetail}
              className="text-xs text-red-300/80 whitespace-normal break-words"
            >
              {statusDetail}
            </span>
          ) : null}
        </div>
        <span className="px-2 py-1 rounded-full text-[11px] uppercase tracking-wide text-[var(--oh-text-tertiary)] bg-[var(--oh-surface)] border border-[var(--oh-border)]">
          {backend.kind === "cloud"
            ? t(I18nKey.BACKEND$KIND_CLOUD)
            : t(I18nKey.BACKEND$KIND_LOCAL)}
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-0.5 px-3 py-3">
        <button
          type="button"
          onClick={onEdit}
          aria-label={t(I18nKey.BACKEND$EDIT)}
          data-testid={`manage-backends-edit-${backend.name}`}
          className={ROW_ACTION_BUTTON_CLASS}
        >
          <Pencil aria-hidden className="size-4" strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={t(I18nKey.BACKEND$REMOVE)}
          data-testid={`manage-backends-remove-${backend.name}`}
          className={ROW_ACTION_BUTTON_CLASS}
        >
          <Trash2 aria-hidden className="size-4" strokeWidth={2} />
        </button>
      </div>
    </li>
  );
}
