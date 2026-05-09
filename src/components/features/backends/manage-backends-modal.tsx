import React from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";

import { type Backend } from "#/api/backend-registry/types";
import { createServerClient } from "#/api/typescript-client";
import { BrandButton } from "#/components/features/settings/brand-button";
import { ConfirmationModal } from "#/components/shared/modals/confirmation-modal";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { useActiveBackendContext } from "#/contexts/active-backend-context";
import CloseIcon from "#/icons/close.svg?react";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";

function BackendVersion({ backend }: { backend: Backend }) {
  const { t } = useTranslation("openhands");
  const { data: version } = useQuery({
    queryKey: ["backend-version", backend.host, backend.apiKey],
    queryFn: async () => {
      const info = await createServerClient({
        host: backend.host,
        sessionApiKey: backend.apiKey || null,
        timeout: 5000,
      }).getServerInfo();
      return info.version ?? null;
    },
    retry: false,
    staleTime: 60_000,
    enabled: backend.kind === "local",
  });

  if (!version) return null;

  return (
    <span
      className="text-xs text-[#7E848C] truncate"
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

export function ManageBackendsModal({ onClose }: ManageBackendsModalProps) {
  const { t } = useTranslation("openhands");
  const { backends, removeBackend } = useActiveBackendContext();
  const [pendingRemoval, setPendingRemoval] =
    React.useState<PendingRemoval | null>(null);

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
            "flex flex-col bg-[#26282D] border border-[#727987] rounded-xl",
            "w-[560px] max-w-[90vw] max-h-[70vh]",
          )}
        >
          <div className="flex items-center justify-between px-5 py-3 border-b border-[#727987]">
            <span className="text-sm font-semibold text-white">
              {t(I18nKey.BACKEND$MANAGE_TITLE)}
            </span>
          </div>

          <div
            className="flex-1 overflow-auto custom-scrollbar-always"
            data-testid="manage-backends-list"
          >
            {backends.length === 0 ? (
              <p className="px-5 py-6 text-sm text-[#B7BDC2] text-center">
                {t(I18nKey.BACKEND$MANAGE_EMPTY)}
              </p>
            ) : (
              <ul>
                {backends.map((backend) => (
                  <li
                    key={backend.id}
                    className="flex items-center gap-3 px-5 py-3 border-b border-[#363840] last:border-b-0"
                    data-testid={`manage-backends-row-${backend.name}`}
                  >
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-sm text-white truncate">
                        {backend.name}
                      </span>
                      <span className="text-xs text-[#A3A3A3] truncate">
                        {backend.host}
                      </span>
                      <BackendVersion backend={backend} />
                    </div>
                    <span className="px-2 py-1 rounded-full text-[11px] uppercase tracking-wide text-[#D6D6D6] bg-[#1F1F1F] border border-[#4B4E57]">
                      {backend.kind === "cloud"
                        ? t(I18nKey.BACKEND$KIND_CLOUD)
                        : t(I18nKey.BACKEND$KIND_LOCAL)}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setPendingRemoval({
                          id: backend.id,
                          name: backend.name,
                        })
                      }
                      aria-label={t(I18nKey.BACKEND$REMOVE)}
                      data-testid={`manage-backends-remove-${backend.name}`}
                      className="flex items-center gap-1 px-2 py-1 rounded text-xs text-[#D6D6D6] hover:bg-[#5C5D62] hover:text-white cursor-pointer"
                    >
                      <CloseIcon width={12} height={12} />
                      <span>{t(I18nKey.BACKEND$REMOVE)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex justify-end gap-2 px-5 py-3 border-t border-[#727987]">
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
