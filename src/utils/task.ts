import { SuggestedTaskGroup } from "#/utils/types";

// Helper functions
export function getTotalTaskCount(
  suggestedTasks: SuggestedTaskGroup[] | undefined,
): number {
  if (!suggestedTasks) return 0;
  return suggestedTasks.flatMap((group) => group.tasks).length;
}

export function getLimitedTaskGroups(
  suggestedTasks: SuggestedTaskGroup[],
  maxTasks: number,
): SuggestedTaskGroup[] {
  const limitedGroups: SuggestedTaskGroup[] = [];
  let taskCount = 0;

  for (const group of suggestedTasks) {
    if (taskCount >= maxTasks) break;

    const remainingTasksNeeded = maxTasks - taskCount;
    const tasksToShow = group.tasks.slice(0, remainingTasksNeeded);

    if (tasksToShow.length > 0) {
      limitedGroups.push({
        ...group,
        tasks: tasksToShow,
      });
      taskCount += tasksToShow.length;
    }
  }

  return limitedGroups;
}

export function getDisplayedTaskGroups(
  suggestedTasks: SuggestedTaskGroup[] | undefined,
  isExpanded: boolean,
): SuggestedTaskGroup[] {
  if (!suggestedTasks || suggestedTasks.length === 0) {
    return [];
  }

  if (isExpanded) {
    return suggestedTasks;
  }

  return getLimitedTaskGroups(suggestedTasks, 3);
}
