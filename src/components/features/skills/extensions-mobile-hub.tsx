import { useTranslation } from "react-i18next";
import { Typography } from "#/ui/typography";
import { I18nKey } from "#/i18n/declaration";
import { SidebarNavLink } from "#/components/features/sidebar/sidebar-nav-link";
import { BackendSyncedSettingsBadge } from "#/components/features/settings/backend-synced-settings-badge";
import { EXTENSIONS_NAV_ITEMS } from "./extensions-navigation";
import { useActiveBackendContext } from "#/contexts/active-backend-context";
import { isNoBackend } from "#/api/backend-registry/active-store";

export function ExtensionsMobileHub() {
  const { t } = useTranslation("openhands");
  const { active } = useActiveBackendContext();
  const { backend } = active;
  const isCloud = backend.kind === "cloud" && !isNoBackend(backend);

  return (
    <div
      data-testid="extensions-mobile-hub"
      className="flex flex-col gap-4 px-4 py-2 md:hidden"
    >
      <Typography.H2>{t(I18nKey.NAV$CUSTOMIZE)}</Typography.H2>
      <nav className="flex flex-col gap-0.5">
        {EXTENSIONS_NAV_ITEMS.map((item) => {
          const isSkills = item.to === "/skills";
          const href =
            isSkills && isCloud
              ? `${backend.host.replace(/\/+$/, "")}/settings/skills`
              : item.to;
          // eslint-disable-next-line i18next/no-literal-string
          const target = isSkills && isCloud ? "_blank" : undefined;
          // eslint-disable-next-line i18next/no-literal-string
          const rel = isSkills && isCloud ? "noopener noreferrer" : undefined;

          return (
            <SidebarNavLink
              key={item.to}
              to={href}
              target={target}
              rel={rel}
              label={item.label}
              end={item.end}
              testId={`sidebar-extensions-${item.to}`}
              icon={item.icon}
              disabled={item.comingSoon}
            />
          );
        })}
      </nav>
      <div className="pt-1">
        <BackendSyncedSettingsBadge />
      </div>
    </div>
  );
}
