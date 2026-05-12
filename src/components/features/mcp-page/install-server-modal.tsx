import React from "react";
import { useTranslation } from "react-i18next";
import { AxiosError } from "axios";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { BrandButton } from "#/components/features/settings/brand-button";
import { SettingsInput } from "#/components/features/settings/settings-input";
import { I18nKey } from "#/i18n/declaration";
import { MarketplaceEntry } from "#/constants/mcp-marketplace";
import {
  ExistingInstall,
  MCPServerConfig,
  isMcpInstall,
} from "#/types/mcp-server";
import { useAddMcpServer } from "#/hooks/mutation/use-add-mcp-server";
import { useUpdateMcpServer } from "#/hooks/mutation/use-update-mcp-server";
import { useSaveSettings } from "#/hooks/mutation/use-save-settings";
import { displaySuccessToast } from "#/utils/custom-toast-handlers";
import { retrieveAxiosErrorMessage } from "#/utils/retrieve-axios-error-message";

interface InstallServerModalProps {
  entry: MarketplaceEntry;
  /** Existing install (if any) — drives Edit vs Add. */
  existing?: ExistingInstall | null;
  onClose: () => void;
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
  } else if (entry.template.kind === "tavily-builtin") {
    values.search_api_key = "";
  }
  return { values, errors: {} };
}

export function InstallServerModal({
  entry,
  existing,
  onClose,
}: InstallServerModalProps) {
  const { t } = useTranslation("openhands");
  const { mutate: addMcpServer, isPending: isAdding } = useAddMcpServer();
  const { mutate: updateMcpServer, isPending: isUpdating } =
    useUpdateMcpServer();
  const { mutate: saveSettings, isPending: isSavingSettings } =
    useSaveSettings();

  const [state, setState] = React.useState<FieldState>(() =>
    makeInitialState(entry),
  );
  const [globalError, setGlobalError] = React.useState<string | null>(null);

  const isEditing = !!existing;
  const isPending = isAdding || isUpdating || isSavingSettings;

  const setValue = (key: string, value: string) => {
    setState((prev) => ({
      values: { ...prev.values, [key]: value },
      errors: { ...prev.errors, [key]: null },
    }));
    setGlobalError(null);
  };

  // ------------------------------------------------------------------
  // Shared add-or-update plumbing. Every per-template handler funnels
  // through this to keep success/error handling consistent (single
  // toast + single error path), and to centralize the "create new vs.
  // update existing" branching.
  // ------------------------------------------------------------------
  const submitServer = (payload: MCPServerConfig) => {
    const onSuccess = () => {
      displaySuccessToast(t(I18nKey.MCP$INSTALL_SUCCESS));
      onClose();
    };
    const onError = (err: unknown) => {
      const message = retrieveAxiosErrorMessage(err as AxiosError);
      setGlobalError(message || t(I18nKey.ERROR$GENERIC));
    };
    if (isMcpInstall(existing)) {
      updateMcpServer(
        { serverId: existing.server.id, server: payload },
        { onSuccess, onError },
      );
    } else {
      addMcpServer(payload, { onSuccess, onError });
    }
  };

  // ------------------------------------------------------------------
  // Per-template submit handlers. Each is small and self-contained:
  // validate user input, build the payload, then hand off to
  // submitServer / saveSettings.
  // ------------------------------------------------------------------
  const handleTavilySubmit = () => {
    const key = state.values.search_api_key?.trim() ?? "";
    if (!key && !isEditing) {
      setState((prev) => ({
        ...prev,
        errors: { search_api_key: t(I18nKey.MCP$ERROR_FIELD_REQUIRED) },
      }));
      return;
    }
    saveSettings(
      { search_api_key: key },
      {
        onSuccess: () => {
          displaySuccessToast(t(I18nKey.MCP$INSTALL_SUCCESS));
          onClose();
        },
        onError: (err) => {
          const message = retrieveAxiosErrorMessage(err as AxiosError);
          setGlobalError(message || t(I18nKey.ERROR$GENERIC));
        },
      },
    );
  };

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
    const existingMcp = isMcpInstall(existing) ? existing.server : null;
    const payload: MCPServerConfig = {
      id: existingMcp?.id ?? `${entry.template.kind}-${Date.now()}`,
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

    const existingMcp = isMcpInstall(existing) ? existing.server : null;
    const payload: MCPServerConfig = {
      id: existingMcp?.id ?? `stdio-${Date.now()}`,
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
    if (entry.template.kind === "tavily-builtin") return handleTavilySubmit();
    if (entry.template.kind === "shttp" || entry.template.kind === "sse") {
      return handleHttpServerSubmit();
    }
    return handleStdioSubmit();
  };

  const renderFields = () => {
    if (entry.template.kind === "tavily-builtin") {
      return (
        <div className="flex flex-col gap-1">
          <SettingsInput
            testId="mcp-install-field-search_api_key"
            name="search_api_key"
            type="password"
            label={t(I18nKey.SETTINGS$SEARCH_API_KEY)}
            value={state.values.search_api_key ?? ""}
            onChange={(v) => setValue("search_api_key", v)}
            placeholder="tvly-..."
            className="w-full"
          />
          {/* `handleTavilySubmit` sets this error on submit when the
              key is empty; render it inline so the user actually sees
              the validation failure (previously the state was set but
              never displayed). */}
          {state.errors.search_api_key && (
            <p className="text-xs text-red-500">
              {state.errors.search_api_key}
            </p>
          )}
        </div>
      );
    }

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
        className="bg-base-secondary p-6 rounded-xl flex flex-col gap-4 border border-tertiary w-[520px] max-w-[90vw] max-h-[85vh] overflow-y-auto custom-scrollbar"
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="shrink-0 inline-flex items-center justify-center h-10 w-10 rounded-lg"
            style={{
              backgroundColor: entry.iconBg,
              color: entry.iconColor ?? "#FFFFFF",
            }}
          >
            {entry.logo}
          </span>
          <div className="flex flex-col flex-1">
            <h2 className="text-lg font-semibold">{entry.name}</h2>
            <p className="text-xs text-tertiary-alt">{entry.description}</p>
          </div>
        </div>

        {entry.installHint && (
          <p className="text-xs text-content-2">{entry.installHint}</p>
        )}

        {entry.docsUrl && (
          <a
            href={entry.docsUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-primary hover:underline self-start"
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

        <div className="grid grid-cols-2 gap-2 mt-2">
          <BrandButton
            type="submit"
            variant="primary"
            isDisabled={isPending}
            testId="mcp-install-submit"
            className="w-full text-center"
          >
            {(() => {
              if (isPending) return t(I18nKey.SETTINGS$SAVING);
              if (isEditing) return t(I18nKey.SETTINGS$MCP_SAVE_SERVER);
              return t(I18nKey.MCP$INSTALL_BUTTON);
            })()}
          </BrandButton>
          <BrandButton
            type="button"
            variant="secondary"
            onClick={onClose}
            testId="mcp-install-cancel"
            className="w-full text-center"
          >
            {t(I18nKey.BUTTON$CANCEL)}
          </BrandButton>
        </div>
      </form>
    </ModalBackdrop>
  );
}
