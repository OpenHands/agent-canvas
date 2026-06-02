import React from "react";
import { useTranslation } from "react-i18next";
import { AxiosError } from "axios";
import { v4 as uuidv4 } from "uuid";
import type { MCPTestFailure } from "@openhands/typescript-client";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { ModalCloseButton } from "#/components/shared/modals/modal-close-button";
import { BrandButton } from "#/components/features/settings/brand-button";
import { SettingsInput } from "#/components/features/settings/settings-input";
import { I18nKey } from "#/i18n/declaration";
import type { IntegrationCatalogEntry as MarketplaceEntry } from "@openhands/extensions/integrations";
import { McpLogoBadge } from "#/components/features/mcp-logo-badge";
import { MCPServerConfig } from "#/types/mcp-server";
import { useAddMcpServer } from "#/hooks/mutation/use-add-mcp-server";
import { useTestMcpServer } from "#/hooks/mutation/use-test-mcp-server";
import { displaySuccessToast } from "#/utils/custom-toast-handlers";
import {
  getInstallableMcpConnectionOption,
  type McpMarketplaceConnectionOption,
} from "#/utils/mcp-marketplace-utils";
import { retrieveAxiosErrorMessage } from "#/utils/retrieve-axios-error-message";
import { modalTitleLgClassName } from "#/utils/modal-classes";

interface InstallServerModalProps {
  entry: MarketplaceEntry;
  onClose: () => void;
  onSuccess?: (entry: MarketplaceEntry) => void;
}

interface FieldState {
  values: Record<string, string>;
  errors: Record<string, string | null>;
}

function optionNeedsCredentialField(
  option: McpMarketplaceConnectionOption | undefined,
): boolean {
  if (option?.transport.kind !== "shttp" && option?.transport.kind !== "sse") {
    return false;
  }
  return ["api_key", "bearer", "basic"].includes(option.auth.strategy);
}

function isCredentialOptional(option: McpMarketplaceConnectionOption): boolean {
  if (option.transport.kind === "stdio") {
    return option.auth.apiKeyOptional ?? false;
  }
  return option.auth.apiKeyOptional ?? option.transport.apiKeyOptional ?? false;
}

function makeInitialState(entry: MarketplaceEntry): FieldState {
  const values: Record<string, string> = {};
  const option = getInstallableMcpConnectionOption(entry);
  const template = option?.transport;
  if (template?.kind === "stdio") {
    for (const field of template.envFields ?? []) {
      values[field.key] = "";
    }
    for (const field of template.argFields ?? []) {
      values[field.key] = "";
    }
  } else if (optionNeedsCredentialField(option)) {
    values.api_key = "";
  }
  return { values, errors: {} };
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

  const [state, setState] = React.useState<FieldState>(() =>
    makeInitialState(entry),
  );
  const [globalError, setGlobalError] = React.useState<string | null>(null);
  const option = getInstallableMcpConnectionOption(entry);
  const template = option?.transport;

  const isPending = isTesting || isAdding;

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
          // Modal stays open — do NOT call onClose.
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

  // ------------------------------------------------------------------
  // Per-template submit handlers. Each is small and self-contained:
  // validate user input, build the payload, then hand off to
  // submitServer.
  // ------------------------------------------------------------------
  const handleHttpServerSubmit = () => {
    // TS narrows this branch to shttp|sse; the equality guard is a
    // runtime/defensive belt to make the helper safe in isolation.
    if (template?.kind !== "shttp" && template?.kind !== "sse") {
      return;
    }
    if (!option) return;
    const apiKey = state.values.api_key?.trim() ?? "";
    const needsCredential = optionNeedsCredentialField(option);
    if (needsCredential && !isCredentialOptional(option) && !apiKey) {
      setState((prev) => ({
        ...prev,
        errors: { api_key: t(I18nKey.MCP$ERROR_FIELD_REQUIRED) },
      }));
      return;
    }
    const payload: MCPServerConfig = {
      id: `${template.kind}-${uuidv4()}`,
      type: template.kind,
      url: template.url,
      ...(needsCredential && apiKey && { api_key: apiKey }),
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
        // Filesystem-style multi-token input: split on whitespace.
        for (const token of v.split(/\s+/)) {
          if (token) extraArgs.push(token);
        }
      }
    }

    const payload: MCPServerConfig = {
      id: `stdio-${uuidv4()}`,
      type: "stdio",
      name: stdio.serverName,
      command: stdio.command,
      args: [...stdio.args, ...extraArgs],
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

  const renderFields = () => {
    if (template?.kind === "shttp" || template?.kind === "sse") {
      const shouldRenderCredential = optionNeedsCredentialField(option);
      const apiKeyOptional = option ? isCredentialOptional(option) : false;
      return (
        <>
          <SettingsInput
            testId="mcp-install-field-url"
            name="url"
            type="url"
            label={t(I18nKey.SETTINGS$MCP_URL)}
            value={template.url}
            onChange={() => {}}
            isDisabled
            className="w-full"
          />
          {shouldRenderCredential ? (
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
          ) : null}
        </>
      );
    }

    if (template?.kind !== "stdio") return null;
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
            <h2 className={modalTitleLgClassName}>{entry.name}</h2>
            <p className="text-xs text-tertiary-light">{entry.description}</p>
          </div>
        </div>

        {entry.installHint && (
          <p className="text-xs text-tertiary-light">{entry.installHint}</p>
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
