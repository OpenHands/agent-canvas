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
import { SidebarMobileNavProvider } from "#/components/features/sidebar/sidebar-mobile-nav-context";
import { SidebarMobileMenuBar } from "#/components/features/sidebar/sidebar-mobile-menu-bar";
import { useSettings } from "#/hooks/query/use-settings";
import { useMigrateUserConsent } from "#/hooks/use-migrate-user-consent";
import { useSyncPostHogConsent } from "#/hooks/use-sync-posthog-consent";
import { LoadingSpinner } from "#/components/shared/loading-spinner";
import { useAppTitle } from "#/hooks/use-app-title";
import { ReactRouterNavigationProvider } from "./react-router-navigation-provider";

// Lazy-load components that are only rendered conditionally — keeps them out
// of the root layout's eager dev/prod graph (and out of every page's first
// paint) until the relevant condition triggers.
const EnvironmentSwitchOverlay = React.lazy(
  () => import("#/components/features/backends/environment-switch-overlay"),
);
const AnalyticsConsentFormModal = React.lazy(() =>
  import("#/components/features/analytics/analytics-consent-form-modal").then(
    (m) => ({ default: m.AnalyticsConsentFormModal }),
  ),
);
const AlertBanner = React.lazy(() =>
  import("#/components/features/alerts/alert-banner").then((m) => ({
    default: m.AlertBanner,
  })),
);

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
  const location = useLocation();
  const appTitle = useAppTitle();
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

  // Conversation + full-screen panel routes put the mobile menu control in the
  // chat / panel header; omit the extra top row so we don't duplicate chrome.
  const hideMobileSidebarMenuBar = /^\/conversations\/[^/]+/.test(
    location.pathname,
  );

  return (
    <ReactRouterNavigationProvider>
      <SidebarMobileNavProvider>
        <div
          data-testid="root-layout"
          className="h-screen lg:min-w-5xl flex flex-col md:flex-row bg-base overflow-hidden p-0"
        >
          <title>{appTitle}</title>
          <Sidebar />

          <div className="flex min-h-0 flex-col w-full min-w-0 h-full gap-3">
            {!hideMobileSidebarMenuBar ? <SidebarMobileMenuBar /> : null}
            {config.data &&
              (config.data.maintenance_start_time ||
                (config.data.faulty_models &&
                  config.data.faulty_models.length > 0) ||
                config.data.error_message) && (
                <React.Suspense fallback={null}>
                  <AlertBanner
                    maintenanceStartTime={config.data.maintenance_start_time}
                    faultyModels={config.data.faulty_models}
                    errorMessage={config.data.error_message}
                    updatedAt={config.data.updated_at}
                  />
                </React.Suspense>
              )}
            <div
              id="root-outlet"
              className="relative flex-1 overflow-auto px-0 custom-scrollbar"
            >
              <Outlet />
            </div>
          </div>

          {consentFormIsOpen && (
            <React.Suspense fallback={null}>
              <AnalyticsConsentFormModal
                onClose={() => {
                  setConsentFormIsOpen(false);
                }}
              />
            </React.Suspense>
          )}
        </div>
        <React.Suspense fallback={null}>
          <EnvironmentSwitchOverlay />
        </React.Suspense>
      </SidebarMobileNavProvider>
    </ReactRouterNavigationProvider>
  );
}
