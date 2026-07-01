import React from "react";
import { useTranslation } from "react-i18next";
import { ExtensionsNavigation } from "#/components/features/skills/extensions-navigation";
import { InstallExtensionForm } from "#/components/features/extensions/install-extension-form";
import { ExtensionList } from "#/components/features/extensions/extension-list";
import { AddExtensionModal } from "#/components/features/extensions/add-extension-modal";
import { BrandButton } from "#/components/features/settings/brand-button";
import { useExtensionContext } from "#/components/providers/extension-manager-provider";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { settingsLikeMainScrollClassName } from "#/utils/settings-like-page-layout-classes";
import { extensionModuleEmptyStateClassName } from "#/utils/extension-module-card-classes";

export default function ExtensionsScreen() {
  const { t } = useTranslation("openhands");
  const context = useExtensionContext();
  const [showAddModal, setShowAddModal] = React.useState(false);
  const [showInlineInstall, setShowInlineInstall] = React.useState(false);

  return (
    <div
      data-testid="extensions-screen"
      className="flex h-full gap-4 md:gap-6 md:pl-8 lg:gap-10 lg:pl-10"
    >
      <ExtensionsNavigation />
      <main className={cn(settingsLikeMainScrollClassName, "h-full")}>
        <div className="mx-auto flex w-full min-w-0 max-w-[800px] flex-col gap-6">
          <div className="flex min-w-0 items-start justify-between gap-4">
            <div className="min-w-0 space-y-1">
              <h2 className="text-xl font-semibold leading-6 text-foreground">
                {t(I18nKey.EXTENSIONS$MANAGE_TITLE)}
              </h2>
              <div
                data-testid="extensions-description"
                className="max-w-2xl text-sm text-tertiary-light"
              >
                {t(I18nKey.EXTENSIONS$MANAGE_DESCRIPTION)}
              </div>
            </div>
            {context ? (
              <div className="flex flex-shrink-0 gap-2">
                <BrandButton
                  type="button"
                  variant="secondary"
                  testId="extensions-inline-add-button"
                  className="whitespace-nowrap"
                  onClick={() => setShowInlineInstall(!showInlineInstall)}
                >
                  {showInlineInstall
                    ? t(I18nKey.BUTTON$CLOSE)
                    : t(I18nKey.EXTENSIONS$ADD_BUTTON)}
                </BrandButton>
                <BrandButton
                  type="button"
                  variant="secondary"
                  testId="extensions-add-button"
                  className="whitespace-nowrap"
                  onClick={() => setShowAddModal(true)}
                >
                  {t(I18nKey.EXTENSIONS$TAB_MARKETPLACE)}
                </BrandButton>
              </div>
            ) : null}
          </div>

          {!context ? (
            <div
              data-testid="extensions-disabled"
              className={extensionModuleEmptyStateClassName}
            >
              <p className="text-sm text-tertiary-light">
                {t(I18nKey.EXTENSIONS$DISABLED_NOTICE)}
              </p>
            </div>
          ) : (
            <>
              {showInlineInstall && (
                <InstallExtensionForm
                  onInstallComplete={() => setShowInlineInstall(false)}
                />
              )}
              <ExtensionList />
            </>
          )}

          {showAddModal && (
            <AddExtensionModal onClose={() => setShowAddModal(false)} />
          )}
        </div>
      </main>
    </div>
  );
}
