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
import type { MarketplaceResult } from "#/extensions/marketplace/client";
import { useExtensionContext } from "#/components/providers/extension-manager-provider";
import { parseSourceRef } from "#/extensions/sources/ref";
import type {
  ExtensionSourceRef,
  GithubSourceRef,
} from "#/extensions/sources/ref";
import { capabilityLabelKey } from "./capability-labels";

interface AddExtensionModalProps {
  onClose: () => void;
}

/**
 * A single **auto-detecting** install flow with capability consent. The user pastes one
 * source (npm ref, `github:` ref, or bundle URL); on submit we probe the conventional
 * locations in parallel and classify the result by JSON shape:
 *
 * - a single extension manifest → straight to the capability-consent card;
 * - a marketplace catalog → the listing picker (a one-entry catalog skips the list and
 *   forwards to that entry's consent card);
 * - neither → a clear error.
 *
 * Detection changes *routing* only — every path, including the single-entry fast path,
 * routes through the consent card before anything is installed. This replaces the old
 * inline form + two-tab modal, which were the same flow implemented three times.
 */

type Phase =
  | { step: "input" }
  | { step: "detecting" }
  | { step: "listing"; result: MarketplaceResult }
  | { step: "reviewing"; installSource: string; preview: ManifestPreview }
  | { step: "installing"; installSource: string; preview: ManifestPreview };

function getRefTypeI18nKey(kind: ExtensionSourceRef["kind"]): I18nKey {
  switch (kind) {
    case "npm":
      return I18nKey.EXTENSIONS$REF_TYPE_NPM;
    case "gh":
      return I18nKey.EXTENSIONS$REF_TYPE_GH;
    case "url":
      return I18nKey.EXTENSIONS$REF_TYPE_URL;
  }
}

/** Parse the source for the live type badge; returns null while it is not yet valid. */
function tryParse(input: string): ExtensionSourceRef | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    return parseSourceRef(trimmed);
  } catch {
    return null;
  }
}

