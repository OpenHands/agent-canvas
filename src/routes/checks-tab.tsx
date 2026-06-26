import { useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  BadgeCheck,
  CircleCheck,
  CircleX,
  Clapperboard,
  FileCode,
  GitPullRequest,
  Loader2,
  ScrollText,
  TriangleAlert,
} from "lucide-react";

import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import {
  CheckResult,
  CHECK_RESULT_PATH,
  type CheckStatus,
  type VerifiedCheck,
} from "#/utils/check-result";
import {
  buildCheckApproval,
  CHECK_APPROVAL_PATH,
  CheckApproval,
} from "#/utils/check-approval";
import {
  CHECK_PR_PROMOTION_PATH,
  CheckPrPromotion,
} from "#/utils/check-pr-promotion";
import { DecisionLog, DECISIONS_PATH } from "#/utils/decision-log";
import { useWorkspaceFileContent } from "#/hooks/query/use-workspace-file-content";
import { useAutoRefreshFilesOnEdit } from "#/hooks/use-auto-refresh-files-on-edit";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useCurrentUserEmail } from "#/hooks/use-current-user-email";
import PrPromotionService from "#/api/pr-promotion-service";
import AgentServerRuntimeService from "#/api/runtime-service/agent-server-runtime-service";
import { useWorkspaceMutationCounter } from "#/stores/use-workspace-mutation-counter";
import { ConversationTabEmptyState } from "#/components/features/conversation/conversation-tab-empty-state";
import LinkExternalIcon from "#/icons/link-external.svg?react";

/** A recording referenced by an absolute URL (e.g. a media-branch raw URL,
 * post Bet D A3) is loaded directly; a worktree-relative path is resolved
 * against the workspace fileserver. */
function isAbsoluteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/** `1234` → `1.2s`, `420` → `420 ms`. Null when unrecorded. Plain TS (not JSX)
 * so the unit literals are outside the i18next lint scope; ms/s are SI symbols
 * we deliberately don't translate. */
function formatDuration(ms: number | null): string | null {
  if (ms === null || ms < 0) return null;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`;
}

/** Locale-formatted timestamp, or null when absent/unparseable. */
function formatTimestamp(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString();
}

function StatusBadge({
  status,
  label,
}: {
  status: CheckStatus;
  label: string;
}) {
  const passed = status === "passed";
  const Icon = passed ? CircleCheck : CircleX;
  return (
    <span
      data-testid={`checks-tab-status-${status}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-medium",
        passed
          ? "border-green-500/40 bg-green-500/10 text-green-200"
          : "border-red-500/40 bg-red-500/10 text-red-200",
      )}
    >
      <Icon
        className={cn(
          "size-4 shrink-0",
          passed ? "text-green-400" : "text-red-400",
        )}
        aria-hidden
      />
      {label}
    </span>
  );
}

function CheckRow({ check }: { check: VerifiedCheck }) {
  const { t } = useTranslation("openhands");
  const passed = check.status === "passed";
  const Icon = passed ? CircleCheck : CircleX;
  const duration = formatDuration(check.durationMs);
  // The colored icon conveys pass/fail visually; this label conveys it to
  // assistive tech (and is the visible text when the emitter gave no title,
  // so a titleless row never renders blank).
  const statusLabel = t(passed ? I18nKey.CHECKS$PASSED : I18nKey.CHECKS$FAILED);
  return (
    <li
      data-testid="checks-tab-check"
      data-status={check.status}
      className="flex flex-col gap-1.5 rounded-lg border border-[var(--oh-border)] p-3"
    >
      <div className="flex items-center gap-2">
        <Icon
          className={cn(
            "size-4 shrink-0",
            passed ? "text-green-400" : "text-red-400",
          )}
          aria-hidden
        />
        {check.title !== null ? (
          <span className="min-w-0 flex-1 break-words text-sm text-foreground">
            <span className="sr-only">{statusLabel}</span>
            {check.title}
          </span>
        ) : (
          <span className="min-w-0 flex-1 break-words text-sm text-foreground">
            {statusLabel}
          </span>
        )}
        {duration ? (
          <span className="shrink-0 font-mono text-xs text-[var(--oh-muted)]">
            {duration}
          </span>
        ) : null}
      </div>
      {check.error ? (
        <pre className="overflow-x-auto rounded-md bg-red-500/10 p-2 font-mono text-xs whitespace-pre-wrap text-red-200">
          {check.error}
        </pre>
      ) : null}
    </li>
  );
}

