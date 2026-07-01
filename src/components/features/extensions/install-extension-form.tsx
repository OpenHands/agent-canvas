import React from "react";
import { useTranslation } from "react-i18next";
import { SettingsInput } from "#/components/features/settings/settings-input";
import { BrandButton } from "#/components/features/settings/brand-button";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { parseSourceRef, formatSourceRef } from "#/extensions/sources/ref";
import type {
  ExtensionSourceRef,
  GithubSourceRef,
} from "#/extensions/sources/ref";
import { useExtensionContext } from "#/components/providers/extension-manager-provider";
import { capabilityLabelKey } from "./capability-labels";
import type { ManifestPreview } from "#/extensions/installed-store";

export type InstallProgress =
  | { step: "idle" }
  | { step: "parsing" }
  | { step: "resolving" }
  | { step: "loading" }
  | { step: "reviewing"; preview: ManifestPreview }
  | { step: "installing" }
  | { step: "complete" }
  | { step: "error"; message: string };

interface ParsedSourceResult {
  ref: ExtensionSourceRef;
  canonical: string;
}

function tryParseSource(input: string): ParsedSourceResult | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const ref = parseSourceRef(trimmed);
    return { ref, canonical: formatSourceRef(ref) };
  } catch {
    return null;
  }
}

function getRefTypeLabel(kind: ExtensionSourceRef["kind"]): string {
  switch (kind) {
    case "npm":
      return "npm package";
    case "gh":
      return "GitHub repository";
    case "url":
      return "Direct URL";
  }
}

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

interface InstallExtensionFormProps {
  /** Callback when installation completes successfully. */
  onInstallComplete?: () => void;
  /** Additional className for the form container. */
  className?: string;
}

/**
 * Extension installation form with real-time source validation feedback.
 * Shows the parsed ref type (npm:, gh:, url:) as the user types, displays
 * resolution progress, and handles the full install flow with capability consent.
 */
