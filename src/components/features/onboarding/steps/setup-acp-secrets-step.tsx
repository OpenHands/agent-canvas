import React from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { Check, Loader2 } from "lucide-react";
import { BrandButton } from "#/components/features/settings/brand-button";
import { SettingsInput } from "#/components/features/settings/settings-input";
import { I18nKey } from "#/i18n/declaration";
import { useCreateSecret } from "#/hooks/mutation/use-create-secret";
import { useSearchSecrets } from "#/hooks/query/use-get-secrets";
import { useAcpAuthStatus } from "#/hooks/query/use-acp-auth-status";
import {
  getAcpProviderDisplayName,
  getAcpProviderSecrets,
} from "#/constants/acp-providers";
import { type OnboardingAgentId } from "./choose-agent-step";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import { retrieveAxiosErrorMessage } from "#/utils/retrieve-axios-error-message";

interface SetupAcpSecretsStepProps {
  /** ACP provider whose credentials we're collecting (e.g. ``"claude-code"``).
   * Typed as {@link OnboardingAgentId} — the same type the onboarding modal
   * tracks — so a mistyped key is a compile error rather than a silently empty
   * form. Providers without a credentials entry (``"openhands"``,
   * ``"gemini-cli"``) simply yield no fields. */
  providerKey: OnboardingAgentId;
  /**
   * Whether this is the currently visible onboarding slide. The modal mounts
   * every slide at once, so we only run the (subprocess-spinning) login probe
   * once the user has actually reached this step — by which point the backend
   * is confirmed connected.
   */
  isActive: boolean;
  onBack: () => void;
  onNext: () => void;
}

/**
 * Onboarding credentials step for ACP providers that authenticate via an
 * env-var API key (Claude Code, Codex). The fields are derived from
 * {@link getAcpProviderSecrets}; each one maps 1:1 to a **global secret**
 * whose name equals the env var the agent-server exports into the provider
 * subprocess. Saving here is therefore the same as adding the secret under
 * Settings → Secrets — it shows up there afterwards.
 *
 * The step is intentionally skippable: a user may authenticate Claude Code via
 * a subscription login, or already have the env var set on the backend, so we
 * never block "Next" on a value. Empty fields are simply not written; a field
 * whose secret already exists shows an "already saved" placeholder and is left
 * untouched unless the user types a replacement.
 */
