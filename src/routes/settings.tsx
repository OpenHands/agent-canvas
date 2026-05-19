import { useMemo } from "react";
import { Outlet, redirect, useLocation, useMatches } from "react-router";
import { useTranslation } from "react-i18next";
import { Route } from "./+types/settings";
import OptionService from "#/api/option-service/option-service.api";
import { queryClient } from "#/query-client-config";
import { SettingsLayout } from "#/components/features/settings";
import { WebClientConfig } from "#/api/option-service/option.types";
import {
  QUERY_KEYS,
  CONFIG_CACHE_OPTIONS,
  SETTINGS_QUERY_KEYS,
} from "#/hooks/query/query-keys";
import { getActiveBackend } from "#/api/backend-registry/active-store";
import { Typography } from "#/ui/typography";
import { useSettingsNavItems } from "#/hooks/use-settings-nav-items";
import { OSS_NAV_ITEMS } from "#/constants/settings-nav";
import { getSettingsQueryFn } from "#/hooks/query/use-settings";
import {
  getFirstAvailablePath,
  isSettingsPageHidden,
} from "#/utils/settings-utils";

export const clientLoader = async ({ request }: Route.ClientLoaderArgs) => {
  const url = new URL(request.url);
  const { pathname } = url;

  const config = await queryClient.fetchQuery<WebClientConfig>({
    queryKey: QUERY_KEYS.WEB_CLIENT_CONFIG,
    queryFn: OptionService.getConfig,
    ...CONFIG_CACHE_OPTIONS,
  });

  const featureFlags = config?.feature_flags;

  if (isSettingsPageHidden(pathname, featureFlags)) {
    const fallbackPath = getFirstAvailablePath(featureFlags);
    if (fallbackPath && fallbackPath !== pathname) {
      return redirect(fallbackPath);
    }
  }

  // ACP guard: the LLM / Condenser pages have no useful content while an
  // external ACP subprocess is driving conversations. Bounce them to
  // ``/settings/agent``. Driven by the same ``disabledByAcp`` flag the nav
  // hook uses for greying out, so the list of redirected paths and the
  // greyed-out paths can never drift apart.
  //
  // Doing the redirect in the loader (instead of a per-route ``useEffect``)
  // prevents the one-frame flash of LLM content before the guard fires.
  // Fall through silently on settings-fetch errors (unauthed, network,
  // local agent-server not running) — better to render the page than
  // redirect-loop on a missing payload.
  const currentNavItem = OSS_NAV_ITEMS.find((item) => item.to === pathname);
  if (currentNavItem?.disabledByAcp) {
    try {
      // Build the same query key ``useSettings`` uses (scope + backend +
      // org), so the loader's fetchQuery and the in-render hook share a
      // cache entry rather than thrashing the same data through two
      // different keys. Drift between these keys would mean the redirect
      // decision runs against one snapshot of the personal settings
      // while the page renders with another — visible as the nav
      // briefly showing the disabled state while the page lets the user
      // click through, or vice versa.
      const active = getActiveBackend();
      // ``staleTime: 0`` here is intentional: this read drives the
      // redirect, and a 5-minute stale tolerance turns a cross-tab
      // agent-kind flip into "navigate to /settings/condenser, get a
      // stale 'OpenHands' answer, render the page, watch the nav grey
      // out a moment later." Settings PATCHes invalidate the cache, so
      // a forced refetch only happens when something might actually
      // have changed.
      const personalSettings = await queryClient.fetchQuery({
        queryKey: [
          ...SETTINGS_QUERY_KEYS.byScope("personal"),
          active.backend.id,
          active.orgId,
        ],
        queryFn: () => getSettingsQueryFn("personal"),
        staleTime: 0,
      });
      if (personalSettings?.agent_settings?.agent_kind === "acp") {
        return redirect("/settings/agent");
      }
    } catch {
      // Settings unfetchable — let the page render.
    }
  }

  return null;
};

function SettingsScreen() {
  const { t } = useTranslation("openhands");
  const location = useLocation();
  const matches = useMatches();
  const navItems = useSettingsNavItems();

  const { currentSectionTitle, currentSectionSubtitle } = useMemo(() => {
    const currentRenderedItem = navItems.find(
      (item) => item.type === "item" && item.item.to === location.pathname,
    );
    if (currentRenderedItem?.type === "item") {
      return {
        currentSectionTitle: currentRenderedItem.item.text,
        currentSectionSubtitle: currentRenderedItem.item.subtitle,
      };
    }
    const firstItem = navItems.find((item) => item.type === "item");
    if (firstItem?.type === "item") {
      return {
        currentSectionTitle: firstItem.item.text,
        currentSectionSubtitle: firstItem.item.subtitle,
      };
    }
    return {
      currentSectionTitle: "SETTINGS$TITLE",
      currentSectionSubtitle: null as string | null,
    };
  }, [navItems, location.pathname]);

  const routeHandle = matches.find((m) => m.pathname === location.pathname)
    ?.handle as { hideTitle?: boolean } | undefined;
  const shouldHideTitle = routeHandle?.hideTitle === true;

  return (
    <main data-testid="settings-screen" className="min-h-0">
      <SettingsLayout navigationItems={navItems}>
        <div className="flex flex-col gap-6 pb-8">
          {!shouldHideTitle && (
            <header className="space-y-1">
              <Typography.H2>{t(currentSectionTitle)}</Typography.H2>
              {currentSectionSubtitle ? (
                <p
                  data-testid="settings-page-subtitle"
                  className="text-sm leading-5 text-tertiary-light"
                >
                  {t(currentSectionSubtitle)}
                </p>
              ) : null}
            </header>
          )}
          <Outlet />
        </div>
      </SettingsLayout>
    </main>
  );
}

export default SettingsScreen;
