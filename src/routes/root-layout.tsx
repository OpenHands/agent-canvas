import React from "react";
import {
  useRouteError,
  isRouteErrorResponse,
  Outlet,
  useLocation,
} from "react-router";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import i18n from "#/i18n";
import { useConfig } from "#/hooks/query/use-config";
import { Sidebar } from "#/components/features/sidebar/sidebar";
import { EnvironmentSwitchOverlay } from "#/components/features/backends/environment-switch-overlay";
import { AnalyticsConsentFormModal } from "#/components/features/analytics/analytics-consent-form-modal";
import { useSettings } from "#/hooks/query/use-settings";
import { useMigrateUserConsent } from "#/hooks/use-migrate-user-consent";
import { useSyncPostHogConsent } from "#/hooks/use-sync-posthog-consent";
import { AlertBanner } from "#/components/features/alerts/alert-banner";
import { cn } from "#/utils/utils";
import { LoadingSpinner } from "#/components/shared/loading-spinner";
import { useAppTitle } from "#/hooks/use-app-title";
import { ReactRouterNavigationProvider } from "./react-router-navigation-provider";

export function ErrorBoundary() {
  const error = useRouteError();
  const { t } = useTranslation("openhands");

  if (isRouteErrorResponse(error)) {
    return (
      <div>
        <h1>{error.status}</h1>
        <p>{error.statusText}</p>
        <pre>
          {error.data instanceof Object
            ? JSON.stringify(error.data)
            : error.data}
        </pre>
      </div>
    );
  }
  if (error instanceof Error) {
    return (
      <div>
        <h1>{t(I18nKey.ERROR$GENERIC)}</h1>
        <pre>{error.message}</pre>
      </div>
    );
  }

  return (
    <div>
      <h1>{t(I18nKey.ERROR$UNKNOWN)}</h1>
    </div>
  );
}

export default function MainApp() {
  const appTitle = useAppTitle();
  const { pathname } = useLocation();
  const { data: settings } = useSettings();
  const { migrateUserConsent } = useMigrateUserConsent();
  const config = useConfig();

  const [consentFormIsOpen, setConsentFormIsOpen] = React.useState(false);

  useSyncPostHogConsent();

  React.useEffect(() => {
    if (settings?.language) {
      i18n.changeLanguage(settings.language);
    }
  }, [settings?.language]);

  React.useEffect(() => {
    setConsentFormIsOpen(settings?.user_consents_to_analytics === null);
  }, [settings?.user_consents_to_analytics]);

  React.useEffect(() => {
    migrateUserConsent({
      handleAnalyticsWasPresentInLocalStorage: () => {
        setConsentFormIsOpen(false);
      },
    });
  }, [migrateUserConsent]);

  if (config.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  let rootLayoutPaddingClass = "p-0 md:p-3 md:pl-0";
  if (
    pathname === "/" ||
    pathname.startsWith("/automations") ||
    pathname.startsWith("/conversations")
  ) {
    rootLayoutPaddingClass = "p-0";
  }

  return (
    <ReactRouterNavigationProvider>
      <div
        data-testid="root-layout"
        className={cn(
          "h-screen lg:min-w-5xl flex flex-col md:flex-row bg-base overflow-hidden",
          rootLayoutPaddingClass,
        )}
      >
        <title>{appTitle}</title>
        <Sidebar />

        <div className="flex flex-col w-full h-[calc(100%-50px)] md:h-full gap-3">
          {config.data &&
            (config.data.maintenance_start_time ||
              (config.data.faulty_models &&
                config.data.faulty_models.length > 0) ||
              config.data.error_message) && (
              <AlertBanner
                maintenanceStartTime={config.data.maintenance_start_time}
                faultyModels={config.data.faulty_models}
                errorMessage={config.data.error_message}
                updatedAt={config.data.updated_at}
              />
            )}
          <div
            id="root-outlet"
            className="flex-1 relative overflow-auto custom-scrollbar"
          >
            <Outlet />
          </div>
        </div>

        {consentFormIsOpen && (
          <AnalyticsConsentFormModal
            onClose={() => {
              setConsentFormIsOpen(false);
            }}
          />
        )}
      </div>
      <EnvironmentSwitchOverlay />
    </ReactRouterNavigationProvider>
  );
}
