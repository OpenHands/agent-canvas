import React, { useId } from "react";
import { useTranslation } from "react-i18next";
import { AxiosError } from "axios";
import type { MCPTestFailure } from "@openhands/typescript-client";
import type {
  IntegrationConnectionOption,
  IntegrationCatalogEntry as MarketplaceEntry,
  IntegrationTransport as MarketplaceTemplate,
} from "@openhands/extensions/integrations";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { ModalCloseButton } from "#/components/shared/modals/modal-close-button";
import { BrandButton } from "#/components/features/settings/brand-button";
import { SettingsInput } from "#/components/features/settings/settings-input";
import { I18nKey } from "#/i18n/declaration";
import { McpLogoBadge } from "#/components/features/mcp-logo-badge";
import { MCPServerConfig } from "#/types/mcp-server";
import { useAddMcpServer } from "#/hooks/mutation/use-add-mcp-server";
import { useTestMcpServer } from "#/hooks/mutation/use-test-mcp-server";
import { displaySuccessToast } from "#/utils/custom-toast-handlers";
import { retrieveAxiosErrorMessage } from "#/utils/retrieve-axios-error-message";
import {
  getInstallableConnectionOptions,
  getInstallableTemplate,
  resolveTransportUrl,
} from "#/utils/mcp-marketplace-utils";

interface InstallServerModalProps {
  entry: MarketplaceEntry;
  onClose: () => void;
  onSuccess?: (entry: MarketplaceEntry) => void;
}

interface FieldState {
  values: Record<string, string>;
  errors: Record<string, string | null>;
}

function makeInitialState(
  template: MarketplaceTemplate | undefined,
): FieldState {
  const values: Record<string, string> = {};
  if (!template) return { values, errors: {} };
  if (template.kind === "stdio") {
    for (const field of template.envFields ?? []) {
      values[field.key] = "";
    }
    for (const field of template.argFields ?? []) {
      values[field.key] = "";
    }
  } else if (template.kind === "shttp" || template.kind === "sse") {
    values.api_key = "";
    for (const field of template.urlFields ?? []) {
      values[field.key] = "";
    }
  }
  return { values, errors: {} };
}

function defaultInstallableOptionId(entry: MarketplaceEntry): string {
  const options = getInstallableConnectionOptions(entry);
  const preferred = options.find(
    (o) => o.id === entry.defaultConnectionOptionId,
  );
  return preferred?.id ?? options[0]?.id ?? entry.defaultConnectionOptionId;
}