export function SetupAcpSecretsStep({
  providerKey,
  isActive,
  onBack,
  onNext,
}: SetupAcpSecretsStepProps) {
  const { t } = useTranslation("openhands");
  const queryClient = useQueryClient();
  const { mutateAsync: createSecret } = useCreateSecret();
  const { data: existingSecrets } = useSearchSecrets();
  // Login detection via AcpService (provider status commands run through the
  // agent-server bash endpoint) — see issue #964.
  const { status: authStatus, isChecking: isCheckingAuth } = useAcpAuthStatus(
    providerKey,
    { enabled: isActive },
  );

  const fields = React.useMemo(
    () => getAcpProviderSecrets(providerKey),
    [providerKey],
  );
  // Providers like Gemini authenticate via an interactive browser/OAuth login
  // and have no API-key fields. For those the step is purely a login-status
  // screen: it shows the "you're signed in" banner (or how to sign in) with no
  // inputs to fill.
  const hasFields = fields.length > 0;
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = React.useState(false);

  const providerName = getAcpProviderDisplayName(providerKey) ?? providerKey;

  const secretExists = React.useCallback(
    (name: string) =>
      (existingSecrets ?? []).some((secret) => secret.name === name),
    [existingSecrets],
  );

  const handleNext = async () => {
    // Only persist fields the user actually filled in — empty inputs are a
    // deliberate skip, not a request to clear an existing secret.
    const toSave = fields
      .map((field) => ({ name: field.name, value: values[field.name]?.trim() }))
      .filter((entry): entry is { name: string; value: string } =>
        Boolean(entry.value),
      );

    if (toSave.length === 0) {
      onNext();
      return;
    }

    setIsSaving(true);
    try {
      // Sequential so a mid-list failure leaves the earlier secrets saved and
      // surfaces a single, specific error rather than a race of toasts.
      for (const { name, value } of toSave) {
        await createSecret({ name, value });
      }
      await queryClient.invalidateQueries({ queryKey: ["secrets-search"] });
      await queryClient.invalidateQueries({ queryKey: ["secrets"] });
      displaySuccessToast(t(I18nKey.SETTINGS$SAVED));
      onNext();
    } catch (error) {
      const message = retrieveAxiosErrorMessage(error as AxiosError);
      displayErrorToast(message || t(I18nKey.ERROR$GENERIC));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      data-testid="onboarding-step-setup-acp-secrets"
      className="flex flex-col gap-6"
    >
      <header className="flex flex-col gap-2">
        <h2 className="text-2xl font-medium text-white">
          {t(
            hasFields
              ? I18nKey.ONBOARDING$ACP_SECRETS_TITLE
              : I18nKey.ONBOARDING$ACP_LOGIN_TITLE,
            { provider: providerName },
          )}
        </h2>
        <p className="text-sm text-[var(--oh-muted)]">
          {t(
            hasFields
              ? I18nKey.ONBOARDING$ACP_SECRETS_SUBTITLE
              : I18nKey.ONBOARDING$ACP_LOGIN_SUBTITLE,
            { provider: providerName },
          )}
        </p>
      </header>

      {authStatus === "authenticated" ? (
        <div
          data-testid="onboarding-acp-auth-detected"
          // Matches the onboarding "backend connected" success banner
          // (check-backend-step.tsx) for a consistent look.
          className="flex items-start gap-2 rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-3 text-sm text-green-200"
        >
          <Check
            className="mt-0.5 size-4 shrink-0 text-green-400"
            aria-hidden
          />
          <span>
            {t(
              hasFields
                ? I18nKey.ONBOARDING$ACP_AUTH_DETECTED
                : I18nKey.ONBOARDING$ACP_AUTH_DETECTED_NO_KEY,
              { provider: providerName },
            )}
          </span>
        </div>
      ) : isCheckingAuth ? (
        <div
          data-testid="onboarding-acp-auth-checking"
          className="flex items-center gap-2 text-sm text-[var(--oh-muted)]"
        >
          <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
          <span>
            {t(I18nKey.ONBOARDING$ACP_AUTH_CHECKING, {
              provider: providerName,
            })}
          </span>
        </div>
      ) : null}

      <div className="flex flex-col gap-5">
        {fields.map((field) => {
          const alreadySet = secretExists(field.name);
          return (
            <div key={field.name} className="flex flex-col gap-1.5">
              <SettingsInput
                testId={`onboarding-acp-secret-${field.name}`}
                name={field.name}
                // The env-var name is the canonical label here; rendering it
                // monospace makes clear it's a literal key, not prose.
                label={field.name}
                labelClassName="font-mono"
                type={field.secret ? "password" : "text"}
                value={values[field.name] ?? ""}
                onChange={(value) =>
                  setValues((prev) => ({ ...prev, [field.name]: value }))
                }
                // Every field is optional — the whole step is skippable.
                showOptionalTag
                placeholder={
                  alreadySet ? t(I18nKey.ONBOARDING$ACP_SECRET_ALREADY_SET) : ""
                }
              />
              <span className="text-xs text-[var(--oh-muted)]">
                {t(field.hint_key)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="sticky bottom-0 flex items-center justify-between gap-2 bg-base-secondary pt-4 pb-7">
        <BrandButton
          testId="onboarding-acp-secrets-back"
          type="button"
          variant="secondary"
          onClick={onBack}
          isDisabled={isSaving}
        >
          {t(I18nKey.ONBOARDING$BACK)}
        </BrandButton>
        <BrandButton
          testId="onboarding-acp-secrets-next"
          type="button"
          variant="primary"
          isDisabled={isSaving}
          onClick={handleNext}
        >
          {isSaving ? t(I18nKey.SETTINGS$SAVING) : t(I18nKey.ONBOARDING$NEXT)}
        </BrandButton>
      </div>
    </div>
  );
}
