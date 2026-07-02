import { useTranslation } from "react-i18next";
import { AcpConflictWarnings } from "#/components/features/settings/acp-conflict-warnings";
import { AcpAuthStatusBanner } from "#/components/features/settings/acp-auth-status-banner";
import { AcpSecretField } from "#/components/features/settings/acp-secret-field";
import { Typography } from "#/ui/typography";
import { I18nKey } from "#/i18n/declaration";
import {
  useAcpAuthStatus,
  type AcpAuthStatus,
} from "#/hooks/query/use-acp-auth-status";
import { getAcpProviderDisplayName } from "#/constants/acp-providers";
import type { AcpCredentialForm } from "#/hooks/use-acp-credential-form";

interface AcpCredentialsSectionProps {
  form: AcpCredentialForm;
  providerKey: string;
  /** Hide the section title/description when the host already has its own
   * heading (the onboarding step). */
  hideHeading?: boolean;
  /** Prefix for the field + banner test ids. Defaults to the settings/editor
   * usage; the onboarding step passes ``"onboarding-acp"``. */
  testIdPrefix?: string;
  /** Inject an already-running auth probe (the onboarding step gates its probe
   * on slide visibility). When omitted the section runs its own probe, so the
   * standalone settings / profile-editor usage stays zero-config. */
  authStatus?: AcpAuthStatus;
  isCheckingAuth?: boolean;
}

/**
 * Credentials section for a built-in ACP provider: the descriptor-driven secret
 * fields plus the "already signed in" auth banner. Shared by the per-profile
 * AgentProfile editor, the standalone Settings → Agent page, and the onboarding
 * step (software-agent-sdk#3728) so there is a single credential UI. The form
 * state + save are owned by the parent. Renders nothing for providers without
 * credential fields.
 */
export function AcpCredentialsSection({
  form,
  providerKey,
  hideHeading = false,
  testIdPrefix = "settings-acp",
  authStatus: authStatusProp,
  isCheckingAuth: isCheckingAuthProp,
}: AcpCredentialsSectionProps) {
  const { t } = useTranslation("openhands");
  const { fields, values, setValue, secretExists, conflicts } = form;
  // Self-probe only when the caller didn't inject a status (gated so it never
  // fires when the parent already provides one).
  const selfProbe = useAcpAuthStatus(providerKey, {
    enabled: authStatusProp === undefined,
  });
  const authStatus = authStatusProp ?? selfProbe.status;
  const isChecking = isCheckingAuthProp ?? selfProbe.isChecking;
  const providerName = getAcpProviderDisplayName(providerKey) ?? providerKey;

  if (fields.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      {!hideHeading && (
        <div className="flex flex-col gap-1">
          <Typography.Text className="text-sm font-medium text-white">
            {t(I18nKey.SETTINGS$ACP_CREDENTIALS_TITLE)}
          </Typography.Text>
          <Typography.Text className="text-xs text-[#717888]">
            {t(I18nKey.SETTINGS$ACP_CREDENTIALS_DESCRIPTION)}
          </Typography.Text>
        </div>
      )}

      <AcpAuthStatusBanner
        status={authStatus}
        isChecking={isChecking}
        providerName={providerName}
        testIdPrefix={`${testIdPrefix}-auth`}
      />

      <div className="flex flex-col gap-5">
        {fields.map((field) => (
          <AcpSecretField
            key={field.name}
            field={field}
            value={values[field.name] ?? ""}
            onChange={(value) => setValue(field.name, value)}
            alreadySet={secretExists(field.name)}
            testId={`${testIdPrefix}-secret-${field.name}`}
            showOptionalTag
          />
        ))}
      </div>

      <AcpConflictWarnings conflicts={conflicts} />
    </div>
  );
}
