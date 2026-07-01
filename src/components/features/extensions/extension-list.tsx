import React from "react";
import { useTranslation } from "react-i18next";
import { BrandButton } from "#/components/features/settings/brand-button";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import {
  extensionModuleCardPillClassName,
  extensionModuleCardSurfaceClassName,
  extensionModuleCardGridClassName,
  extensionModuleCardGridContainerClassName,
  extensionModuleEmptyStateClassName,
} from "#/utils/extension-module-card-classes";
import {
  useInstalledExtensionsStore,
  type ExtensionUpdate,
  type InstalledExtension,
} from "#/extensions/installed-store";
import { useExtensionContext } from "#/components/providers/extension-manager-provider";
import { capabilityLabelKey } from "./capability-labels";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";

interface ExtensionCardProps {
  extension: InstalledExtension;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  onUninstall: () => void;
  update?: ExtensionUpdate | null;
  onUpdate?: () => void;
  isUpdating?: boolean;
  isBusy?: boolean;
}

function ExtensionCard({
  extension,
  enabled,
  onToggle,
  onUninstall,
  update,
  onUpdate,
  isUpdating = false,
  isBusy = false,
}: ExtensionCardProps) {
  const { t } = useTranslation("openhands");
  const isDev = extension.origin === "dev";
  const canUpdate = !isDev && update != null && onUpdate != null;

  const refTypeLabel = React.useMemo(() => {
    if (!extension.sourceRef) return null;
    if (extension.sourceRef.startsWith("npm:")) {
      return t(I18nKey.EXTENSIONS$REF_TYPE_NPM, { defaultValue: "npm" });
    }
    if (extension.sourceRef.startsWith("gh:")) {
      return t(I18nKey.EXTENSIONS$REF_TYPE_GH, { defaultValue: "GitHub" });
    }
    if (
      extension.sourceRef.startsWith("http://") ||
      extension.sourceRef.startsWith("https://")
    ) {
      return t(I18nKey.EXTENSIONS$REF_TYPE_URL, { defaultValue: "URL" });
    }
    return null;
  }, [extension.sourceRef, t]);

  return (
    <div
      data-testid={`extension-card-${extension.id}`}
      className={cn(
        "flex min-w-0 flex-col gap-3 overflow-hidden p-4 transition-opacity",
        extensionModuleCardSurfaceClassName,
        !enabled && "opacity-60",
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3
            data-testid={`extension-name-${extension.id}`}
            className="truncate text-sm font-semibold text-white"
          >
            {extension.name}
          </h3>
          {extension.publisher && (
            <p className="mt-0.5 truncate text-xs text-tertiary-alt">
              {t(I18nKey.EXTENSIONS$PUBLISHED_BY, {
                publisher: extension.publisher,
              })}
            </p>
          )}
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          {/* Enable/Disable Toggle */}
          {!isDev && (
            <label
              className="relative inline-flex cursor-pointer items-center"
              data-testid={`extension-toggle-${extension.id}`}
            >
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => onToggle(e.target.checked)}
                disabled={isBusy}
                className="peer sr-only"
              />
              <div
                className={cn(
                  "h-6 w-11 rounded-full bg-tertiary",
                  "peer-focus:ring-2 peer-focus:ring-primary",
                  "peer-checked:bg-primary",
                  "after:absolute after:left-[2px] after:top-[2px]",
                  "after:h-5 after:w-5 after:rounded-full",
                  "after:border after:border-[var(--oh-border)]",
                  "after:bg-white after:transition-all",
                  "peer-checked:after:translate-x-full",
                  "peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
                )}
              />
              <span className="sr-only">
                {enabled
                  ? t(I18nKey.EXTENSIONS$DISABLE_LABEL)
                  : t(I18nKey.EXTENSIONS$ENABLE_LABEL)}
              </span>
            </label>
          )}

          {isDev && (
            <span
              className={cn(extensionModuleCardPillClassName, "flex-shrink-0")}
              title={extension.sourceUrl}
            >
              {t(I18nKey.EXTENSIONS$DEV_BADGE)}
            </span>
          )}
        </div>
      </header>

      {/* Source ref display */}
      {!isDev && extension.sourceRef && (
        <div className="flex items-center gap-2">
          {refTypeLabel && (
            <span
              data-testid={`extension-ref-type-${extension.id}`}
              className={cn(
                extensionModuleCardPillClassName,
                "text-[10px] uppercase tracking-wider",
              )}
            >
              {refTypeLabel}
            </span>
          )}
          <p
            data-testid={`extension-source-${extension.id}`}
            className="min-w-0 truncate font-mono text-xs text-tertiary-alt"
            title={extension.sourceRef}
          >
            {extension.sourceRef}
          </p>
        </div>
      )}

      {/* Version and update badge */}
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(extensionModuleCardPillClassName, "self-start")}
          data-testid={`extension-version-${extension.id}`}
        >
          {t(I18nKey.SETTINGS$SKILLS_VERSION, { version: extension.version })}
        </span>
        {canUpdate && (
          <span
            data-testid={`extension-update-badge-${extension.id}`}
            className={cn(
              extensionModuleCardPillClassName,
              "self-start border-primary text-primary",
            )}
            title={`${update.currentVersion} → ${update.latestVersion}`}
          >
            {t(I18nKey.EXTENSIONS$UPDATE_AVAILABLE)}
          </span>
        )}
      </div>

      {/* Permissions */}
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-tertiary-light">
          {t(I18nKey.EXTENSIONS$PERMISSIONS_TITLE)}
        </span>
        {extension.capabilities.length === 0 ? (
          <span className="text-xs text-tertiary-alt">
            {t(I18nKey.EXTENSIONS$NO_PERMISSIONS)}
          </span>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {extension.capabilities.map((capability) => (
              <li
                key={capability}
                className={extensionModuleCardPillClassName}
                title={capability}
              >
                {t(capabilityLabelKey(capability))}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Action buttons */}
      {!isDev && (
        <div className="mt-1 flex justify-end gap-2 border-t border-[var(--oh-border)] pt-3">
          {canUpdate && (
            <BrandButton
              type="button"
              variant="primary"
              testId={`extension-update-${extension.id}`}
              className="whitespace-nowrap text-xs"
              isDisabled={isUpdating || isBusy}
              aria-busy={isUpdating}
              onClick={onUpdate}
            >
              {isUpdating
                ? t(I18nKey.EXTENSIONS$UPDATING)
                : t(I18nKey.EXTENSIONS$UPDATE_BUTTON)}
            </BrandButton>
          )}
          <BrandButton
            type="button"
            variant="danger"
            testId={`extension-uninstall-${extension.id}`}
            className="whitespace-nowrap text-xs"
            isDisabled={isBusy}
            onClick={onUninstall}
          >
            {t(I18nKey.EXTENSIONS$UNINSTALL_BUTTON)}
          </BrandButton>
        </div>
      )}
    </div>
  );
}

interface ExtensionListProps {
  /** Additional className for the container. */
  className?: string;
}

/**
 * Displays installed extensions with their source refs, metadata, and controls.
 * Supports enable/disable toggle and uninstall per extension.
 */
export function ExtensionList({ className }: ExtensionListProps) {
  const { t } = useTranslation("openhands");
  const context = useExtensionContext();
  const installed = useInstalledExtensionsStore((state) => state.installed);

  // Track enabled state per extension (persisted in localStorage)
  const [enabledMap, setEnabledMap] = React.useState<Record<string, boolean>>(
    () => {
      try {
        const stored = localStorage.getItem("agent-canvas:extensions:enabled");
        return stored ? JSON.parse(stored) : {};
      } catch {
        return {};
      }
    },
  );

  // Track available updates
  const [updates, setUpdates] = React.useState<Record<string, ExtensionUpdate>>(
    {},
  );
  const [updatingId, setUpdatingId] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  // Persist enabled state changes
  React.useEffect(() => {
    try {
      localStorage.setItem(
        "agent-canvas:extensions:enabled",
        JSON.stringify(enabledMap),
      );
    } catch {
      // Ignore storage errors
    }
  }, [enabledMap]);

  // Check for updates when installed list changes
  const checkForUpdate = context?.checkForUpdate;
  React.useEffect(() => {
    if (!checkForUpdate) return undefined;
    let cancelled = false;

    (async () => {
      const found: Record<string, ExtensionUpdate> = {};
      await Promise.all(
        installed.map(async (extension) => {
          try {
            const update = await checkForUpdate(extension.id);
            if (update) found[extension.id] = update;
          } catch {
            // Failed update check is non-fatal
          }
        }),
      );
      if (!cancelled) setUpdates(found);
    })();

    return () => {
      cancelled = true;
    };
  }, [checkForUpdate, installed]);

  const isEnabled = (id: string): boolean => enabledMap[id] !== false;

  const handleToggle = (id: string, enabled: boolean) => {
    setEnabledMap((prev) => ({ ...prev, [id]: enabled }));
    displaySuccessToast(
      enabled
        ? t(I18nKey.EXTENSIONS$ENABLED_TOAST)
        : t(I18nKey.EXTENSIONS$DISABLED_TOAST),
    );
  };

  const handleUninstall = (id: string) => {
    setBusyId(id);
    try {
      context?.uninstall(id);
      setEnabledMap((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      displaySuccessToast(t(I18nKey.EXTENSIONS$UNINSTALL_SUCCESS));
    } catch (error) {
      displayErrorToast(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyId(null);
    }
  };

  const handleUpdate = async (id: string) => {
    if (!context) return;
    setUpdatingId(id);
    try {
      await context.updateExtension(id);
      setUpdates((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      displaySuccessToast(t(I18nKey.EXTENSIONS$UPDATE_SUCCESS));
    } catch (error) {
      displayErrorToast(error instanceof Error ? error.message : String(error));
    } finally {
      setUpdatingId(null);
    }
  };

  if (!context) {
    return (
      <div
        data-testid="extension-list-disabled"
        className={cn(extensionModuleEmptyStateClassName, className)}
      >
        <p className="text-sm text-tertiary-light">
          {t(I18nKey.EXTENSIONS$DISABLED_NOTICE)}
        </p>
      </div>
    );
  }

  if (installed.length === 0) {
    return (
      <div
        data-testid="extension-list-empty"
        className={cn(extensionModuleEmptyStateClassName, className)}
      >
        <p className="text-sm text-tertiary-light">
          {t(I18nKey.EXTENSIONS$EMPTY)}
        </p>
      </div>
    );
  }

  return (
    <section
      data-testid="extension-list"
      className={cn(
        "flex min-w-0 flex-col gap-3",
        extensionModuleCardGridContainerClassName,
        className,
      )}
    >
      <div className={extensionModuleCardGridClassName}>
        {installed.map((extension) => (
          <ExtensionCard
            key={extension.id}
            extension={extension}
            enabled={isEnabled(extension.id)}
            onToggle={(enabled) => handleToggle(extension.id, enabled)}
            onUninstall={() => handleUninstall(extension.id)}
            update={updates[extension.id]}
            onUpdate={() => handleUpdate(extension.id)}
            isUpdating={updatingId === extension.id}
            isBusy={busyId === extension.id}
          />
        ))}
      </div>
    </section>
  );
}
