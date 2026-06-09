import type { ToolVisualizerDefinition } from "#/visualizers";
import { ObservationEvent } from "#/types/agent-server/core";
import { TaskTrackerObservation } from "#/types/agent-server/core/base/observation";
import { TaskTrackingObservationContent } from "../task-tracking/task-tracking-observation-content";

const TASK_TRACKER_VISUALIZER_ID = "openhands.task-tracker";

export const BUILT_IN_TOOL_VISUALIZERS: readonly ToolVisualizerDefinition[] = [
  {
    id: TASK_TRACKER_VISUALIZER_ID,
    observationKinds: ["TaskTrackerObservation"],
    Body({ observation }) {
      if (observation?.observation.kind !== "TaskTrackerObservation") {
        return null;
      }

      return (
        <TaskTrackingObservationContent
          event={observation as ObservationEvent<TaskTrackerObservation>}
        />
      );
    },
  },
];