function ChecksTab() {
  const { t } = useTranslation("openhands");

  // Keep the verdict fresh as the agent writes `.checks/result.json` — same
  // mutation-counter signal the Files tab uses (multiple mounts are safe).
  useAutoRefreshFilesOnEdit();

  const resultQuery = useWorkspaceFileContent(CHECK_RESULT_PATH);
  const text = resultQuery.data?.text ?? null;
  const result = useMemo(() => (text ? CheckResult.parse(text) : null), [text]);

  const { data: conversation } = useActiveConversation();
  const currentUserEmail = useCurrentUserEmail();
  const workingDir = conversation?.workspace?.working_dir?.trim() || null;

  const approvalText =
    useWorkspaceFileContent(CHECK_APPROVAL_PATH).data?.text ?? null;
  const approval = useMemo(
    () => (approvalText ? CheckApproval.parse(approvalText) : null),
    [approvalText],
  );

  const promotionText =
    useWorkspaceFileContent(CHECK_PR_PROMOTION_PATH).data?.text ?? null;
  const promotion = useMemo(
    () => (promotionText ? CheckPrPromotion.parse(promotionText) : null),
    [promotionText],
  );

  const conversationLink =
    conversation?.id && typeof window !== "undefined"
      ? `${window.location.origin}/conversations/${conversation.id}`
      : null;

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (result?.status !== "passed") {
        throw new Error("Only passed check results can be approved");
      }
      if (!currentUserEmail) throw new Error("No current user identity");
      if (!workingDir) throw new Error("No conversation workspace");

      const nextApproval = buildCheckApproval({
        approvedBy: currentUserEmail,
        resultCreatedAt: result.createdAt,
      });

      await AgentServerRuntimeService.writeTextFile(
        conversation?.conversation_url,
        conversation?.session_api_key,
        CHECK_APPROVAL_PATH,
        CheckApproval.stringify(nextApproval),
        workingDir,
      );
    },
    onSuccess: () => {
      useWorkspaceMutationCounter.getState().bump();
    },
  });

  const promoteMutation = useMutation({
    mutationFn: async () => {
      if (result?.status !== "passed") {
        throw new Error("Only passed check results can be promoted");
      }
      if (!approval) throw new Error("No operator approval");
      if (!currentUserEmail) throw new Error("No current user identity");
      if (!workingDir) throw new Error("No conversation workspace");

      return PrPromotionService.promoteApprovedCheck({
        conversationUrl: conversation?.conversation_url,
        sessionApiKey: conversation?.session_api_key,
        workingDir,
        conversationTitle: conversation?.title,
        conversationLink,
        promotedBy: currentUserEmail,
        result,
        approval,
      });
    },
    onSuccess: () => {
      useWorkspaceMutationCounter.getState().bump();
    },
  });

  // The agent's reasoning trail, shown beside the verdict ("show me your work").
  // Append-only and best-effort — absent until the agent logs one; a single
  // malformed line is dropped, never the whole log.
  const decisionsText =
    useWorkspaceFileContent(DECISIONS_PATH).data?.text ?? null;
  const decisions = useMemo(
    () => (decisionsText ? DecisionLog.parse(decisionsText) : []),
    [decisionsText],
  );

  // Resolve the recording. Always call the hook (stable hook order) with the
  // worktree path only — null disables it for absolute URLs / no recording.
  const video = result?.video ?? null;
  const absoluteVideo = video !== null && isAbsoluteUrl(video);
  const videoQuery = useWorkspaceFileContent(
    video !== null && !absoluteVideo ? video : null,
  );
  const videoUrl = (() => {
    if (video === null) return null;
    if (absoluteVideo) return video;
    return videoQuery.data?.staticUrl ?? null;
  })();
  // A worktree recording that settled without a URL (the fetch errored, or the
  // query is disabled) is unavailable — distinguish that from in-flight so the
  // section doesn't spin forever. Absolute URLs never go through the hook.
  const videoUnavailable =
    video !== null &&
    !absoluteVideo &&
    videoUrl === null &&
    !videoQuery.isLoading;

  if (resultQuery.isLoading) {
    return (
      <div
        data-testid="checks-tab-loading"
        role="status"
        aria-label={t(I18nKey.HOME$LOADING)}
        className="flex h-full w-full items-center justify-center text-[var(--oh-muted)]"
      >
        <Loader2 className="size-5 animate-spin" aria-hidden />
      </div>
    );
  }

  // File exists but we can't make sense of it — be honest rather than show a
  // misleading "no checks yet".
  if (text !== null && result === null) {
    return (
      <ConversationTabEmptyState icon={<TriangleAlert />}>
        {t(I18nKey.CHECKS$UNREADABLE)}
      </ConversationTabEmptyState>
    );
  }

  if (result === null) {
    return (
      <ConversationTabEmptyState icon={<BadgeCheck />}>
        <span className="block font-medium text-foreground">
          {t(I18nKey.CHECKS$EMPTY)}
        </span>
        {t(I18nKey.CHECKS$EMPTY_HINT)}
      </ConversationTabEmptyState>
    );
  }

  const timestamp = formatTimestamp(result.createdAt);

  return (
    <main
      data-testid="checks-tab"
      className="h-full w-full overflow-y-auto custom-scrollbar-always"
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <StatusBadge
            status={result.status}
            label={
              result.status === "passed"
                ? t(I18nKey.CHECKS$PASSED)
                : t(I18nKey.CHECKS$FAILED)
            }
          />
          {timestamp ? (
            <time className="ml-auto text-xs text-[var(--oh-muted)]">
              {timestamp}
            </time>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 rounded-lg border border-[var(--oh-border)] p-3">
          {approval ? (
            <div
              data-testid="checks-tab-approval"
              className="flex flex-col gap-1"
            >
              <span className="text-sm font-medium text-foreground">
                {t(I18nKey.CHECKS$APPROVED)}
              </span>
              <span className="text-xs text-[var(--oh-muted)]">
                {approval.approvedBy}
              </span>
            </div>
          ) : result.status === "passed" ? (
            <button
              type="button"
              data-testid="checks-tab-approve-button"
              disabled={
                approveMutation.isPending || !currentUserEmail || !workingDir
              }
              onClick={() => approveMutation.mutate()}
              className="self-start rounded-md border border-[var(--oh-border)] px-3 py-1.5 text-sm font-medium text-foreground hover:bg-[var(--oh-interactive-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {approveMutation.isPending
                ? t(I18nKey.CHECKS$APPROVING)
                : t(I18nKey.CHECKS$APPROVE)}
            </button>
          ) : null}
          {promotion ? (
            <a
              href={promotion.url}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="checks-tab-pr-link"
              className="inline-flex w-fit items-center gap-1.5 rounded-md border border-[var(--oh-border)] px-3 py-1.5 text-sm font-medium text-foreground hover:bg-[var(--oh-interactive-hover)]"
            >
              <GitPullRequest className="size-4" aria-hidden />
              {t(I18nKey.CHECKS$DRAFT_PR_READY)} #{promotion.number}
            </a>
          ) : approval && result.status === "passed" ? (
            <button
              type="button"
              data-testid="checks-tab-promote-pr-button"
              disabled={
                promoteMutation.isPending || !currentUserEmail || !workingDir
              }
              onClick={() => promoteMutation.mutate()}
              className="inline-flex w-fit items-center gap-1.5 rounded-md border border-[var(--oh-border)] px-3 py-1.5 text-sm font-medium text-foreground hover:bg-[var(--oh-interactive-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <GitPullRequest className="size-4" aria-hidden />
              {promoteMutation.isPending
                ? t(I18nKey.CHECKS$PROMOTING_PR)
                : t(I18nKey.CHECKS$PROMOTE_PR)}
            </button>
          ) : null}
          <p className="text-xs text-[var(--oh-muted)]">
            {t(I18nKey.CHECKS$ADVISORY)}
          </p>
          {approveMutation.isError ? (
            <p className="text-xs text-red-200">
              {t(I18nKey.CHECKS$APPROVAL_ERROR)}
            </p>
          ) : null}
          {promoteMutation.isError ? (
            <p className="text-xs text-red-200">
              {t(I18nKey.CHECKS$PR_PROMOTION_ERROR)}
            </p>
          ) : null}
        </div>

        {result.spec ? (
          <section className="flex flex-col gap-1.5">
            <h2 className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-[var(--oh-muted)] uppercase">
              <FileCode className="size-3.5" aria-hidden />
              {t(I18nKey.CHECKS$SPEC)}
            </h2>
            <code className="rounded-md border border-[var(--oh-border)] bg-black/20 px-2 py-1.5 font-mono text-xs break-all text-foreground">
              {result.spec}
            </code>
          </section>
        ) : null}

        {result.checks.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {result.checks.map((check, index) => (
              <CheckRow key={`${check.title}-${index}`} check={check} />
            ))}
          </ul>
        ) : null}

        {video !== null ? (
          <section className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <h2 className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-[var(--oh-muted)] uppercase">
                <Clapperboard className="size-3.5" aria-hidden />
                {t(I18nKey.CHECKS$RECORDING)}
              </h2>
              {videoUrl ? (
                <a
                  href={videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t(I18nKey.FILES$OPEN_IN_NEW_WINDOW)}
                  title={t(I18nKey.FILES$OPEN_IN_NEW_WINDOW)}
                  data-testid="checks-tab-video-open"
                  className="ml-auto flex size-6 items-center justify-center rounded-[7px] text-foreground hover:bg-[var(--oh-interactive-hover)]"
                >
                  <LinkExternalIcon width={13} height={13} />
                </a>
              ) : null}
            </div>
            {videoUrl ? (
              // shortcut: a worktree-relative .webm reaches the cloud renderer
              // as an `application/octet-stream` data URI (use-workspace-file-content
              // classifies it as binary), which some browsers won't decode in
              // <video>. The open-in-new-window link above is the reliable path
              // until A2/A3 emit recordings — then add a `video` kind to the
              // content hook (correct MIME) or serve via a media-branch URL.
              <video
                controls
                preload="metadata"
                src={videoUrl}
                data-testid="checks-tab-video"
                className="w-full rounded-lg border border-[var(--oh-border)] bg-black"
              >
                {/* Silent screen recording — no spoken audio to caption. The
                    empty captions track satisfies a11y without a cue file. */}
                <track kind="captions" />
              </video>
            ) : videoUnavailable ? (
              <div
                data-testid="checks-tab-video-unavailable"
                className="flex h-24 items-center justify-center rounded-lg border border-[var(--oh-border)] text-sm text-[var(--oh-muted)]"
              >
                {t(I18nKey.CHECKS$RECORDING_UNAVAILABLE)}
              </div>
            ) : (
              <div
                data-testid="checks-tab-video-loading"
                role="status"
                aria-label={t(I18nKey.HOME$LOADING)}
                className="flex h-24 items-center justify-center rounded-lg border border-[var(--oh-border)] text-[var(--oh-muted)]"
              >
                <Loader2 className="size-4 animate-spin" aria-hidden />
              </div>
            )}
          </section>
        ) : null}

        {decisions.length > 0 ? (
          <section className="flex flex-col gap-1.5">
            <h2 className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-[var(--oh-muted)] uppercase">
              <ScrollText className="size-3.5" aria-hidden />
              {t(I18nKey.CHECKS$DECISIONS)}
            </h2>
            <ol className="flex flex-col gap-2">
              {decisions.map((decision, index) => (
                <li
                  key={`${decision.decision}-${index}`}
                  data-testid="checks-tab-decision"
                  className="flex flex-col gap-1.5 rounded-lg border border-[var(--oh-border)] p-3"
                >
                  <span className="break-words text-sm text-foreground">
                    {decision.decision}
                  </span>
                  {decision.why ? (
                    <span className="break-words text-xs text-[var(--oh-muted)]">
                      {decision.why}
                    </span>
                  ) : null}
                  {decision.evidence ? (
                    <pre className="overflow-x-auto rounded-md bg-black/20 p-2 font-mono text-xs whitespace-pre-wrap text-[var(--oh-muted)]">
                      {decision.evidence}
                    </pre>
                  ) : null}
                  {decision.outcome ? (
                    <span className="self-start rounded-full border border-[var(--oh-border)] px-2 py-0.5 text-xs text-foreground">
                      {decision.outcome}
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>
        ) : null}
      </div>
    </main>
  );
}

export default ChecksTab;
