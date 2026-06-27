import React from "react";
import { useTranslation } from "react-i18next";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { ModalCloseButton } from "#/components/shared/modals/modal-close-button";
import { BrandButton } from "#/components/features/settings/brand-button";
import { SettingsInput } from "#/components/features/settings/settings-input";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { modalTitleLgClassName } from "#/utils/modal-classes";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import type { ManifestPreview } from "#/extensions/installed-store";
import type { UiExtensionListing } from "#/extensions/marketplace/client";
import { useExtensionContext } from "#/components/providers/extension-manager-provider";
import { capabilityLabelKey } from "./capability-labels";

interface AddExtensionModalProps {
  onClose: () => void;
}

type Mode = "url" | "marketplace";

/**
 * Two-step install with capability consent: pick a source (a bundle URL / git repo, or
 * a UI extension from a plugin marketplace), then review the permissions the manifest
 * requests before granting them. Nothing is installed until the user confirms in the
 * review step, matching VS Code's all-or-nothing consent.
 */
export function AddExtensionModal({ onClose }: AddExtensionModalProps) {
  const { t } = useTranslation("openhands");
  const context = useExtensionContext();

  const [mode, setMode] = React.useState<Mode>("url");
  const [source, setSource] = React.useState("");
  const [marketplaceSource, setMarketplaceSource] = React.useState("");
  const [listings, setListings] = React.useState<UiExtensionListing[] | null>(
    null,
  );
  const [target, setTarget] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<ManifestPreview | null>(null);
  const [isPending, setIsPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const trimmedSource = source.trim();
  const trimmedMarketplace = marketplaceSource.trim();

  if (!context) return null;
  const { previewManifest, installFromUrl, fetchMarketplace } = context;

  const switchMode = (next: Mode) => {
    setMode(next);
    setPreview(null);
    setTarget(null);
    setListings(null);
    setError(null);
  };

  const reviewTarget = async (bundleUrl: string) => {
    if (isPending) return;
    setIsPending(true);
    setError(null);
    try {
      const result = await previewManifest(bundleUrl);
      setTarget(bundleUrl);
      setPreview(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsPending(false);
    }
  };

  const handleBrowse = async () => {
    if (trimmedMarketplace.length === 0 || isPending) return;
    setIsPending(true);
    setError(null);
    try {
      const result = await fetchMarketplace(trimmedMarketplace);
      setListings(result.listings);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsPending(false);
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (mode === "url") {
      if (trimmedSource.length > 0) reviewTarget(trimmedSource);
    } else {
      handleBrowse();
    }
  };

  const handleInstall = async () => {
    if (isPending || !target) return;
    setIsPending(true);
    setError(null);
    try {
      await installFromUrl(target);
      displaySuccessToast(t(I18nKey.EXTENSIONS$INSTALL_SUCCESS));
      onClose();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      displayErrorToast(message);
    } finally {
      setIsPending(false);
    }
  };

  const tabButtonClass = (active: boolean) =>
    cn(
      "rounded-md px-3 py-1.5 text-xs font-medium",
      active
        ? "bg-base-tertiary text-white"
        : "text-tertiary-light hover:text-white",
    );

  return (
    <ModalBackdrop
      onClose={onClose}
      aria-label={t(I18nKey.EXTENSIONS$ADD_MODAL_TITLE)}
    >
      <form
        onSubmit={handleSubmit}
        data-testid="add-extension-modal"
        className="relative flex w-[520px] max-w-[90vw] max-h-[85vh] flex-col rounded-xl border border-[var(--oh-border)] bg-base-secondary"
      >
        <ModalCloseButton
          onClose={onClose}
          testId="add-extension-modal-close"
        />

        <header className="flex-shrink-0 px-6 pb-4 pt-6">
          <h2 className={cn("pr-6", modalTitleLgClassName)}>
            {t(I18nKey.EXTENSIONS$ADD_MODAL_TITLE)}
          </h2>
          <p className="mt-4 text-sm text-tertiary-light">
            {t(I18nKey.EXTENSIONS$ADD_MODAL_INTRO)}
          </p>
          {!preview ? (
            <div className="mt-4 flex gap-1" role="tablist">
              <button
                type="button"
                role="tab"
                data-testid="add-extension-tab-url"
                aria-selected={mode === "url"}
                className={tabButtonClass(mode === "url")}
                onClick={() => switchMode("url")}
              >
                {t(I18nKey.EXTENSIONS$TAB_URL)}
              </button>
              <button
                type="button"
                role="tab"
                data-testid="add-extension-tab-marketplace"
                aria-selected={mode === "marketplace"}
                className={tabButtonClass(mode === "marketplace")}
                onClick={() => switchMode("marketplace")}
              >
                {t(I18nKey.EXTENSIONS$TAB_MARKETPLACE)}
              </button>
            </div>
          ) : null}
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 custom-scrollbar">
          {!preview && mode === "url" ? (
            <SettingsInput
              testId="add-extension-source-input"
              label={t(I18nKey.EXTENSIONS$SOURCE_LABEL)}
              type="text"
              value={source}
              onChange={(value) => {
                setSource(value);
                setError(null);
              }}
              placeholder={t(I18nKey.EXTENSIONS$SOURCE_PLACEHOLDER)}
              showRequiredTag
            />
          ) : null}

          {!preview && mode === "marketplace" ? (
            <>
              <SettingsInput
                testId="add-extension-marketplace-input"
                label={t(I18nKey.EXTENSIONS$MARKETPLACE_LABEL)}
                type="text"
                value={marketplaceSource}
                onChange={(value) => {
                  setMarketplaceSource(value);
                  setListings(null);
                  setError(null);
                }}
                placeholder={t(I18nKey.EXTENSIONS$MARKETPLACE_PLACEHOLDER)}
                showRequiredTag
              />
              {listings !== null ? (
                <ul
                  data-testid="marketplace-listings"
                  className="flex flex-col gap-2"
                >
                  {listings.length === 0 ? (
                    <li className="text-xs text-tertiary-alt">
                      {t(I18nKey.EXTENSIONS$MARKETPLACE_EMPTY)}
                    </li>
                  ) : (
                    listings.map((listing) => (
                      <li key={listing.installSource}>
                        <button
                          type="button"
                          data-testid={`marketplace-listing-${listing.name}`}
                          disabled={isPending}
                          onClick={() => reviewTarget(listing.installSource)}
                          className="w-full rounded-lg border border-[var(--oh-border)] p-3 text-left hover:border-primary disabled:opacity-50"
                        >
                          <span className="block truncate text-sm font-medium text-white">
                            {listing.name}
                          </span>
                          {listing.description ? (
                            <span className="block truncate text-xs text-tertiary-alt">
                              {listing.description}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              ) : null}
            </>
          ) : null}

          {preview ? (
            <section
              data-testid="extension-permissions"
              className="flex flex-col gap-2 rounded-lg border border-[var(--oh-border)] p-4"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">
                  {preview.name}
                </p>
                <p className="truncate text-xs text-tertiary-alt">
                  {t(I18nKey.SETTINGS$SKILLS_VERSION, {
                    version: preview.version,
                  })}
                </p>
              </div>
              <span className="text-xs font-medium text-tertiary-light">
                {t(I18nKey.EXTENSIONS$PERMISSIONS_TITLE)}
              </span>
              {preview.capabilities.length === 0 ? (
                <span className="text-xs text-tertiary-alt">
                  {t(I18nKey.EXTENSIONS$NO_PERMISSIONS)}
                </span>
              ) : (
                <ul className="flex flex-col gap-1">
                  {preview.capabilities.map((capability) => (
                    <li
                      key={capability}
                      className="text-xs text-tertiary-light"
                      title={capability}
                    >
                      • {t(capabilityLabelKey(capability))}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          {error ? (
            <p
              data-testid="add-extension-error"
              className="text-xs text-danger"
            >
              {error}
            </p>
          ) : null}
        </div>

        <footer className="flex flex-shrink-0 justify-end gap-2 px-6 pb-6 pt-4">
          {preview ? (
            <>
              <BrandButton
                type="button"
                variant="secondary"
                testId="add-extension-back"
                isDisabled={isPending}
                onClick={() => {
                  setPreview(null);
                  setTarget(null);
                }}
              >
                {t(I18nKey.EXTENSIONS$BACK_BUTTON)}
              </BrandButton>
              <BrandButton
                type="button"
                variant="primary"
                testId="add-extension-install"
                isDisabled={isPending}
                onClick={handleInstall}
              >
                {t(
                  isPending
                    ? I18nKey.EXTENSIONS$INSTALLING
                    : I18nKey.EXTENSIONS$INSTALL_BUTTON,
                )}
              </BrandButton>
            </>
          ) : (
            <>
              <BrandButton
                type="button"
                variant="secondary"
                testId="add-extension-dismiss"
                onClick={onClose}
              >
                {t(I18nKey.BUTTON$CLOSE)}
              </BrandButton>
              {mode === "url" ? (
                <BrandButton
                  type="submit"
                  variant="primary"
                  testId="add-extension-review"
                  isDisabled={trimmedSource.length === 0 || isPending}
                >
                  {t(
                    isPending
                      ? I18nKey.EXTENSIONS$REVIEWING
                      : I18nKey.EXTENSIONS$REVIEW_BUTTON,
                  )}
                </BrandButton>
              ) : (
                <BrandButton
                  type="submit"
                  variant="primary"
                  testId="add-extension-browse"
                  isDisabled={trimmedMarketplace.length === 0 || isPending}
                >
                  {t(
                    isPending
                      ? I18nKey.EXTENSIONS$MARKETPLACE_LOADING
                      : I18nKey.EXTENSIONS$MARKETPLACE_LOAD,
                  )}
                </BrandButton>
              )}
            </>
          )}
        </footer>
      </form>
    </ModalBackdrop>
  );
}
