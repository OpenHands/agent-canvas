import React from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";

import { type Backend } from "#/api/backend-registry/types";
import { BrandButton } from "#/components/features/settings/brand-button";
import { ConfirmationModal } from "#/components/shared/modals/confirmation-modal";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import {
  MODAL_MAX_WIDTH_VIEWPORT,
  modalWidthClassName,
} from "#/components/shared/modals/modal-body";
import { ModalCloseButton } from "#/components/shared/modals/modal-close-button";
import { useActiveBackendContext } from "#/contexts/active-backend-context";
import { useBackendsHealth } from "#/hooks/query/use-backends-health";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { modalTitleLgClassName } from "#/utils/modal-classes";
import { BackendFormModal } from "./backend-form-modal";
import { BackendRow } from "./backend-row";

interface ManageBackendsModalProps {
  onClose: () => void;
  /**
   * Recovery mode is used by the root unavailable-backend gate. There is no
   * app shell behind the modal, so dismiss controls would be misleading.
   */
  recoveryMode?: boolean;
}

interface PendingRemoval {
  id: string;
  name: string;
}

export function ManageBackendsModal({
  onClose,
  recoveryMode = false,
}: ManageBackendsModalProps) {
  const { t } = useTranslation("openhands");
  const { backends, active, removeBackend, setActive } =
    useActiveBackendContext();
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

  const handleSelectBackend = React.useCallback(
    (backend: Backend) => {
      if (active.backend.id !== backend.id || active.orgId !== null) {
        setActive(backend.id);
      }
      onClose();
    },
    [active.backend.id, active.orgId, onClose, setActive],
  );

  return (
    <>
      <ModalBackdrop
        onClose={recoveryMode ? undefined : onClose}
        closeOnEscape={!recoveryMode}
        closeOnBackdropClick={!recoveryMode}
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
          {recoveryMode ? null : (
            <ModalCloseButton
              onClose={onClose}
              testId="close-manage-backends-modal"
            />
          )}
          <div className={cn("p-5", !recoveryMode && "pr-12")}>
            <h2 className={modalTitleLgClassName}>
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
                      onSelect={() => handleSelectBackend(backend)}
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
              variant={recoveryMode ? "primary" : "secondary"}
              onClick={() => setShowAddForm(true)}
              testId="manage-backends-add"
              startContent={<Plus width={14} height={14} />}
            >
              {t(I18nKey.BACKEND$ADD)}
            </BrandButton>
            {recoveryMode ? null : (
              <BrandButton
                type="button"
                variant="primary"
                onClick={onClose}
                testId="manage-backends-done"
              >
                {t(I18nKey.HOME$DONE)}
              </BrandButton>
            )}
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