export function InstallExtensionForm({
  onInstallComplete,
  className,
}: InstallExtensionFormProps) {
  const { t } = useTranslation("openhands");
  const context = useExtensionContext();

  const [source, setSource] = React.useState("");
  const [progress, setProgress] = React.useState<InstallProgress>({
    step: "idle",
  });
  const [resolvedTarget, setResolvedTarget] = React.useState<string | null>(
    null,
  );

  const trimmedSource = source.trim();
  const parsed = React.useMemo(() => tryParseSource(source), [source]);

  if (!context) {
    return (
      <div
        data-testid="install-extension-form-disabled"
        className={cn(
          "rounded-lg border border-[var(--oh-border)] bg-base-secondary p-4",
          className,
        )}
      >
        <p className="text-sm text-tertiary-light">
          {t(I18nKey.EXTENSIONS$DISABLED_NOTICE)}
        </p>
      </div>
    );
  }

  const { previewManifest, installFromUrl } = context;

  const isIdle =
    progress.step === "idle" ||
    progress.step === "complete" ||
    progress.step === "error";
  const isPending = !isIdle && progress.step !== "reviewing";
  const canSubmit = trimmedSource.length > 0 && parsed !== null && isIdle;

  const handleReview = async () => {
    if (!canSubmit) return;

    setProgress({ step: "parsing" });

    // Small delay to show parsing state
    await new Promise((resolve) => setTimeout(resolve, 100));
    setProgress({ step: "resolving" });

    try {
      const preview = await previewManifest(trimmedSource);
      setResolvedTarget(trimmedSource);
      setProgress({ step: "reviewing", preview });
    } catch (error) {
      setProgress({
        step: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleInstall = async () => {
    if (!resolvedTarget || progress.step !== "reviewing") return;

    setProgress({ step: "installing" });

    try {
      await installFromUrl(resolvedTarget);
      setProgress({ step: "complete" });
      setSource("");
      setResolvedTarget(null);
      onInstallComplete?.();
    } catch (error) {
      setProgress({
        step: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleBack = () => {
    setProgress({ step: "idle" });
    setResolvedTarget(null);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (progress.step === "reviewing") {
      handleInstall();
    } else if (canSubmit) {
      handleReview();
    }
  };

  const renderValidationFeedback = () => {
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
        <span>
          {t(getRefTypeI18nKey(parsed.ref.kind), {
            defaultValue: getRefTypeLabel(parsed.ref.kind),
          })}
        </span>
        {parsed.ref.kind === "npm" && parsed.ref.range && (
          <span className="text-tertiary-alt">@{parsed.ref.range}</span>
        )}
        {parsed.ref.kind === "gh" && (
          <span className="text-tertiary-alt">
            {(parsed.ref as GithubSourceRef).owner}
            {"/"}
            {(parsed.ref as GithubSourceRef).repo}
            {(parsed.ref as GithubSourceRef).range &&
              `@${(parsed.ref as GithubSourceRef).range}`}
          </span>
        )}
      </div>
    );
  };

  const renderProgressIndicator = () => {
    if (isIdle || progress.step === "reviewing") return null;

    const stepLabels: Record<string, I18nKey> = {
      parsing: I18nKey.EXTENSIONS$PROGRESS_PARSING,
      resolving: I18nKey.EXTENSIONS$PROGRESS_RESOLVING,
      loading: I18nKey.EXTENSIONS$PROGRESS_LOADING,
      installing: I18nKey.EXTENSIONS$PROGRESS_INSTALLING,
    };

    const labelKey = stepLabels[progress.step];
    if (!labelKey) return null;

    return (
      <div
        data-testid="install-progress"
        className="flex items-center gap-2 text-sm text-tertiary-light"
      >
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span>{t(labelKey, { defaultValue: progress.step })}</span>
      </div>
    );
  };

  const renderReviewSection = () => {
    if (progress.step !== "reviewing") return null;

    const { preview } = progress;

    return (
      <section
        data-testid="extension-review"
        className="flex flex-col gap-3 rounded-lg border border-[var(--oh-border)] bg-base-primary p-4"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">
            {preview.name}
          </p>
          <p className="truncate text-xs text-tertiary-alt">
            {t(I18nKey.SETTINGS$SKILLS_VERSION, { version: preview.version })}
          </p>
          {preview.publisher && (
            <p className="truncate text-xs text-tertiary-alt">
              {t(I18nKey.EXTENSIONS$PUBLISHED_BY, {
                publisher: preview.publisher,
              })}
            </p>
          )}
        </div>

        <div className="border-t border-[var(--oh-border)] pt-3">
          <span className="text-xs font-medium text-tertiary-light">
            {t(I18nKey.EXTENSIONS$PERMISSIONS_TITLE)}
          </span>
          {preview.capabilities.length === 0 ? (
            <span className="mt-1 block text-xs text-tertiary-alt">
              {t(I18nKey.EXTENSIONS$NO_PERMISSIONS)}
            </span>
          ) : (
            <ul className="mt-1 flex flex-col gap-1">
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
        </div>
      </section>
    );
  };

  return (
    <form
      onSubmit={handleSubmit}
      data-testid="install-extension-form"
      className={cn(
        "flex flex-col gap-4 rounded-lg border border-[var(--oh-border)] bg-base-secondary p-4",
        className,
      )}
    >
      <div className="flex flex-col gap-1.5">
        <SettingsInput
          testId="extension-source-input"
          label={t(I18nKey.EXTENSIONS$SOURCE_LABEL)}
          type="text"
          value={source}
          onChange={(value) => {
            setSource(value);
            if (progress.step === "error") {
              setProgress({ step: "idle" });
            }
          }}
          placeholder={t(I18nKey.EXTENSIONS$SOURCE_PLACEHOLDER)}
          isDisabled={isPending || progress.step === "reviewing"}
        />
        {renderValidationFeedback()}
        <p
          data-testid="extension-source-help"
          className="text-xs text-tertiary-alt"
        >
          {t(I18nKey.EXTENSIONS$SOURCE_HELP)}
        </p>
      </div>

      {renderProgressIndicator()}
      {renderReviewSection()}

      {progress.step === "error" && (
        <p data-testid="install-error" className="text-xs text-danger">
          {progress.message}
        </p>
      )}

      {progress.step === "complete" && (
        <p data-testid="install-success" className="text-xs text-success">
          {t(I18nKey.EXTENSIONS$INSTALL_SUCCESS)}
        </p>
      )}

      <div className="flex justify-end gap-2">
        {progress.step === "reviewing" ? (
          <>
            <BrandButton
              type="button"
              variant="secondary"
              testId="install-back-button"
              onClick={handleBack}
            >
              {t(I18nKey.EXTENSIONS$BACK_BUTTON)}
            </BrandButton>
            <BrandButton
              type="submit"
              variant="primary"
              testId="install-confirm-button"
            >
              {t(I18nKey.EXTENSIONS$INSTALL_BUTTON)}
            </BrandButton>
          </>
        ) : (
          <BrandButton
            type="submit"
            variant="primary"
            testId="install-review-button"
            isDisabled={!canSubmit || isPending}
          >
            {t(
              isPending
                ? I18nKey.EXTENSIONS$REVIEWING
                : I18nKey.EXTENSIONS$REVIEW_BUTTON,
            )}
          </BrandButton>
        )}
      </div>
    </form>
  );
}
