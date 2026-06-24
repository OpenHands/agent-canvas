import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import type { AgentProfileDiagnostics } from "#/api/agent-profiles-service/agent-profiles-service.api";
import { Typography } from "#/ui/typography";
import { LoadingSpinner } from "#/components/shared/loading-spinner";
import { cn } from "#/utils/utils";
import { I18nKey } from "#/i18n/declaration";
import { ACP_CUSTOM_PRESET_KEY } from "#/constants/acp-providers";
import { useMaterializeAgentProfile } from "#/hooks/query/use-materialize-agent-profile";
import { SectionShell } from "./sections/section-shell";
import type { AgentProfileForm } from "./use-agent-profile-form";

interface AgentProfileOverviewProps {
  form: AgentProfileForm;
  /** The saved profile name (edit mode); null in create mode. Drives the
   * server-resolved materialize call. */
  profileName: string | null;
}

/** Safely read `resolved_settings.llm.model` from the redacted dump. */
function resolvedModel(
  diag: AgentProfileDiagnostics | undefined,
): string | null {
  const settings = diag?.resolved_settings;
  if (settings && typeof settings === "object" && "llm" in settings) {
    const llm = (settings as { llm?: unknown }).llm;
    if (llm && typeof llm === "object" && "model" in llm) {
      const model = (llm as { model?: unknown }).model;
      if (typeof model === "string") return model;
    }
  }
  return null;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <Typography.Text className="shrink-0 text-xs text-[#717888]">
        {label}
      </Typography.Text>
      <div className="text-right text-sm text-white">{children}</div>
    </div>
  );
}

/**
 * "What this agent will do" — the legibility + QA panel. It prefers the
 * server-resolved view (`POST /api/agent-profiles/{name}/materialize`, edit mode
 * only) and falls back to a live preview derived from the current form so the
 * panel is never empty (including create / unsaved edits). The materialize call
 * also surfaces dangling refs and missing credentials the form can't know.
 */
