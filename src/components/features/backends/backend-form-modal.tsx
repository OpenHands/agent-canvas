import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ServerClient } from "@openhands/typescript-client/clients";
import OpenHandsLogoWhite from "#/assets/branding/openhands-logo-white.svg?react";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { BrandButton } from "#/components/features/settings/brand-button";
import { SettingsInput } from "#/components/features/settings/settings-input";
import { useActiveBackendContext } from "#/contexts/active-backend-context";
import { useBackendsHealth } from "#/hooks/query/use-backends-health";
import { getAgentServerClientOptions } from "#/api/agent-server-client-options";
import { I18nKey } from "#/i18n/declaration";
import type { Backend, BackendKind } from "#/api/backend-registry/types";
import { BackendStatusDot } from "./backend-status-dot";
import { DeviceFlowAuth } from "./device-flow-auth";

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

/**
 * Returns true for hostnames that represent a local / private-network address.
 * Used by normalizeHost to choose http:// instead of https://.
 */
function isLocalAddress(hostname: string): boolean {
  // Strip IPv6 bracket notation: [::1] → ::1
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  // IPv6 loopback, any-address, and named loopback
  if (h === "localhost" || h === "::1" || h === "::" || h === "0.0.0.0")
    return true;
  // 127.x.x.x loopback range + IPv4-mapped loopback (::ffff:127.x.x.x)
  if (/^127\./.test(h) || /^::ffff:127\./i.test(h)) return true;
  // RFC 1918 private ranges
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  // IPv6 link-local (fe80::/10) and unique local (fc00::/7)
  if (/^fe[89ab][0-9a-f]:/i.test(h)) return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(h)) return true;
  // mDNS / Bonjour (.local)
  if (h.endsWith(".local")) return true;
  // Single-label hostnames (no dots, no colons) are local network names.
  // Colons are excluded so bare IPv6 addresses don't accidentally match.
  if (!h.includes(".") && !h.includes(":")) return true;
  return false;
}

function normalizeHost(host: string): string {
  const trimmed = host.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  // Already has an explicit scheme — respect it.
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  // Extract the pure hostname for scheme selection, handling three cases:
  //   [::1]:8080  → bracket IPv6 notation → extract ::1
  //   ::1         → bare IPv6 (multiple colons, no bracket) → whole string
  //   host:port   → regular host:port → part before the colon
  const bracketMatch = trimmed.match(/^\[([^\]]+)\]/);
  const hostname = bracketMatch
    ? bracketMatch[1]
    : (trimmed.match(/:/g) ?? []).length > 1
      ? trimmed
      : trimmed.split(":")[0];
  const scheme = isLocalAddress(hostname) ? "http" : "https";
  return `${scheme}://${trimmed}`;
}

/**
 * Returns true when `host` represents a reachable backend URL.
 *
 * Rules (applied in order):
 *   1. Must be non-empty after trimming.
 *   2. Must contain no whitespace — spaces can never appear in a host/port.
 *   3. After normalisation (bare hosts get `https://` prepended), must parse
 *      as a valid http or https URL with a non-empty hostname.
 */
function isValidHostUrl(host: string): boolean {
  const trimmed = host.trim();
  if (!trimmed) return false;
  // Spaces anywhere in the input are an immediate rejection.
  if (/\s/.test(trimmed)) return false;
  const normalized = normalizeHost(trimmed);
  if (!normalized) return false;
  try {
    const url = new URL(normalized);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.hostname.length > 0
    );
  } catch {
    return false;
  }
}

const DEFAULT_OPENHANDS_CLOUD_HOST = "https://app.all-hands.dev";

/**
 * Live status row for the edit form: shows a connection dot, a
 * "Local"/"Cloud" label, and the agent server's reported version when
 * available. Replaces the legacy local/cloud radio fieldset (kind is
 * now inferred from the host).
 */
