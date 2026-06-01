import { useTranslation } from "react-i18next";
import type { MarketplaceField } from "@openhands/extensions/integrations";
import { SecretsService } from "#/api/secrets-service";
import { I18nKey } from "#/i18n/declaration";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";

/**
 * Returns a fire-and-forget function that saves checked envFields as secrets.
 * MCP server config and the Secrets store are separate — this bridges the gap
 * so Automation Server can access credentials when running automations.
 */
export function useSaveFieldsAsSecrets() {
  const { t } = useTranslation("openhands");

  return (
    envFields: MarketplaceField[],
    values: Record<string, string>,
    savedAsSecret: Record<string, boolean>,
  ): void => {
    const fieldsToSave = envFields.filter(
      (field) => savedAsSecret[field.key] && (values[field.key] ?? "").trim(),
    );
    if (fieldsToSave.length === 0) return;

    Promise.allSettled(
      fieldsToSave.map((field) =>
        SecretsService.createSecret(field.key, values[field.key].trim()),
      ),
    ).then((results) => {
      const saved = fieldsToSave
        .filter((_, i) => results[i].status === "fulfilled")
        .map((f) => f.key);
      const failed = fieldsToSave
        .filter((_, i) => results[i].status === "rejected")
        .map((f) => f.key);

      if (saved.length > 0) {
        displaySuccessToast(
          t(I18nKey.MCP$SECRETS_SAVED, { keys: saved.join(", ") }),
        );
      }
      if (failed.length > 0) {
        displayErrorToast(
          t(I18nKey.MCP$SECRETS_SAVE_FAILED, { keys: failed.join(", ") }),
        );
      }
    });
  };
}