// The marketplace install modal is intentionally add-only: clicking
// a catalog tile always appends a new server (the user might want
// two Slack workspaces, two Postgres connections, etc.) even when
// one of the same template kind is already installed. Editing an
// existing server is reached via the installed-server-card's edit
// button, which opens `CustomServerEditor` instead.
export function InstallServerModal({
  entry,
  onClose,
  onSuccess,
}: InstallServerModalProps) {
  const { t } = useTranslation("openhands");
  const { mutate: addMcpServer, isPending: isAdding } = useAddMcpServer();
  const { mutate: testMcpServer, isPending: isTesting } = useTestMcpServer();
  const instanceId = useId();

  const installableOptions = getInstallableConnectionOptions(entry);
  const [selectedOptionId, setSelectedOptionId] = React.useState(() =>
    defaultInstallableOptionId(entry),
  );
  const selectedOption =
    installableOptions.find((o) => o.id === selectedOptionId) ??
    installableOptions[0];
  const template = selectedOption?.transport ?? getInstallableTemplate(entry);

  const [state, setState] = React.useState<FieldState>(() =>
    makeInitialState(template),
  );
  const [globalError, setGlobalError] = React.useState<string | null>(null);

  const isPending = isTesting || isAdding;

  const selectConnectionOption = (option: IntegrationConnectionOption) => {
    setSelectedOptionId(option.id);
    setState(makeInitialState(option.transport));
    setGlobalError(null);
  };

  const setValue = (key: string, value: string) => {
    setState((prev) => ({
      values: { ...prev.values, [key]: value },
      errors: { ...prev.errors, [key]: null },
    }));
    setGlobalError(null);
  };

  const makeTestErrorMessage = (failure: MCPTestFailure): string => {
    switch (failure.error_kind) {
      case "timeout":
        return t(I18nKey.MCP$TEST_ERROR_TIMEOUT);
      case "connection":
        return t(I18nKey.MCP$TEST_ERROR_CONNECTION);
      default:
        return t(I18nKey.MCP$TEST_ERROR_UNKNOWN, { error: failure.error });
    }
  };

  const submitServer = (payload: MCPServerConfig) => {
    testMcpServer(payload, {
      onSuccess: (result) => {
        if (!result.ok) {
          setGlobalError(makeTestErrorMessage(result));
          return;
        }
        addMcpServer(payload, {
          onSuccess: () => {
            displaySuccessToast(t(I18nKey.MCP$INSTALL_SUCCESS));
            onSuccess?.(entry);
            onClose();
          },
          onError: (err: unknown) => {
            const message = retrieveAxiosErrorMessage(err as AxiosError);
            setGlobalError(message || t(I18nKey.ERROR$GENERIC));
          },
        });
      },
      onError: (err: unknown) => {
        const message = retrieveAxiosErrorMessage(err as AxiosError);
        setGlobalError(message || t(I18nKey.ERROR$GENERIC));
      },
    });
  };

  const handleHttpServerSubmit = () => {
    if (!template || (template.kind !== "shttp" && template.kind !== "sse")) {
      return;
    }
    const errors: Record<string, string | null> = {};
    for (const field of template.urlFields ?? []) {
      if (field.required && !(state.values[field.key] ?? "").trim()) {
        errors[field.key] = t(I18nKey.MCP$ERROR_FIELD_REQUIRED);
      }
    }
    const apiKey = state.values.api_key?.trim() ?? "";
    if (!template.apiKeyOptional && !apiKey) {
      errors.api_key = t(I18nKey.MCP$ERROR_FIELD_REQUIRED);
    }
    if (Object.values(errors).some(Boolean)) {
      setState((prev) => ({ ...prev, errors }));
      return;
    }

    const payload: MCPServerConfig = {
      id: `${template.kind}-${instanceId}`,
      type: template.kind,
      url: resolveTransportUrl(template, state.values),
      ...(apiKey && { api_key: apiKey }),
    };
    submitServer(payload);
  };

  const handleStdioSubmit = () => {
    if (template?.kind !== "stdio") return;
    const stdio = template;
    const errors: Record<string, string | null> = {};

    for (const field of stdio.envFields ?? []) {
      if (field.required && !(state.values[field.key] ?? "").trim()) {
        errors[field.key] = t(I18nKey.MCP$ERROR_FIELD_REQUIRED);
      }
    }
    for (const field of stdio.argFields ?? []) {
      if (field.required && !(state.values[field.key] ?? "").trim()) {
        errors[field.key] = t(I18nKey.MCP$ERROR_FIELD_REQUIRED);
      }
    }
    if (Object.values(errors).some(Boolean)) {
      setState((prev) => ({ ...prev, errors }));
      return;
    }

    const env: Record<string, string> = {};
    for (const field of stdio.envFields ?? []) {
      const v = state.values[field.key]?.trim();
      if (v) env[field.key] = v;
    }
    const extraArgs: string[] = [];
    for (const field of stdio.argFields ?? []) {
      const v = state.values[field.key]?.trim();
      if (v) {
        for (const token of v.split(/\s+/)) {
          if (token) extraArgs.push(token);
        }
      }
    }

    const payload: MCPServerConfig = {
      id: `stdio-${instanceId}`,
      type: "stdio",
      name: stdio.serverName,
      command: stdio.command,
      args: [...stdio.args, ...extraArgs, ...(stdio.suffixArgs ?? [])],
      ...(Object.keys(env).length > 0 && { env }),
    };
    submitServer(payload);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setGlobalError(null);
    if (template?.kind === "shttp" || template?.kind === "sse") {
      return handleHttpServerSubmit();
    }
    return handleStdioSubmit();
  };

  const resolvedUrl =
    template?.kind === "shttp" || template?.kind === "sse"
      ? resolveTransportUrl(template, state.values)
      : "";

  const connectionHint =
    selectedOption?.installHint ??
    (installableOptions.length === 1 ? entry.installHint : undefined);

  const renderFields = () => {
    if (!template) return null;
    if (template.kind === "shttp" || template.kind === "sse") {
      const apiKeyOptional = template.apiKeyOptional ?? false;
      return (
        <>
          {(template.urlFields ?? []).map((field) => (
            <div key={field.key} className="flex flex-col gap-1">
              <SettingsInput
                testId={`mcp-install-field-${field.key}`}
                name={field.key}
                type={field.type === "password" ? "password" : "text"}
                label={field.label}
                value={state.values[field.key] ?? ""}
                onChange={(v) => setValue(field.key, v)}
                placeholder={field.placeholder}
                required={field.required}
                showOptionalTag={!field.required}
                className="w-full"
              />
              {field.helperText && (
                <p className="text-xs text-tertiary-alt">{field.helperText}</p>
              )}
              {state.errors[field.key] && (
                <p className="text-xs text-red-500">
                  {state.errors[field.key]}
                </p>
              )}
            </div>
          ))}
          <SettingsInput
            testId="mcp-install-field-url"
            name="url"
            type="url"
            label={t(I18nKey.SETTINGS$MCP_URL)}
            value={resolvedUrl || template.url}
            onChange={() => {}}
            isDisabled
            className="w-full"
          />
          <div className="flex flex-col gap-1">
            <SettingsInput
              testId="mcp-install-field-api_key"
              name="api_key"
              type="password"
              label={t(I18nKey.SETTINGS$MCP_API_KEY)}
              value={state.values.api_key ?? ""}
              onChange={(v) => setValue("api_key", v)}
              placeholder={t(I18nKey.SETTINGS$MCP_API_KEY_PLACEHOLDER)}
              showOptionalTag={apiKeyOptional}
              required={!apiKeyOptional}
              className="w-full"
            />
            {state.errors.api_key && (
              <p className="text-xs text-red-500">{state.errors.api_key}</p>
            )}
          </div>
        </>
      );
    }

    const stdio = template;
    return (
      <>
        <SettingsInput
          testId="mcp-install-field-command-readonly"
          name="command-readonly"
          type="text"
          label={t(I18nKey.MCP$COMMAND_LABEL)}
          value={`${stdio.command} ${stdio.args.join(" ")}`.trim()}
          onChange={() => {}}
          isDisabled
          className="w-full"
        />
        {(stdio.envFields ?? []).map((field) => (
          <div key={field.key} className="flex flex-col gap-1">
            <SettingsInput
              testId={`mcp-install-field-${field.key}`}
              name={field.key}
              type={field.type === "password" ? "password" : "text"}
              label={field.label}
              value={state.values[field.key] ?? ""}
              onChange={(v) => setValue(field.key, v)}
              placeholder={field.placeholder}
              required={field.required}
              showOptionalTag={!field.required}
              className="w-full"
            />
            {field.helperText && (
              <p className="text-xs text-tertiary-alt">{field.helperText}</p>
            )}
            {state.errors[field.key] && (
              <p className="text-xs text-red-500">{state.errors[field.key]}</p>
            )}
          </div>
        ))}
        {(stdio.argFields ?? []).map((field) => (
          <div key={field.key} className="flex flex-col gap-1">
            <SettingsInput
              testId={`mcp-install-field-${field.key}`}
              name={field.key}
              type={field.type === "password" ? "password" : "text"}
              label={field.label}
              value={state.values[field.key] ?? ""}
              onChange={(v) => setValue(field.key, v)}
              placeholder={field.placeholder}
              required={field.required}
              showOptionalTag={!field.required}
              className="w-full"
            />
            {field.helperText && (
              <p className="text-xs text-tertiary-alt">{field.helperText}</p>
            )}
            {state.errors[field.key] && (
              <p className="text-xs text-red-500">{state.errors[field.key]}</p>
            )}
          </div>
        ))}
      </>
    );
  };

  return (
    <ModalBackdrop onClose={onClose} aria-label={entry.name}>
      <form
        data-testid="mcp-install-modal"
        data-marketplace-id={entry.id}
        onSubmit={handleSubmit}
        className="relative bg-base-secondary p-6 rounded-xl flex flex-col gap-4 border border-[var(--oh-border)] w-[520px] max-w-[90vw] max-h-[85vh] overflow-y-auto custom-scrollbar"
      >
        <ModalCloseButton
          onClose={onClose}
          testId="mcp-install-modal-close"
          disabled={isPending}
        />
        <div className="flex items-start gap-3 pr-6">
          <McpLogoBadge entry={entry} />
          <div className="flex flex-col flex-1">
            <h2 className="text-lg font-semibold">{entry.name}</h2>
            <p className="text-xs text-tertiary-light">{entry.description}</p>
          </div>
        </div>

        {installableOptions.length > 1 && (
          <div
            className="flex flex-col gap-2"
            data-testid="mcp-install-connection-options"
          >
            {installableOptions.map((option) => (
              <label
                key={option.id}
                className="flex cursor-pointer items-center gap-2 text-sm text-foreground"
              >
                <input
                  type="radio"
                  name={`${instanceId}-connection-option`}
                  value={option.id}
                  checked={selectedOptionId === option.id}
                  onChange={() => selectConnectionOption(option)}
                  data-testid={`mcp-install-connection-${option.id}`}
                />
                <span>{option.label ?? option.id}</span>
              </label>
            ))}
          </div>
        )}

        {connectionHint && (
          <p className="text-xs text-tertiary-light">{connectionHint}</p>
        )}

        {entry.docsUrl && (
          <a
            href={entry.docsUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-[var(--oh-muted)] hover:text-white hover:underline self-start transition-colors"
          >
            {t(I18nKey.MCP$VIEW_DOCS)}
          </a>
        )}

        <div className="flex flex-col gap-3">{renderFields()}</div>

        {globalError && (
          <p
            data-testid="mcp-install-modal-error"
            className="text-sm text-red-500 whitespace-pre-wrap"
          >
            {globalError}
          </p>
        )}

        <div className="flex justify-end gap-2 mt-2">
          <BrandButton
            type="button"
            variant="secondary"
            onClick={onClose}
            testId="mcp-install-cancel"
          >
            {t(I18nKey.BUTTON$CANCEL)}
          </BrandButton>
          <BrandButton
            type="submit"
            variant="primary"
            isDisabled={isPending}
            testId="mcp-install-submit"
          >
            {isTesting
              ? t(I18nKey.MCP$VERIFYING)
              : isAdding
                ? t(I18nKey.SETTINGS$SAVING)
                : t(I18nKey.MCP$INSTALL_BUTTON)}
          </BrandButton>
        </div>
      </form>
    </ModalBackdrop>
  );
}