function BackendStatusBadge({
  backend,
  testIdRoot,
}: {
  backend: Backend;
  testIdRoot: string;
}) {
  const { t } = useTranslation("openhands");
  const healthByBackendId = useBackendsHealth([backend]);
  const health = healthByBackendId[backend.id];
  const isConnected = health?.isConnected ?? null;
  const disabled = health?.disabled === true;
  const consecutiveFailures = health?.consecutiveFailures ?? 0;
  const lastError = health?.lastError ?? null;

  const { data: version } = useQuery({
    queryKey: ["backend-version", backend.host, backend.apiKey],
    queryFn: async () => {
      const info = await new ServerClient(
        getAgentServerClientOptions({
          host: backend.host,
          sessionApiKey: backend.apiKey || null,
          timeout: 5000,
        }),
      ).getServerInfo();
      return info.version ?? null;
    },
    retry: false,
    staleTime: 60_000,
    enabled: backend.kind === "local" && !disabled,
  });

  let statusLabel: string;
  if (isConnected === true) {
    statusLabel = t(I18nKey.ONBOARDING$BACKEND_STATUS_CONNECTED);
  } else if (isConnected === false) {
    statusLabel = t(I18nKey.ONBOARDING$BACKEND_STATUS_DISCONNECTED);
  } else {
    statusLabel = t(I18nKey.ONBOARDING$BACKEND_STATUS_CHECKING);
  }

  const kindLabel =
    backend.kind === "cloud"
      ? t(I18nKey.BACKEND$KIND_CLOUD)
      : t(I18nKey.BACKEND$KIND_LOCAL);

  return (
    <div className="flex flex-col gap-2">
      <div
        data-testid={`${testIdRoot}-status`}
        className="flex items-center gap-3 text-sm"
      >
        <BackendStatusDot isConnected={isConnected} />
        <span className="text-white" data-testid={`${testIdRoot}-status-label`}>
          {statusLabel}
        </span>
        <span className="text-tertiary-alt">·</span>
        <span className="text-[var(--oh-text-tertiary)]">{kindLabel}</span>
        {version ? (
          <span
            className="text-xs text-[var(--oh-muted)]"
            data-testid={`${testIdRoot}-version`}
          >
            {t(I18nKey.BACKEND$VERSION_LABEL, { version })}
          </span>
        ) : null}
      </div>

      {disabled ? (
        <div
          data-testid={`${testIdRoot}-status-error`}
          className="flex flex-col gap-1 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm"
        >
          <span className="font-semibold text-red-300">
            {t(I18nKey.BACKEND$HEALTH_FAILED_TITLE)}
          </span>
          <span className="text-xs text-[var(--oh-text-tertiary)]">
            {t(I18nKey.BACKEND$HEALTH_FAILED_DETAIL, {
              count: consecutiveFailures,
            })}
          </span>
          {lastError ? (
            <span
              data-testid={`${testIdRoot}-status-error-message`}
              className="text-xs text-red-300 whitespace-pre-wrap break-words"
            >
              {lastError}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export interface BackendFormProps {
  mode: BackendFormMode;
  /** Required when `mode === "edit"`. */
  backend?: Backend;
  /**
   * Called after the form is submitted and the backend has been
   * persisted. Use this to dismiss a containing modal, advance an
   * onboarding step, etc.
   */
  onSubmitted: () => void;
  /**
   * Optional render slot rendered in place of the default
   * Save / Cancel button row, so callers (e.g. the onboarding flow)
   * can re-skin the action area while still owning submission via the
   * standard `<form onSubmit>` flow. Receives the form's submit-ready
   * state.
   */
  renderActions?: (state: {
    canSubmit: boolean;
    testIdRoot: string;
  }) => React.ReactNode;
  /** Used to disambiguate test ids across the same screen. */
  testIdRoot?: string;
}

/**
 * Reusable form body for adding / editing a backend. Renders the
 * common name / host / API-key inputs plus the kind selector
 * (radio buttons in `add` mode, status badge in `edit` mode).
 *
 * Rendered as a `<form>`, so consumers should put any extra controls
 * either inside `renderActions` or as siblings inside a wrapping
 * element — but submission flows through the standard form submit so
 * Enter-to-submit still works.
 */
export function BackendForm({
  mode,
  backend,
  onSubmitted,
  renderActions,
  testIdRoot: explicitTestIdRoot,
}: BackendFormProps) {
  const { t } = useTranslation("openhands");
  const { addBackend, updateBackend } = useActiveBackendContext();

  const [name, setName] = React.useState(backend?.name ?? "");
  const [host, setHost] = React.useState(backend?.host ?? "");
  const [apiKey, setApiKey] = React.useState(backend?.apiKey ?? "");

  // Inline validation: only show errors after the user has left a field.
  const [nameTouched, setNameTouched] = React.useState(false);
  const [hostTouched, setHostTouched] = React.useState(false);

  // Kind is inferred from the host on every change.
  const kind: BackendKind = inferKindFromHost(host);

  const testIdRoot =
    explicitTestIdRoot ?? (mode === "edit" ? "edit-backend" : "add-backend");

  const canSubmit =
    name.trim().length > 0 &&
    isValidHostUrl(host) &&
    (kind === "local" || apiKey.trim().length > 0);

  // Error messages — only surfaced after the user has blurred the field.
  const nameError =
    nameTouched && !name.trim() ? t(I18nKey.BACKEND$NAME_REQUIRED) : undefined;
  const hostError = hostTouched
    ? !host.trim()
      ? t(I18nKey.BACKEND$HOST_REQUIRED)
      : !isValidHostUrl(host)
        ? t(I18nKey.BACKEND$HOST_INVALID)
        : undefined
    : undefined;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) {
      // Mark all validated fields as touched so inline errors become visible
      // (e.g. user pressed Enter before filling required fields).
      setNameTouched(true);
      setHostTouched(true);
      return;
    }

    const payload = {
      name: name.trim(),
      host: normalizeHost(host),
      apiKey: apiKey.trim(),
      kind,
    };

    if (mode === "edit" && backend) {
      updateBackend(backend.id, payload);
    } else {
      addBackend(payload);
    }

    onSubmitted();
  };

  return (
    <form
      data-testid={`${testIdRoot}-form`}
      onSubmit={handleSubmit}
      className="flex flex-col gap-4"
    >
      <SettingsInput
        testId={`${testIdRoot}-name`}
        name={`${testIdRoot}-name`}
        type="text"
        label={t(I18nKey.BACKEND$NAME_LABEL)}
        value={name}
        onChange={setName}
        onBlur={() => setNameTouched(true)}
        placeholder="Production"
        className="w-full"
        showRequiredTag
        error={nameError}
      />

      <SettingsInput
        testId={`${testIdRoot}-host`}
        name={`${testIdRoot}-host`}
        type="text"
        label={t(I18nKey.BACKEND$HOST_LABEL)}
        value={host}
        onChange={setHost}
        onBlur={() => setHostTouched(true)}
        placeholder={DEFAULT_OPENHANDS_CLOUD_HOST}
        className="w-full"
        showRequiredTag
        error={hostError}
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

      {mode === "edit" && backend && (
        <BackendStatusBadge backend={backend} testIdRoot={testIdRoot} />
      )}

      {renderActions ? (
        renderActions({ canSubmit, testIdRoot })
      ) : (
        <div className="flex justify-end gap-2 mt-2 w-full">
          <BrandButton
            type="button"
            variant="secondary"
            onClick={onSubmitted}
            testId={`${testIdRoot}-cancel`}
          >
            {t(I18nKey.BUTTON$CANCEL)}
          </BrandButton>
          <BrandButton
            type="submit"
            variant="primary"
            isDisabled={!canSubmit}
            testId={`${testIdRoot}-submit`}
          >
            {t(I18nKey.BACKEND$SAVE)}
          </BrandButton>
        </div>
      )}
    </form>
  );
}

// ── Add-mode two-column layout ──────────────────────────────────────

/**
 * Left column of the "Add a Backend" modal: manual connection via
 * Host + API Key. Designed for self-hosted agent servers and
 * self-hosted OpenHands Cloud with API key auth.
 */
function ManualConnectionColumn({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation("openhands");
  const { addBackend } = useActiveBackendContext();

  const [name, setName] = React.useState("");
  const [host, setHost] = React.useState("");
  const [apiKey, setApiKey] = React.useState("");

  const kind: BackendKind = inferKindFromHost(host);
  const canSubmit =
    name.trim().length > 0 &&
    isValidHostUrl(host) &&
    (kind === "local" || apiKey.trim().length > 0);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) return;
    addBackend({
      name: name.trim(),
      host: normalizeHost(host),
      apiKey: apiKey.trim(),
      kind,
    });
    onClose();
  };

  return (
    <form
      data-testid="add-backend-form"
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 flex-1 min-w-0"
    >
      <div className="flex flex-col gap-1">
        <SettingsInput
          testId="add-backend-name"
          name="add-backend-name"
          type="text"
          label={t(I18nKey.BACKEND$NAME_LABEL)}
          value={name}
          onChange={setName}
          placeholder="e.g. My Server"
          className="w-full"
        />
        <p className="text-xs text-gray-500">
          {t(I18nKey.BACKEND$NAME_HELPER)}
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <SettingsInput
          testId="add-backend-host"
          name="add-backend-host"
          type="text"
          label={t(I18nKey.BACKEND$HOST_LABEL)}
          value={host}
          onChange={setHost}
          placeholder="http://localhost:8000"
          className="w-full"
        />
        <p
          className="text-xs text-gray-500"
          data-testid="add-backend-host-helper"
        >
          {t(I18nKey.BACKEND$HOST_HELPER)}
        </p>
      </div>

      <SettingsInput
        testId="add-backend-api-key"
        name="add-backend-api-key"
        type="password"
        label={t(I18nKey.BACKEND$KEY_LABEL)}
        value={apiKey}
        onChange={setApiKey}
        placeholder="sk-••••••••••"
        className="w-full"
      />

      <BrandButton
        type="submit"
        variant="secondary"
        isDisabled={!canSubmit}
        testId="add-backend-submit"
        className="w-full text-center"
      >
        {t(I18nKey.BACKEND$CONNECT)}
      </BrandButton>
    </form>
  );
}

/**
 * Right column of the "Add a Backend" modal: one-click OAuth login
 * with OpenHands Cloud. Includes an "Advanced" disclosure for
 * users who self-host OpenHands Cloud and need to override the host.
 */
function CloudLoginColumn({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation("openhands");
  const { addBackend } = useActiveBackendContext();

  const [advancedOpen, setAdvancedOpen] = React.useState(false);
  const [customHost, setCustomHost] = React.useState("");

  const effectiveHost = customHost.trim() || DEFAULT_OPENHANDS_CLOUD_HOST;

  const handleLoginSuccess = (apiKey: string) => {
    addBackend({
      name: "OpenHands Cloud",
      host: normalizeHost(effectiveHost),
      apiKey,
      kind: "cloud",
    });
    onClose();
  };

  return (
    <div className="flex flex-col items-center justify-center gap-4 flex-1 min-w-0 px-4">
      <OpenHandsLogoWhite width={56} height={56} aria-hidden />

      <h4
        className="text-lg font-bold text-white"
        data-testid="add-backend-cloud-title"
      >
        {t(I18nKey.BACKEND$CLOUD_TITLE)}
      </h4>

      <p className="text-sm text-gray-400 text-center leading-relaxed">
        {t(I18nKey.BACKEND$CLOUD_DESCRIPTION)}
      </p>

      <DeviceFlowAuth
        host={effectiveHost}
        onSuccess={handleLoginSuccess}
        testIdRoot="add-backend"
      />

      <details
        className="w-full"
        open={advancedOpen}
        onToggle={(e) => setAdvancedOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary
          className="text-xs text-gray-400 cursor-pointer select-none text-center hover:text-gray-300"
          data-testid="add-backend-advanced-toggle"
        >
          {t(I18nKey.BACKEND$ADVANCED)}
        </summary>
        <div className="mt-3">
          <SettingsInput
            testId="add-backend-cloud-host"
            name="add-backend-cloud-host"
            type="text"
            label={t(I18nKey.BACKEND$HOST_LABEL)}
            value={customHost}
            onChange={setCustomHost}
            placeholder={DEFAULT_OPENHANDS_CLOUD_HOST}
            className="w-full"
          />
          <p className="text-xs text-gray-500 mt-1">
            {t(I18nKey.BACKEND$LOGIN_CLOUD_HINT)}
          </p>
        </div>
      </details>
    </div>
  );
}

// ── Modal wrappers ──────────────────────────────────────────────────

/**
 * Modal wrapper. In **add** mode it renders a two-column layout
 * (manual connection | OR | Cloud login). In **edit** mode it wraps
 * the standard `BackendForm`.
 */
export function BackendFormModal({
  mode,
  backend,
  onClose,
}: BackendFormModalProps) {
  const { t } = useTranslation("openhands");

  if (mode === "add") {
    return (
      <ModalBackdrop
        onClose={onClose}
        closeOnEscape={false}
        aria-label={t(I18nKey.BACKEND$ADD_TITLE)}
      >
        <div
          data-testid="add-backend-modal"
          className="bg-base-secondary rounded-xl border border-tertiary"
          style={{ width: "720px" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-6 pb-2">
            <h3 className="text-xl font-bold">
              {t(I18nKey.BACKEND$ADD_TITLE)}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-white text-xl leading-none cursor-pointer"
              data-testid="add-backend-close"
              aria-label="Close"
            >
              {"✕"}
            </button>
          </div>

          {/* Two-column body */}
          <div className="flex px-6 pb-6 pt-2">
            {/* Left: manual connection */}
            <div className="flex-1 min-w-0 pr-6">
              <ManualConnectionColumn onClose={onClose} />
            </div>

            {/* Vertical OR divider */}
            <div className="flex flex-col items-center mx-2 shrink-0">
              <div className="flex-1 w-px bg-gray-600" />
              <span className="text-xs text-gray-500 uppercase py-3">
                {t(I18nKey.BACKEND$LOGIN_OR)}
              </span>
              <div className="flex-1 w-px bg-gray-600" />
            </div>

            {/* Right: cloud login */}
            <div className="flex-1 min-w-0 pl-6">
              <CloudLoginColumn onClose={onClose} />
            </div>
          </div>
        </div>
      </ModalBackdrop>
    );
  }

  // Edit mode — single-column form (unchanged)
  const testIdRoot = "edit-backend";
  return (
    <ModalBackdrop
      onClose={onClose}
      closeOnEscape={false}
      aria-label={t(I18nKey.BACKEND$EDIT_TITLE)}
    >
      <div
        data-testid={`${testIdRoot}-modal`}
        className="bg-base-secondary p-6 rounded-xl flex flex-col gap-4 border border-[var(--oh-border)]"
        style={{ width: "480px" }}
      >
        <h3 className="text-xl font-bold">{t(I18nKey.BACKEND$EDIT_TITLE)}</h3>
        <BackendForm
          mode="edit"
          backend={backend}
          onSubmitted={onClose}
          testIdRoot={testIdRoot}
        />
      </div>
    </ModalBackdrop>
  );
}
