import { useTranslation } from "react-i18next";
import { Cloud, ExternalLink } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { useActiveBackendContext } from "#/contexts/active-backend-context";
import { isNoBackend } from "#/api/backend-registry/active-store";
import { cn } from "#/utils/utils";

/**
 * External link to the active Cloud backend's account/settings page.
 *
 * Rendered at the bottom of the Settings sidebar. Only appears when the
 * active backend is a Cloud backend — Local backends have no equivalent
 * hosted settings page. Opens `{cloudHost}/settings` in a new tab with a
 * cloud glyph and an external-link icon so users can tell it leaves the
 * canvas.
 */
export function CloudSettingsLink() {
  const { t } = useTranslation("openhands");
  const { active } = useActiveBackendContext();
  const { backend } = active;

  if (isNoBackend(backend) || backend.kind !== "cloud") return null;

  const cloudSettingsUrl = `${backend.host.replace(/\/+$/, "")}/settings`;

  return (
    <a
      data-testid="settings-cloud-link"
      href={cloudSettingsUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "flex items-center justify-between gap-2 rounded-lg border border-[var(--oh-border)] bg-base-secondary px-3 py-2",
        "text-sm text-white transition-colors hover:bg-surface-raised",
      )}
    >
      <span className="flex items-center gap-2">
        <Cloud className="size-4 shrink-0 text-[var(--oh-muted)]" />
        {t(I18nKey.SETTINGS$CLOUD_SETTINGS_LINK)}
      </span>
      <ExternalLink className="size-4 shrink-0 text-[var(--oh-muted)]" />
    </a>
  );
}
