import { useQueryClient } from "@tanstack/react-query";
import React, { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useSearchSecrets } from "#/hooks/query/use-get-secrets";
import { useDeleteSecret } from "#/hooks/mutation/use-delete-secret";
import { SecretForm } from "#/components/features/settings/secrets-settings/secret-form";
import {
  SecretListItem,
  SecretListItemSkeleton,
} from "#/components/features/settings/secrets-settings/secret-list-item";
import { BrandButton } from "#/components/features/settings/brand-button";
import { ConfirmationModal } from "#/components/shared/modals/confirmation-modal";
import { I18nKey } from "#/i18n/declaration";
import { LoadingSpinner } from "#/components/shared/loading-spinner";

export function SecretsSettingsScreen() {
  const queryClient = useQueryClient();
  const { t } = useTranslation("openhands");
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const {
    data: secrets,
    isLoading: isLoadingSecrets,
    hasNextPage,
    isFetchingNextPage,
    onLoadMore,
  } = useSearchSecrets();

  const { mutate: deleteSecret } = useDeleteSecret();

  const [view, setView] = React.useState<
    "list" | "add-secret-form" | "edit-secret-form"
  >("list");
  const [selectedSecret, setSelectedSecret] = React.useState<string | null>(
    null,
  );
  const [confirmationModalIsVisible, setConfirmationModalIsVisible] =
    React.useState(false);

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.currentTarget;
      const isNearBottom =
        target.scrollHeight - target.scrollTop <= target.clientHeight + 100;

      if (isNearBottom && hasNextPage && !isFetchingNextPage) {
        onLoadMore();
      }
    },
    [hasNextPage, isFetchingNextPage, onLoadMore],
  );

  const invalidateSecrets = () => {
    queryClient.invalidateQueries({
      queryKey: ["secrets-search"],
    });
    queryClient.invalidateQueries({
      queryKey: ["secrets"],
    });
  };

  const handleDeleteSecret = (secret: string) => {
    deleteSecret(secret, {
      onSettled: () => {
        setConfirmationModalIsVisible(false);
      },
      onSuccess: invalidateSecrets,
      onError: invalidateSecrets,
    });
  };

  const onConfirmDeleteSecret = () => {
    if (selectedSecret) handleDeleteSecret(selectedSecret);
  };

  const onCancelDeleteSecret = () => {
    setConfirmationModalIsVisible(false);
  };

  return (
    <div data-testid="secrets-settings-screen" className="flex flex-col gap-5">
      {isLoadingSecrets && view === "list" && (
        <ul>
          <SecretListItemSkeleton />
          <SecretListItemSkeleton />
          <SecretListItemSkeleton />
        </ul>
      )}

      {view === "list" && (
        <BrandButton
          testId="add-secret-button"
          type="button"
          variant="primary"
          onClick={() => setView("add-secret-form")}
          isDisabled={isLoadingSecrets}
        >
          {t("SECRETS$ADD_NEW_SECRET")}
        </BrandButton>
      )}

      {view === "list" && !isLoadingSecrets && (
        <div
          ref={tableContainerRef}
          className="border border-[var(--oh-border)] rounded-md overflow-auto max-h-[min(40vh,22rem)] bg-base-secondary"
          onScroll={handleScroll}
        >
          <table className="w-full min-w-full table-fixed">
            <thead className="bg-base-tertiary sticky top-0">
              <tr>
                <th className="w-1/4 px-3 py-2 text-left text-sm font-medium">
                  {t(I18nKey.SETTINGS$NAME)}
                </th>
                <th className="w-1/2 px-3 py-2 text-left text-sm font-medium">
                  {t(I18nKey.SECRETS$DESCRIPTION)}
                </th>
                <th className="w-1/4 px-3 py-2 text-right text-sm font-medium">
                  {t(I18nKey.SETTINGS$ACTIONS)}
                </th>
              </tr>
            </thead>
            <tbody>
              {secrets?.map((secret) => (
                <SecretListItem
                  key={secret.name}
                  title={secret.name}
                  description={secret.description}
                  onEdit={() => {
                    setView("edit-secret-form");
                    setSelectedSecret(secret.name);
                  }}
                  onDelete={() => {
                    setConfirmationModalIsVisible(true);
                    setSelectedSecret(secret.name);
                  }}
                />
              ))}
            </tbody>
          </table>

          {isFetchingNextPage && (
            <div className="flex justify-center p-4">
              <LoadingSpinner size="small" />
            </div>
          )}
        </div>
      )}

      {(view === "add-secret-form" || view === "edit-secret-form") && (
        <SecretForm
          mode={view === "add-secret-form" ? "add" : "edit"}
          selectedSecret={selectedSecret}
          onCancel={() => setView("list")}
        />
      )}

      {confirmationModalIsVisible && (
        <ConfirmationModal
          text={t("SECRETS$CONFIRM_DELETE_KEY")}
          onConfirm={onConfirmDeleteSecret}
          onCancel={onCancelDeleteSecret}
        />
      )}
    </div>
  );
}

export default SecretsSettingsScreen;