export function AddExtensionModal({ onClose }: AddExtensionModalProps) {
  const { t } = useTranslation("openhands");
  const context = useExtensionContext();

  const [source, setSource] = React.useState("");
  const [phase, setPhase] = React.useState<Phase>({ step: "input" });
  const [error, setError] = React.useState<string | null>(null);

  const trimmedSource = source.trim();
  const parsed = React.useMemo(() => tryParse(source), [source]);

  if (!context) return null;
  const { detectSource, previewManifest, installFromUrl } = context;

  const isBusy = phase.step === "detecting" || phase.step === "installing";

  const handleDetect = async () => {
    if (trimmedSource.length === 0 || isBusy) return;
    setError(null);
    setPhase({ step: "detecting" });
    try {
      const detection = await detectSource(trimmedSource);
      if (detection.kind === "manifest") {
        setPhase({
          step: "reviewing",
          installSource: detection.installSource,
          preview: detection.preview,
        });
      } else if (detection.kind === "catalog") {
        setPhase({ step: "listing", result: detection.result });
      } else {
        setPhase({ step: "input" });
        setError(t(I18nKey.EXTENSIONS$DETECT_NONE, { source: trimmedSource }));
      }
    } catch (e) {
      setPhase({ step: "input" });
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const reviewListing = async (installSource: string) => {
    if (isBusy) return;
    setError(null);
    const previousResult = phase.step === "listing" ? phase.result : undefined;
    setPhase({ step: "detecting" });
    try {
      const preview = await previewManifest(installSource);
      setPhase({ step: "reviewing", installSource, preview });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      // Return to the listing so the user can pick another entry.
      if (previousResult) {
        setPhase({ step: "listing", result: previousResult });
      } else {
        setPhase({ step: "input" });
      }
    }
  };

  const handleInstall = async () => {
    if (phase.step !== "reviewing") return;
    const { installSource, preview } = phase;
    setPhase({ step: "installing", installSource, preview });
    setError(null);
    try {
      await installFromUrl(installSource);
      displaySuccessToast(t(I18nKey.EXTENSIONS$INSTALL_SUCCESS));
      onClose();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      displayErrorToast(message);
      setPhase({ step: "reviewing", installSource, preview });
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (phase.step === "input") handleDetect();
  };

  const backToInput = () => {
    setError(null);
    setPhase({ step: "input" });
  };

  const preview =
    phase.step === "reviewing" || phase.step === "installing"
      ? phase.preview
      : null;

  const renderTypeBadge = () => {
    if (!trimmedSource) return null;
    if (!parsed) {
      return (
        <div
          data-testid="source-validation-invalid"
          className="mt-1 flex items-center gap-1.5 text-xs text-danger"
        >
          <span className="inline-block h-2 w-2 rounded-full bg-danger" />
          <span>{t(I18nKey.EXTENSIONS$SOURCE_INVALID)}</span>
        </div>
      );
    }
    return (
      <div
        data-testid="source-validation-valid"
        className="mt-1 flex items-center gap-1.5 text-xs text-success"
      >
        <span className="inline-block h-2 w-2 rounded-full bg-success" />
        <span>{t(getRefTypeI18nKey(parsed.kind))}</span>
        {parsed.kind === "gh" && (
          <span className="text-tertiary-alt">
            {(parsed as GithubSourceRef).owner}/
            {(parsed as GithubSourceRef).repo}
          </span>
        )}
      </div>
    );
  };

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
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 custom-scrollbar">
          {!preview && phase.step !== "listing" ? (
            <div className="flex flex-col gap-1.5">
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
                isDisabled={isBusy}
                showRequiredTag
              />
              {renderTypeBadge()}
              <p
                data-testid="add-extension-source-help"
                className="text-xs text-tertiary-alt"
              >
                {t(I18nKey.EXTENSIONS$SOURCE_HELP)}
              </p>
            </div>
          ) : null}

          {phase.step === "detecting" ? (
            <div
              data-testid="add-extension-detecting"
              className="flex items-center gap-2 text-sm text-tertiary-light"
            >
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span>
                {t(I18nKey.EXTENSIONS$DETECT_INSPECTING, {
                  source: trimmedSource,
                })}
              </span>
            </div>
          ) : null}

          {phase.step === "listing" ? (
            <>
              <p
                data-testid="marketplace-header"
                className="text-xs font-medium text-tertiary-light"
              >
                {t(I18nKey.EXTENSIONS$MARKETPLACE_HEADER, {
                  name: phase.result.catalogName,
                  count: phase.result.listings.length,
                })}
              </p>
              <ul
                data-testid="marketplace-listings"
                className="flex flex-col gap-2"
              >
                {phase.result.listings.length === 0 ? (
                  <li className="text-xs text-tertiary-alt">
                    {t(I18nKey.EXTENSIONS$MARKETPLACE_EMPTY)}
                  </li>
                ) : (
                  phase.result.listings.map((listing) => (
                    <li key={listing.installSource}>
                      <button
                        type="button"
                        data-testid={`marketplace-listing-${listing.name}`}
                        onClick={() => reviewListing(listing.installSource)}
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
                        <span
                          data-testid={`marketplace-listing-source-${listing.name}`}
                          className="mt-0.5 block truncate font-mono text-[11px] text-tertiary-light"
                          title={listing.installSource}
                        >
                          {listing.installSource}
                        </span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
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
                isDisabled={phase.step === "installing"}
                onClick={backToInput}
              >
                {t(I18nKey.EXTENSIONS$BACK_BUTTON)}
              </BrandButton>
              <BrandButton
                type="button"
                variant="primary"
                testId="add-extension-install"
                isDisabled={phase.step === "installing"}
                onClick={handleInstall}
              >
                {t(
                  phase.step === "installing"
                    ? I18nKey.EXTENSIONS$INSTALLING
                    : I18nKey.EXTENSIONS$INSTALL_BUTTON,
                )}
              </BrandButton>
            </>
          ) : phase.step === "listing" ? (
            <BrandButton
              type="button"
              variant="secondary"
              testId="add-extension-back"
              onClick={backToInput}
            >
              {t(I18nKey.EXTENSIONS$BACK_BUTTON)}
            </BrandButton>
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
              <BrandButton
                type="submit"
                variant="primary"
                testId="add-extension-submit"
                isDisabled={
                  trimmedSource.length === 0 || parsed === null || isBusy
                }
              >
                {t(
                  isBusy
                    ? I18nKey.EXTENSIONS$DETECTING
                    : I18nKey.EXTENSIONS$ADD_BUTTON,
                )}
              </BrandButton>
            </>
          )}
        </footer>
      </form>
    </ModalBackdrop>
  );
}
