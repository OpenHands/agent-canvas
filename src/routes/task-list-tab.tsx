import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import CheckCircleIcon from "#/icons/u-check-circle.svg?react";
import { TaskItem } from "#/components/features/chat/task-tracking/task-item";
import { useTaskList } from "#/hooks/use-task-list";
import { Text } from "#/ui/typography";
import { cn } from "#/utils/utils";

function TaskListTab() {
  const { t } = useTranslation("openhands");
  const { taskList } = useTaskList();

  if (taskList.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full p-10 gap-4">
        <CheckCircleIcon width={109} height={109} color="var(--oh-muted)" />
        <Text className="text-[var(--oh-text-dim)] text-[19px] font-normal leading-5">
          {t(I18nKey.COMMON$NO_TASKS)}
        </Text>
      </div>
    );
  }

  return (
    <main className="h-full overflow-y-auto flex flex-col custom-scrollbar-always">
      {taskList.map((task) => (
        <div
          key={task.id}
          className={cn(
            "px-4 py-2",
            task.status === "in_progress" && "bg-[var(--oh-surface-raised)]",
          )}
        >
          <TaskItem task={task} />
        </div>
      ))}
    </main>
  );
}

export default TaskListTab;
