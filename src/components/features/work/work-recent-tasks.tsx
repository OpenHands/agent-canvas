import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { NavigationLink } from "#/components/shared/navigation-link";
import { usePaginatedConversations } from "#/hooks/query/use-paginated-conversations";
import { I18nKey } from "#/i18n/declaration";
import { isWorkConversation } from "#/utils/work-conversations";

export function WorkRecentTasks() {
  const { t } = useTranslation("openhands");
  const { data } = usePaginatedConversations();

  const workTasks = useMemo(() => {
    const conversations = data?.pages.flatMap((page) => page.items) ?? [];
    return conversations
      .filter((conversation) => isWorkConversation(conversation.tags))
      .slice(0, 5);
  }, [data]);

  if (workTasks.length === 0) {
    return null;
  }

  return (
    <div data-testid="work-recent-tasks" className="space-y-2">
      <h2 className="text-sm font-medium text-foreground">
        {t(I18nKey.WORK$RECENT_TASKS)}
      </h2>
      <ul className="space-y-1 text-sm">
        {workTasks.map((task) => (
          <li key={task.id}>
            <NavigationLink
              to={`/work/tasks/${task.id}`}
              className="text-[var(--oh-accent)] hover:underline"
            >
              {task.title}
            </NavigationLink>
          </li>
        ))}
      </ul>
    </div>
  );
}
