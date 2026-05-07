import React from "react";
import { useTranslation } from "react-i18next";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { BrandButton } from "#/components/features/settings/brand-button";
import { SettingsInput } from "#/components/features/settings/settings-input";
import { useActiveBackendContext } from "#/contexts/active-backend-context";
import { I18nKey } from "#/i18n/declaration";
import type { BackendKind } from "#/api/backend-registry/types";

interface AddBackendModalProps {
  onClose: () => void;
}

function inferKindFromHost(host: string): BackendKind {
  const trimmed = host.trim().toLowerCase();
  if (trimmed.includes("all-hands.dev") || trimmed.includes("openhands.dev")) {
    return "cloud";
  }
  return "local";
}

function normalizeHost(host: string): string {
  const trimmed = host.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function AddBackendModal({ onClose }: AddBackendModalProps) {
  const { t } = useTranslation("openhands");
  const { addBackend } = useActiveBackendContext();

  const [name, setName] = React.useState("");
  const [host, setHost] = React.useState("");
  const [apiKey, setApiKey] = React.useState("");
  const [kind, setKind] = React.useState<BackendKind>("cloud");
  const [touchedKind, setTouchedKind] = React.useState(false);

  React.useEffect(() => {
    if (!touchedKind && host) {
      setKind(inferKindFromHost(host));
    }
  }, [host, touchedKind]);

  const canSubmit =
    name.trim().length > 0 &&
    host.trim().length > 0 &&
    (kind === "local" || apiKey.trim().length > 0);

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;

    addBackend({
      name: name.trim(),
      host: normalizeHost(host),
      apiKey: apiKey.trim(),
      kind,
    });

    // Adding a backend is a pure save — we do NOT auto-switch the active
    // selection. The user picks the new backend from the dropdown when
    // they're ready. Auto-switching would write `(backendId, null)` for a
    // cloud backend, which the dropdown can't render once orgs load and
    // therefore drifts from the API layer.
    onClose();
  };

  return (
    <ModalBackdrop
      onClose={onClose}
      closeOnEscape={false}
      aria-label={t(I18nKey.BACKEND$ADD_TITLE)}
    >
      <form
        data-testid="add-backend-modal"
        onSubmit={onSubmit}
        className="bg-base-secondary p-6 rounded-xl flex flex-col gap-4 border border-tertiary"
        style={{ width: "480px" }}
      >
        <div className="flex flex-col gap-1">
          <h3 className="text-xl font-bold">{t(I18nKey.BACKEND$ADD_TITLE)}</h3>
          <p className="text-xs text-gray-400">
            {t(I18nKey.BACKEND$ADD_SUBTITLE)}
          </p>
        </div>

        <SettingsInput
          testId="add-backend-name"
          name="add-backend-name"
          type="text"
          label={t(I18nKey.BACKEND$NAME_LABEL)}
          value={name}
          onChange={setName}
          placeholder="Production"
          className="w-full"
        />

        <SettingsInput
          testId="add-backend-host"
          name="add-backend-host"
          type="text"
          label={t(I18nKey.BACKEND$HOST_LABEL)}
          value={host}
          onChange={setHost}
          placeholder="https://app.all-hands.dev"
          className="w-full"
        />

        <SettingsInput
          testId="add-backend-api-key"
          name="add-backend-api-key"
          type="password"
          label={t(I18nKey.BACKEND$KEY_LABEL)}
          value={apiKey}
          onChange={setApiKey}
          placeholder=""
          className="w-full"
        />

        <fieldset className="flex flex-col">
          <legend className="text-sm mb-3">
            {t(I18nKey.BACKEND$KIND_LABEL)}
          </legend>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="add-backend-kind"
                checked={kind === "local"}
                onChange={() => {
                  setKind("local");
                  setTouchedKind(true);
                }}
                data-testid="add-backend-kind-local"
              />
              {t(I18nKey.BACKEND$KIND_LOCAL)}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="add-backend-kind"
                checked={kind === "cloud"}
                onChange={() => {
                  setKind("cloud");
                  setTouchedKind(true);
                }}
                data-testid="add-backend-kind-cloud"
              />
              {t(I18nKey.BACKEND$KIND_CLOUD)}
            </label>
          </div>
          <p className="text-xs text-gray-400 mt-3">
            {kind === "cloud"
              ? t(I18nKey.BACKEND$KEY_HELPER_CLOUD)
              : t(I18nKey.BACKEND$KEY_HELPER_LOCAL)}
          </p>
        </fieldset>

        <div className="grid grid-cols-2 gap-2 mt-2 w-full">
          <BrandButton
            type="submit"
            variant="primary"
            isDisabled={!canSubmit}
            testId="add-backend-submit"
            className="w-full text-center"
          >
            {t(I18nKey.BACKEND$SAVE)}
          </BrandButton>
          <BrandButton
            type="button"
            variant="secondary"
            onClick={onClose}
            testId="add-backend-cancel"
            className="w-full text-center"
          >
            {t(I18nKey.BUTTON$CANCEL)}
          </BrandButton>
        </div>
      </form>
    </ModalBackdrop>
  );
}
