import { OpenHandsEvent, ActionEvent } from "#/types/agent-server/core";
import { GenericEventMessage } from "../../../features/chat/generic-event-message";
import { getEventContent } from "../event-content-helpers/get-event-content";
import {
  getACPToolCallResult,
  getObservationResult,
  ObservationResultStatus,
} from "../event-content-helpers/get-observation-result";
import {
  isACPToolCallEvent,
  isObservationEvent,
} from "#/types/agent-server/type-guards";
import {
  SkillReadyEvent,
  isSkillReadyEvent,
} from "../event-content-helpers/create-skill-ready-event";
import { ConversationConfirmationButtons } from "#/components/shared/buttons/conversation-confirmation-buttons";
import { SkillReadyContentList } from "./skill-ready-content-list";
import SkillsIcon from "#/icons/skills.svg?react";

interface GenericEventMessageWrapperProps {
  event: OpenHandsEvent | SkillReadyEvent;
  isLastMessage: boolean;
  correspondingAction?: ActionEvent;
}

export function GenericEventMessageWrapper({
  event,
  isLastMessage,
  correspondingAction,
}: GenericEventMessageWrapperProps) {
  const { title, details } = getEventContent(event, correspondingAction);

  // TaskTrackerObservation has its own rendering
  if (
    !isSkillReadyEvent(event) &&
    isObservationEvent(event) &&
    event.observation.kind === "TaskTrackerObservation"
  ) {
    return <div>{details}</div>;
  }

  // Determine success status
  let success: ObservationResultStatus | undefined;
  if (isSkillReadyEvent(event)) {
    success = "success";
  } else if (isObservationEvent(event)) {
    success = getObservationResult(event);
  } else if (isACPToolCallEvent(event)) {
    success = getACPToolCallResult(event);
  }

  // For Skill Ready events with items, render expandable skill list
  const isSkillReady = isSkillReadyEvent(event);
  const skillReadyDetails =
    isSkillReady && event._skillReadyItems.length > 0 ? (
      <SkillReadyContentList items={event._skillReadyItems} />
    ) : (
      details
    );

  return (
    <div>
      <GenericEventMessage
        title={title}
        details={skillReadyDetails}
        success={success}
        initiallyExpanded={false}
        titleIcon={
          isSkillReady ? (
            <SkillsIcon className="h-4 w-4 stroke-[var(--oh-muted)] flex-shrink-0 mr-2" />
          ) : undefined
        }
      />
      {isLastMessage && <ConversationConfirmationButtons />}
    </div>
  );
}
