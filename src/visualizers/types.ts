import type { ComponentType, ReactNode } from "react";
import type { ActionEvent, ObservationEvent } from "#/types/agent-server/core";

export type ToolVisualizerActionKind =
  | ActionEvent["action"]["kind"]
  | (string & {});

export type ToolVisualizerObservationKind =
  | ObservationEvent["observation"]["kind"]
  | (string & {});

export interface ToolVisualizerContext {
  event: ActionEvent | ObservationEvent;
  action?: ActionEvent;
  observation?: ObservationEvent;
}

export interface ToolVisualizerBodyProps extends ToolVisualizerContext {}

export interface ToolVisualizerDefinition {
  id: string;
  actionKinds?: readonly ToolVisualizerActionKind[];
  observationKinds?: readonly ToolVisualizerObservationKind[];
  matches?: (context: ToolVisualizerContext) => boolean;
  Body: ComponentType<ToolVisualizerBodyProps>;
}

export interface AddonApi {
  registerToolVisualizer: (
    visualizer: ToolVisualizerDefinition,
  ) => ToolVisualizerCleanup;
}

export type ToolVisualizerCleanup = () => void;

export interface ToolVisualizerRendererProps {
  context: ToolVisualizerContext;
  visualizers: readonly ToolVisualizerDefinition[];
  fallback: ReactNode;
}
