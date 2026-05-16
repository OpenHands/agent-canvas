import { CheckCircle2, CircleAlert, Rocket, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import type { RecommendedAutomation } from "#/constants/recommended-automations";
import type { MarketplaceEntry } from "#/constants/mcp-marketplace";
import type { MCPServerConfig } from "#/types/mcp-server";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { BrandButton } from "#/components/features/settings/brand-button";
import { findInstalledMatch } from "#/utils/mcp-marketplace-utils";
import { cn } from "#/utils/utils";

interface RecommendedAutomationSetupModalProps {
  automation: RecommendedAutomation;
  requiredEntries: MarketplaceEntry[];
  installedServers: MCPServerConfig[];
  isLaunching: boolean;
  onInstallMcp: (entry: MarketplaceEntry) => void;
  onLaunch: () => void;
  onClose: () => void;
}

export function RecommendedAutomationSetupModal({
  automation,
  requiredEntries,
  installedServers,
  isLaunching,
  onInstallMcp,
  onLaunch,
  onClose,
}: RecommendedAutomationSetupModalProps) {
  const { t } = useTranslation("openhands");

  const missingEntries = requiredEntries.filter(
    (entry) => !findInstalledMatch(entry.template, installedServers),
  );
  const readyToLaunch = missingEntries.length === 0;

  return (
    <ModalBackdrop onClose={onClose} aria-label={automation.name}>
      <div
        data-testid="recommended-automation-modal"
        className="flex max-h-[88vh] w-[760px] max-w-[94vw] flex-col overflow-hidden rounded-2xl border border-[var(--oh-border)] bg-base-secondary shadow-2xl"
      >
        <div className="relative border-b border-[var(--oh-border)] px-6 py-5">
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(137,255,179,0.16),transparent_32%),radial-gradient(circle_at_90%_20%,rgba(255,255,255,0.08),transparent_28%)]"
          />
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                {automation.category}
              </p>
              <h2 className="mt-2 text-xl font-semibold text-content">
                {automation.name}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-content-2">
                {automation.description}
              </p>
            </div>
            <button
              type="button"
              aria-label={t(I18nKey.RECOMMENDED_AUTOMATIONS$MODAL_CLOSE_ARIA)}
              onClick={onClose}
              className="rounded-full p-2 text-muted transition hover:bg-surface-raised hover:text-content"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 overflow-y-auto custom-scrollbar md:grid-cols-[minmax(0,1fr)_280px]">
          <div className="flex flex-col gap-4 p-6">
            <div>
              <h3 className="text-sm font-semibold text-content">
                {t(I18nKey.RECOMMENDED_AUTOMATIONS$MODAL_AGENT_PROMPT)}
              </h3>
              <div className="mt-2 rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface)] p-4 text-sm leading-6 text-content-2">
                {automation.prompt}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-content">
                {t(
                  I18nKey.RECOMMENDED_AUTOMATIONS$MODAL_EXAMPLE_IMPLEMENTATION,
                )}
              </h3>
              <pre className="mt-2 whitespace-pre-wrap rounded-xl border border-[var(--oh-border)] bg-black/25 p-4 text-xs leading-5 text-content-2">
                {automation.exampleImplementation}
              </pre>
            </div>
          </div>

          <aside className="border-t border-[var(--oh-border)] bg-[var(--oh-surface)] p-5 md:border-l md:border-t-0">
            <h3 className="text-sm font-semibold text-content">
              {t(I18nKey.RECOMMENDED_AUTOMATIONS$MODAL_REQUIRED_MCPS)}
            </h3>
            <p className="mt-1 text-xs leading-5 text-muted">
              {t(
                I18nKey.RECOMMENDED_AUTOMATIONS$MODAL_REQUIRED_MCPS_DESCRIPTION,
              )}
            </p>

            <div className="mt-4 flex flex-col gap-3">
              {requiredEntries.map((entry) => {
                const installed = !!findInstalledMatch(
                  entry.template,
                  installedServers,
                );
                return (
                  <div
                    key={entry.id}
                    className="rounded-xl border border-[var(--oh-border)] bg-base-secondary p-3"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                        style={{
                          backgroundColor: entry.iconBg,
                          color: entry.iconColor ?? "#FFFFFF",
                        }}
                      >
                        {entry.logo}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-content">
                          {entry.name}
                        </div>
                        <div
                          className={cn(
                            "mt-0.5 inline-flex items-center gap-1 text-[11px]",
                            installed ? "text-primary" : "text-amber-300",
                          )}
                        >
                          {installed ? (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          ) : (
                            <CircleAlert className="h-3.5 w-3.5" />
                          )}
                          {installed
                            ? t(I18nKey.RECOMMENDED_AUTOMATIONS$CONNECTED)
                            : t(I18nKey.RECOMMENDED_AUTOMATIONS$NEEDS_SETUP)}
                        </div>
                      </div>
                    </div>
                    {!installed && (
                      <BrandButton
                        type="button"
                        variant="secondary"
                        testId={`recommended-automation-install-${entry.id}`}
                        className="mt-3 w-full justify-center"
                        onClick={() => onInstallMcp(entry)}
                      >
                        {t(I18nKey.RECOMMENDED_AUTOMATIONS$ADD_MCP, {
                          name: entry.name,
                        })}
                      </BrandButton>
                    )}
                  </div>
                );
              })}
            </div>

            <BrandButton
              type="button"
              variant="primary"
              testId="recommended-automation-launch"
              className="mt-5 w-full justify-center"
              isDisabled={!readyToLaunch || isLaunching}
              aria-busy={isLaunching}
              startContent={<Rocket className="h-4 w-4" />}
              onClick={onLaunch}
            >
              {isLaunching
                ? t(I18nKey.RECOMMENDED_AUTOMATIONS$LAUNCHING)
                : t(I18nKey.RECOMMENDED_AUTOMATIONS$LAUNCH_CONVERSATION)}
            </BrandButton>

            {!readyToLaunch && (
              <p className="mt-3 text-xs leading-5 text-muted">
                {t(I18nKey.RECOMMENDED_AUTOMATIONS$REQUIRED_REMAINING, {
                  count: missingEntries.length,
                })}
              </p>
            )}
          </aside>
        </div>
      </div>
    </ModalBackdrop>
  );
}
