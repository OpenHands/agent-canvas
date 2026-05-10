import React from "react";
import { useTranslation } from "react-i18next";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { BrandButton } from "#/components/features/settings/brand-button";
import { SettingsInput } from "#/components/features/settings/settings-input";
import { useActiveBackendContext } from "#/contexts/active-backend-context";
import { I18nKey } from "#/i18n/declaration";
import type { Backend, BackendKind } from "#/api/backend-registry/types";

export type BackendFormMode = "add" | "edit";

interface BackendFormModalProps {
  mode: BackendFormMode;
  /** Required when `mode === "edit"`. */
  backend?: Backend;
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

/**
 * Single form used for both adding a new backend and editing an
 * existing one. The shape of `Backend` is identical in both cases — the
 * only difference is whether we call `addBackend` or `updateBackend`.
 */
export function BackendFormModal({
  mode,
  backend,
  onClose,
}: BackendFormModalProps) {
  const { t } = useTranslation("openhands");
  const { addBackend, updateBackend } = useActiveBackendContext();

  const initialKind: BackendKind =
    backend?.kind ?? (mode === "edit" ? "local" : "cloud");

  const [name, setName] = React.useState(backend?.name ?? "");
  const [host, setHost] = React.useState(backend?.host ?? "");
  const [apiKey, setApiKey] = React.useState(backend?.apiKey ?? "");
  const [kind, setKind] = React.useState<BackendKind>(initialKind);
  // In add mode, infer the kind from the host; in edit mode, the user
  // already chose one, so don't re-infer over their choice.
  const [touchedKind, setTouchedKind] = React.useState(mode === "edit");

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

    const payload = {
      name: name.trim(),
      host: normalizeHost(host),
      apiKey: apiKey.trim(),
      kind,
    };

    if (mode === "edit" && backend) {
      updateBackend(backend.id, payload);
    } else {
      // Adding a backend is a pure save — we do NOT auto-switch the
      // active selection. The user picks the new backend from the
      // dropdown when they're ready. Auto-switching would write
      // `(backendId, null)` for a cloud backend, which the dropdown
      // can't render once orgs load and therefore drifts from the API
      // layer.
      addBackend(payload);
    }

    onClose();
  };

  const titleKey =
    mode === "edit" ? I18nKey.BACKEND$EDIT_TITLE : I18nKey.BACKEND$ADD_TITLE;
  const testIdRoot = mode === "edit" ? "edit-backend" : "add-backend";

  return (
    <ModalBackdrop
      onClose={onClose}
      closeOnEscape={false}
      aria-label={t(titleKey)}
    >
      <form
        data-testid={`${testIdRoot}-modal`}
        onSubmit={onSubmit}
        className="bg-base-secondary p-6 rounded-xl flex flex-col gap-4 border border-tertiary"
        style={{ width: "480px" }}
      >
        <div className="flex flex-col gap-1">
          <h3 className="text-xl font-bold">{t(titleKey)}</h3>
          {mode === "add" ? (
            <p className="text-xs text-gray-400">
              {t(I18nKey.BACKEND$ADD_SUBTITLE)}
            </p>
          ) : null}
        </div>

        <SettingsInput
          testId={`${testIdRoot}-name`}
          name={`${testIdRoot}-name`}
          type="text"
          label={t(I18nKey.BACKEND$NAME_LABEL)}
          value={name}
          onChange={setName}
          placeholder="Production"
          className="w-full"
        />

        <SettingsInput
          testId={`${testIdRoot}-host`}
          name={`${testIdRoot}-host`}
          type="text"
          label={t(I18nKey.BACKEND$HOST_LABEL)}
          value={host}
          onChange={setHost}
          placeholder="https://app.all-hands.dev"
          className="w-full"
        />

        <SettingsInput
          testId={`${testIdRoot}-api-key`}
          name={`${testIdRoot}-api-key`}
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
                name={`${testIdRoot}-kind`}
                checked={kind === "local"}
                onChange={() => {
                  setKind("local");
                  setTouchedKind(true);
                }}
                data-testid={`${testIdRoot}-kind-local`}
              />
              {t(I18nKey.BACKEND$KIND_LOCAL)}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={`${testIdRoot}-kind`}
                checked={kind === "cloud"}
                onChange={() => {
                  setKind("cloud");
                  setTouchedKind(true);
                }}
                data-testid={`${testIdRoot}-kind-cloud`}
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
            testId={`${testIdRoot}-submit`}
            className="w-full text-center"
          >
            {t(I18nKey.BACKEND$SAVE)}
          </BrandButton>
          <BrandButton
            type="button"
            variant="secondary"
            onClick={onClose}
            testId={`${testIdRoot}-cancel`}
            className="w-full text-center"
          >
            {t(I18nKey.BUTTON$CANCEL)}
          </BrandButton>
        </div>
      </form>
    </ModalBackdrop>
  );
}