export function AgentProfileOverview({
  form,
  profileName,
}: AgentProfileOverviewProps) {
  const { t } = useTranslation("openhands");
  const {
    data: diag,
    isLoading,
    isError,
  } = useMaterializeAgentProfile(form.mode === "edit" ? profileName : null);

  const mcpScope = (refs: string[] | null): string => {
    if (refs === null) return t(I18nKey.SETTINGS$AGENT_OVERVIEW_MCP_ALL);
    if (refs.length === 0) return t(I18nKey.SETTINGS$AGENT_OVERVIEW_MCP_NONE);
    return refs.join(", ");
  };

  // Prefer the server-resolved server list whenever materialize returned one —
  // including the empty array (the profile genuinely resolves to no servers, so
  // show "None", not the live-form "All servers" scope). Fall back to the form
  // preview only when there is no resolved view (create / loading / error).
  const mcpRowValue = (): string => {
    const resolved = diag?.resolved_mcp_servers;
    if (resolved) {
      return resolved.length
        ? resolved.join(", ")
        : t(I18nKey.SETTINGS$AGENT_OVERVIEW_MCP_NONE);
    }
    return mcpScope(form.mcpServerRefs);
  };

  // The condenser trigger count, guarded so a profile whose condenser carries no
  // `max_size` (e.g. a non-summarizing kind) renders the default rather than the
  // literal string "NaN".
  const condenserTriggerCount = (): number => {
    const n = Number(form.condenser.max_size);
    return Number.isFinite(n) ? n : 240;
  };

  const statusBanner = () => {
    if (form.mode !== "edit") return null;
    if (isLoading) {
      return (
        <div className="flex items-center gap-2 text-sm text-[#A3A3A3]">
          <LoadingSpinner size="small" />
          {t(I18nKey.SETTINGS$AGENT_OVERVIEW_RESOLVING)}
        </div>
      );
    }
    if (isError || !diag) {
      return (
        <Typography.Text className="text-sm text-[#A3A3A3]">
          {t(I18nKey.SETTINGS$AGENT_OVERVIEW_UNAVAILABLE)}
        </Typography.Text>
      );
    }
    const issues = [
      ...diag.errors,
      ...diag.dangling_mcp_server_refs.map((n) =>
        t(I18nKey.SETTINGS$AGENT_OVERVIEW_MISSING_SERVER, { name: n }),
      ),
    ];
    if (diag.agent_kind === "openhands" && !diag.llm_api_key_set) {
      issues.push(t(I18nKey.SETTINGS$AGENT_OVERVIEW_API_KEY_MISSING));
    }
    const ok = diag.valid && issues.length === 0;
    return (
      <div
        data-testid="agent-profile-overview-status"
        className={cn(
          "flex flex-col gap-1.5 rounded-md border p-3",
          ok
            ? "border-green-700/50 bg-green-900/15"
            : "border-yellow-700/50 bg-yellow-900/15",
        )}
      >
        <Typography.Text
          className={cn(
            "text-sm font-medium",
            ok ? "text-green-400" : "text-yellow-400",
          )}
        >
          {ok
            ? t(I18nKey.SETTINGS$AGENT_OVERVIEW_READY)
            : t(I18nKey.SETTINGS$AGENT_OVERVIEW_ISSUES, {
                count: issues.length,
              })}
        </Typography.Text>
        {issues.map((issue) => (
          <Typography.Text key={issue} className="text-xs text-yellow-200/80">
            • {issue}
          </Typography.Text>
        ))}
      </div>
    );
  };

  const rows = () => {
    if (!form.isAcp) {
      const model = resolvedModel(diag);
      return (
        <>
          <Row label={t(I18nKey.SETTINGS$AGENT_OVERVIEW_MODEL)}>
            {model ?? (
              <span className="text-[#A3A3A3]">
                {t(I18nKey.SETTINGS$AGENT_OVERVIEW_VIA_PROFILE, {
                  name: form.llmProfileRef || "—",
                })}
              </span>
            )}
          </Row>
          <Row label={t(I18nKey.SETTINGS$AGENT_OVERVIEW_MCP)}>
            {mcpRowValue()}
          </Row>
          <Row label={t(I18nKey.SETTINGS$NAV_CONDENSER)}>
            {form.condenser.enabled
              ? t(I18nKey.SETTINGS$AGENT_OVERVIEW_MEMORY_TRIGGER, {
                  count: condenserTriggerCount(),
                })
              : t(I18nKey.SETTINGS$AGENT_OVERVIEW_DISABLED)}
          </Row>
          <Row label={t(I18nKey.SCHEMA$ENABLE_SUB_AGENTS$LABEL)}>
            {form.enableSubAgents
              ? t(I18nKey.SETTINGS$AGENT_OVERVIEW_ENABLED)
              : t(I18nKey.SETTINGS$AGENT_OVERVIEW_DISABLED)}
          </Row>
        </>
      );
    }
    const providerLabel =
      form.selectedPreset === ACP_CUSTOM_PRESET_KEY
        ? t(I18nKey.SETTINGS$AGENT_PRESET_CUSTOM)
        : (form.selectedProvider?.display_name ?? form.selectedPreset);
    return (
      <>
        <Row label={t(I18nKey.SETTINGS$AGENT_OVERVIEW_PROVIDER)}>
          {providerLabel}
        </Row>
        <Row label={t(I18nKey.SETTINGS$AGENT_OVERVIEW_MODEL)}>
          {form.acpModel.trim() || (
            <span className="text-[#A3A3A3]">
              {t(I18nKey.SETTINGS$AGENT_OVERVIEW_PROVIDER_DEFAULT_MODEL)}
            </span>
          )}
        </Row>
        <Row label={t(I18nKey.SETTINGS$AGENT_OVERVIEW_MCP)}>
          {mcpRowValue()}
        </Row>
        {form.sessionMode.trim() && (
          <Row label={t(I18nKey.SETTINGS$AGENT_OVERVIEW_SESSION_MODE)}>
            {form.sessionMode.trim()}
          </Row>
        )}
      </>
    );
  };

  return (
    <SectionShell
      title={t(I18nKey.SETTINGS$AGENT_OVERVIEW_TITLE)}
      description={t(I18nKey.SETTINGS$AGENT_OVERVIEW_DESC)}
    >
      {statusBanner()}
      <div
        className="divide-y divide-[#3D4046]/60 rounded-md border border-[#3D4046] px-3"
        data-testid="agent-profile-overview-rows"
      >
        {rows()}
      </div>
      {form.mode !== "edit" && (
        <Typography.Text className="text-xs text-[#717888]">
          {t(I18nKey.SETTINGS$AGENT_OVERVIEW_SAVE_TO_RESOLVE)}
        </Typography.Text>
      )}
    </SectionShell>
  );
}
