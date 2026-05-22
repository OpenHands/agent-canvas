import React from "react";
import { useTranslation } from "react-i18next";
import { AxiosError } from "axios";
import { X } from "lucide-react";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { BrandButton } from "#/components/features/settings/brand-button";
import { SettingsInput } from "#/components/features/settings/settings-input";
import { I18nKey } from "#/i18n/declaration";
import type { McpCatalogEntry as MarketplaceEntry } from "@openhands/extensions/mcps";
import { McpLogoBadge } from "#/components/features/mcp-logo-badge";
import { MCPServerConfig } from "#/types/mcp-server";
import { useAddMcpServer } from "#/hooks/mutation/use-add-mcp-server";
import { displaySuccessToast } from "#/utils/custom-toast-handlers";
import { retrieveAxiosErrorMessage } from "#/utils/retrieve-axios-error-message";
import {
  MODAL_MAX_WIDTH_VIEWPORT,
  modalWidthClassName,
} from "#/components/shared/modals/modal-body";
import { cn } from "#/utils/utils";

const ICON_BUTTON_CLASS =
  "rounded-md p-1 text-white hover:bg-tertiary cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed";

interface InstallServerModalProps {
  entry: MarketplaceEntry;
  onClose: () => void;
  onSuccess?: (entry: MarketplaceEntry) => void;
}

interface FieldState {
  values: Record<string, string>;
  errors: Record<string, string | null>;
}

function makeInitialState(entry: MarketplaceEntry): FieldState {
  const values: Record<string, string> = {};
  if (entry.template.kind === "stdio") {
    for (const field of entry.template.envFields ?? []) {
      values[field.key] = "";
    }
    for (const field of entry.template.argFields ?? []) {
      values[field.key] = "";
    }
  } else if (entry.template.kind === "shttp" || entry.template.kind === "sse") {
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

  const [state, setState] = React.useState<FieldState>(() =>
    makeInitialState(entry),
  );
  const [globalError, setGlobalError] = React.useState<string | null>(null);

  const isPending = isAdding;

  const setValue = (key: string, value: string) => {
    setState((prev) => ({
      values: { ...prev.values, [key]: value },
      errors: { ...prev.errors, [key]: null },
    }));
    setGlobalError(null);
  };

  const submitServer = (payload: MCPServerConfig) => {
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
  };

  // ------------------------------------------------------------------
  // Per-template submit handlers. Each is small and self-contained:
  // validate user input, build the payload, then hand off to
  // submitServer.
  // ------------------------------------------------------------------
  const handleHttpServerSubmit = () => {
    // TS narrows this branch to shttp|sse; the equality guard is a
    // runtime/defensive belt to make the helper safe in isolation.
    if (entry.template.kind !== "shttp" && entry.template.kind !== "sse") {
      return;
    }
    const apiKey = state.values.api_key?.trim() ?? "";
    if (!entry.template.apiKeyOptional && !apiKey) {
      setState((prev) => ({
        ...prev,
        errors: { api_key: t(I18nKey.MCP$ERROR_FIELD_REQUIRED) },
      }));
      return;
    }
    const payload: MCPServerConfig = {
      id: `${entry.template.kind}-${Date.now()}`,
      type: entry.template.kind,
      url: entry.template.url,
      ...(apiKey && { api_key: apiKey }),
    };
    submitServer(payload);
  };

  const handleStdioSubmit = () => {
    if (entry.template.kind !== "stdio") return;
    const stdio = entry.template;
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
      id: `stdio-${Date.now()}`,
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
    if (entry.template.kind === "shttp" || entry.template.kind === "sse") {
      return handleHttpServerSubmit();
    }
    return handleStdioSubmit();
  };

  const renderFields = () => {
    if (entry.template.kind === "shttp" || entry.template.kind === "sse") {
      const apiKeyOptional = entry.template.apiKeyOptional ?? false;
      return (
        <>
          <SettingsInput
            testId="mcp-install-field-url"
            name="url"
            type="url"
            label={t(I18nKey.SETTINGS$MCP_URL)}
            value={entry.template.url}
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

    const stdio = entry.template;
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
        className={cn(
          "bg-base-secondary p-6 rounded-xl flex flex-col gap-4 border border-[var(--oh-border)] max-h-[85vh] overflow-y-auto custom-scrollbar",
          modalWidthClassName("md"),
          MODAL_MAX_WIDTH_VIEWPORT,
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <McpLogoBadge entry={entry} />
            <div className="flex min-w-0 flex-1 flex-col">
              <h2 className="text-lg font-semibold text-content-2">
                {entry.name}
              </h2>
              <p className="text-xs text-tertiary-alt">{entry.description}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className={ICON_BUTTON_CLASS}
            aria-label={t(I18nKey.BUTTON$CLOSE)}
            data-testid="close-mcp-install-modal"
          >
            <X size={20} aria-hidden />
          </button>
        </div>

        {entry.installHint && (
          <p className="text-xs text-content-2">{entry.installHint}</p>
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
            className="text-sm text-red-500"
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
            {isPending
              ? t(I18nKey.SETTINGS$SAVING)
              : t(I18nKey.MCP$INSTALL_BUTTON)}
          </BrandButton>
        </div>
      </form>
    </ModalBackdrop>
  );
}
