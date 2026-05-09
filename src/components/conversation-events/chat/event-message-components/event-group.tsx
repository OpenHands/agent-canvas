import React from "react";
import { useTranslation } from "react-i18next";
import ArrowDown from "#/icons/angle-down-solid.svg?react";
import ArrowUp from "#/icons/angle-up-solid.svg?react";
import { OpenHandsEvent, ActionEvent } from "#/types/agent-server/core";
import {
  isActionEvent,
  isObservationEvent,
} from "#/types/agent-server/type-guards";
import { I18nKey } from "#/i18n/declaration";
import { SuccessIndicator } from "../../../features/chat/success-indicator";
import { getEventContent } from "../event-content-helpers/get-event-content";
import { IsInEventGroupContext } from "../../../features/chat/is-in-event-group-context";

interface EventGroupProps {
  /** The events represented by this group. Used to compute the summary. */
  events: OpenHandsEvent[];
  /** The fully-rendered event messages to show when the group is expanded. */
  children: React.ReactNode;
}

/**
 * Collapsible container that wraps a run of consecutive agent action/observation
 * events into a single summary card.
 *
 * Collapsed:
 *   - While running: "{completed} of {total} actions" + the title of the
 *     currently-running action.
 *   - When done:    "{count} actions completed" with a success check.
 *
 * Expanded:
 *   - Renders the children verbatim, so each individual action/observation can
 *     still be expanded the way it was before grouping.
 */
export function EventGroup({ events, children }: EventGroupProps) {
  const { t } = useTranslation("openhands");
  const [expanded, setExpanded] = React.useState(false);
  const contentId = React.useId();
  const buttonId = `${contentId}-toggle`;

  if (events.length === 0) {
    return null;
  }

  // Each ObservationEvent in the group is a completed action.
  // An ActionEvent that's still here (i.e. not yet replaced by its observation
  // in the UI events array) is the action currently in flight.
  const pendingAction = events.find((e): e is ActionEvent => isActionEvent(e));
  const completedCount = events.filter(isObservationEvent).length;
  const totalCount = events.length;
  const isRunning = !!pendingAction;

  const runningTitle = pendingAction
    ? getEventContent(pendingAction).title
    : null;

  const summary = isRunning
    ? t(I18nKey.EVENT_GROUP$ACTIONS_PROGRESS, {
        completed: completedCount,
        total: totalCount,
      })
    : t(I18nKey.EVENT_GROUP$ACTIONS_COMPLETED, { count: totalCount });

  const Chevron = expanded ? ArrowUp : ArrowDown;

  return (
    <div
      className="my-2 w-full border-l-2 border-neutral-300 pl-2 py-2 text-sm"
      data-testid="event-group"
    >
      <button
        id={buttonId}
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-controls={contentId}
        aria-expanded={expanded}
        aria-label={
          expanded
            ? t(I18nKey.EVENT_GROUP$COLLAPSE)
            : t(I18nKey.EVENT_GROUP$EXPAND)
        }
        data-testid="event-group-toggle"
        className="w-full flex items-center justify-between gap-2 text-left cursor-pointer font-bold text-neutral-300"
      >
        <span className="flex items-center gap-2 min-w-0">
          <Chevron className="h-4 w-4 fill-neutral-300 flex-shrink-0" />
          <span className="truncate">{summary}</span>
          {isRunning && runningTitle && (
            <span className="font-normal text-neutral-400 truncate">
              <span className="mx-1">·</span>
              {runningTitle}
            </span>
          )}
        </span>
        {!isRunning && <SuccessIndicator status="success" />}
      </button>

      {expanded && (
        <div
          id={contentId}
          role="region"
          aria-labelledby={buttonId}
          className="mt-2 flex flex-col"
          data-testid="event-group-content"
        >
          <IsInEventGroupContext.Provider value>
            {children}
          </IsInEventGroupContext.Provider>
        </div>
      )}
    </div>
  );
}
