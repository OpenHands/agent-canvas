import React from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { ServerClient } from "@openhands/typescript-client/clients";
import { type Backend } from "#/api/backend-registry/types";
import { getAgentServerClientOptions } from "#/api/agent-server-client-options";
import { BrandButton } from "#/components/features/settings/brand-button";
import { ConfirmationModal } from "#/components/shared/modals/confirmation-modal";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import {
  MODAL_MAX_WIDTH_VIEWPORT,
  modalWidthClassName,
} from "#/components/shared/modals/modal-body";
import { ModalCloseButton } from "#/components/shared/modals/modal-close-button";
import { useActiveBackendContext } from "#/contexts/active-backend-context";
import {
  useBackendsHealth,
  type BackendHealth,
} from "#/hooks/query/use-backends-health";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { BackendFormModal } from "./backend-form-modal";
import { BackendStatusDot } from "./backend-status-dot";

const ROW_ACTION_BUTTON_CLASS =
  "inline-flex cursor-pointer items-center justify-center rounded-md p-1 text-muted transition-colors hover:bg-interactive-hover hover:text-white";

function BackendVersion({ backend }: { backend: Backend }) {
  const { t } = useTranslation("openhands");
  const { data: version } = useQuery({
    queryKey: ["backend-version", backend.host, backend.apiKey],
    queryFn: async () => {
      const info = await new ServerClient(
        getAgentServerClientOptions({
          host: backend.host,
          sessionApiKey: backend.apiKey || null,
          timeout: 5000,
        }),
      ).getServerInfo();
      return info.version ?? null;
    },
    retry: false,
    staleTime: 60_000,
    enabled: backend.kind === "local",
  });

  if (!version) return null;

  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full border border-[var(--oh-border)] bg-[var(--oh-surface)] px-1.5 py-0.5 text-[10px] font-medium leading-none text-[var(--oh-text-dim)]"
      data-testid={`manage-backends-version-${backend.name}`}
    >
      {t(I18nKey.BACKEND$VERSION_LABEL, { version })}
    </span>
  );
}

interface ManageBackendsModalProps {
  onClose: () => void;
}

interface PendingRemoval {
  id: string;
  name: string;
}

interface BackendRowProps {
  backend: Backend;
  health: BackendHealth | undefined;
  onEdit: () => void;
  onRemove: () => void;
}

function BackendRow({ backend, health, onEdit, onRemove }: BackendRowProps) {
  const { t } = useTranslation("openhands");

  return (
    <li
      className="flex items-center gap-3 px-3 py-3"
      data-testid={`manage-backends-row-${backend.name}`}
    >
      <BackendStatusDot isConnected={health?.isConnected ?? null} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm text-white">{backend.name}</span>
          <BackendVersion backend={backend} />
        </div>
        <span className="truncate text-xs text-[var(--oh-muted)]">
          {backend.host}
        </span>
      </div>
      <span className="px-2 py-1 rounded-full text-[11px] uppercase tracking-wide text-[var(--oh-text-tertiary)] bg-[var(--oh-surface)] border border-[var(--oh-border)]">
        {backend.kind === "cloud"
          ? t(I18nKey.BACKEND$KIND_CLOUD)
          : t(I18nKey.BACKEND$KIND_LOCAL)}
      </span>
      <div className="flex shrink-0 items-center gap-0.5">
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

export function ManageBackendsModal({ onClose }: ManageBackendsModalProps) {
  const { t } = useTranslation("openhands");
  const { backends, removeBackend } = useActiveBackendContext();
  const healthByBackendId = useBackendsHealth(backends, {
    probeDisabledOnce: true,
  });
  const [pendingRemoval, setPendingRemoval] =
    React.useState<PendingRemoval | null>(null);
  const [editingBackend, setEditingBackend] = React.useState<Backend | null>(
    null,
  );
  const [showAddForm, setShowAddForm] = React.useState(false);

  const handleConfirmRemoval = () => {
    if (!pendingRemoval) return;
    removeBackend(pendingRemoval.id);
    setPendingRemoval(null);
  };

  return (
    <>
      <ModalBackdrop
        onClose={onClose}
        aria-label={t(I18nKey.BACKEND$MANAGE_TITLE)}
      >
        <div
          data-testid="manage-backends-modal"
          className={cn(
            "relative flex flex-col bg-[var(--oh-surface)] border border-[var(--oh-border)] rounded-xl",
            modalWidthClassName("lg"),
            MODAL_MAX_WIDTH_VIEWPORT,
            "max-h-[70vh]",
          )}
        >
          <ModalCloseButton
            onClose={onClose}
            testId="close-manage-backends-modal"
          />
          <div className="p-5 pr-12">
            <h2 className="text-lg font-semibold">
              {t(I18nKey.BACKEND$MANAGE_TITLE)}
            </h2>
          </div>

          <div className="flex min-h-0 flex-1 flex-col px-5">
            <div
              className="flex-1 overflow-auto rounded-md border border-[var(--oh-border)] bg-surface-raised custom-scrollbar-always"
              data-testid="manage-backends-list"
            >
              {backends.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-[var(--oh-text-secondary)]">
                  {t(I18nKey.BACKEND$MANAGE_EMPTY)}
                </p>
              ) : (
                <ul className="divide-y divide-[var(--oh-border)]">
                  {backends.map((backend) => (
                    <BackendRow
                      key={backend.id}
                      backend={backend}
                      health={healthByBackendId[backend.id]}
                      onEdit={() => setEditingBackend(backend)}
                      onRemove={() =>
                        setPendingRemoval({
                          id: backend.id,
                          name: backend.name,
                        })
                      }
                    />
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 p-5">
            <BrandButton
              type="button"
              variant="secondary"
              onClick={() => setShowAddForm(true)}
              testId="manage-backends-add"
              startContent={<Plus width={14} height={14} />}
            >
              {t(I18nKey.BACKEND$ADD)}
            </BrandButton>
            <BrandButton
              type="button"
              variant="primary"
              onClick={onClose}
              testId="manage-backends-done"
            >
              {t(I18nKey.HOME$DONE)}
            </BrandButton>
          </div>
        </div>
      </ModalBackdrop>

      {showAddForm ? (
        <BackendFormModal mode="add" onClose={() => setShowAddForm(false)} />
      ) : null}

      {editingBackend ? (
        <BackendFormModal
          mode="edit"
          backend={editingBackend}
          onClose={() => setEditingBackend(null)}
        />
      ) : null}

      {pendingRemoval ? (
        <ConfirmationModal
          text={t(I18nKey.BACKEND$REMOVE_CONFIRMATION, {
            name: pendingRemoval.name,
          })}
          onConfirm={handleConfirmRemoval}
          onCancel={() => setPendingRemoval(null)}
        />
      ) : null}
    </>
  );
}
