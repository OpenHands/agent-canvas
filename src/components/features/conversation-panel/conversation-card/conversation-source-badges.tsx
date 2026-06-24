import { Sparkles, SquareKanban, User } from "lucide-react";
import { cn } from "#/utils/utils";
import {
  ConversationSource,
  type ConversationSource as ConversationSourceData,
} from "./conversation-source";
import type { AppConversation } from "#/api/conversation-service/agent-server-conversation-service.types";

interface ConversationSourceBadgesProps {
  tags: AppConversation["tags"];
  className?: string;
}

const BADGE_CLASS =
  "inline-flex max-w-full min-w-0 items-center gap-1 rounded-full bg-[var(--oh-surface-raised)] px-1.5 py-px text-[11px] leading-4 text-[var(--oh-muted)]";

function badgeLabel(source: ConversationSourceData): string {
  // Linear issues link out; a link badge needs an interactive role and an
  // accessible name. Plain badges fall back to a `title` for the same text.
  return [source.origin, source.linear, source.requester]
    .filter(Boolean)
    .join(" · ");
}

export function ConversationSourceBadges({
  tags,
  className,
}: ConversationSourceBadgesProps) {
  const source = ConversationSource.fromTags(tags);
  if (!source) {
    return null;
  }

  const linearBadge = source.linear ? (
    <span className={BADGE_CLASS} title={source.linear}>
      <SquareKanban size={12} className="shrink-0" aria-hidden />
      <span className="truncate">{source.linear}</span>
    </span>
  ) : null;

  return (
    <div
      data-testid="conversation-source-badges"
      aria-label={badgeLabel(source)}
      className={cn("flex flex-wrap items-center gap-1", className)}
    >
      {source.origin ? (
        <span className={BADGE_CLASS} title={source.origin}>
          <Sparkles size={12} className="shrink-0" aria-hidden />
          <span className="truncate capitalize">{source.origin}</span>
        </span>
      ) : null}
      {source.url && linearBadge ? (
        <a
          href={source.url}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
          className="min-w-0 rounded-full hover:text-foreground"
        >
          {linearBadge}
        </a>
      ) : (
        linearBadge
      )}
      {source.requester ? (
        <span className={BADGE_CLASS} title={source.requester}>
          <User size={12} className="shrink-0" aria-hidden />
          <span className="truncate">{source.requester}</span>
        </span>
      ) : null}
    </div>
  );
}
