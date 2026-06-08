import React from "react";
import { useTranslation } from "react-i18next";
import { AcpConflictWarnings } from "#/components/features/settings/acp-conflict-warnings";
import { AcpSecretField } from "#/components/features/settings/acp-secret-field";
import { BrandButton } from "#/components/features/settings/brand-button";
import { Typography } from "#/ui/typography";
import { I18nKey } from "#/i18n/declaration";
import { useAcpCredentialForm } from "#/hooks/use-acp-credential-form";

/**
 * Settings → Agent credentials section for a built-in ACP provider: the same
 * fields the onboarding step collects, saved through the same flow
 * ({@link useAcpCredentialForm}), so credentials can be added or rotated after
 * onboarding. Renders nothing for providers without credential fields.
 */
export function AcpCredentialsSection({
  providerKey,
}: {
  providerKey: string;
}) {
  const { t } = useTranslation("openhands");
  const {
    fields,
    values,
    setValue,
    secretExists,
    conflicts,
    isDirty,
    save,
    reset,
    isSaving,
  } = useAcpCredentialForm(providerKey);

  if (fields.length === 0) return null;

  const handleSave = async () => {
    if (await save()) {
      reset();
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Typography.Text className="text-sm font-medium text-white">
          {t(I18nKey.SETTINGS$ACP_CREDENTIALS_TITLE)}
        </Typography.Text>
        <Typography.Text className="text-xs text-[#717888]">
          {t(I18nKey.SETTINGS$ACP_CREDENTIALS_DESCRIPTION)}
        </Typography.Text>
      </div>

      <div className="flex flex-col gap-5">
        {fields.map((field) => (
          <AcpSecretField
            key={field.name}
            field={field}
            value={values[field.name] ?? ""}
            onChange={(value) => setValue(field.name, value)}
            alreadySet={secretExists(field.name)}
            testId={`settings-acp-secret-${field.name}`}
            showOptionalTag
          />
        ))}
      </div>

      <AcpConflictWarnings conflicts={conflicts} />

      <BrandButton
        testId="acp-credentials-save-button"
        type="button"
        variant="primary"
        isDisabled={isSaving || !isDirty}
        onClick={handleSave}
      >
        {isSaving
          ? t(I18nKey.SETTINGS$SAVING)
          : t(I18nKey.SETTINGS$SAVE_CHANGES)}
      </BrandButton>
    </div>
  );
}
