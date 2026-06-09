import React from "react";
import {
  isActionEvent,
  isObservationEvent,
} from "#/types/agent-server/type-guards";
import type {
  AddonApi,
  ToolVisualizerCleanup,
  ToolVisualizerContext,
  ToolVisualizerDefinition,
  ToolVisualizerRendererProps,
} from "./types";

const registeredToolVisualizers: ToolVisualizerDefinition[] = [];

const getAddonVisualizersLifo = (): readonly ToolVisualizerDefinition[] =>
  [...registeredToolVisualizers].reverse();

const kindMatches = (
  context: ToolVisualizerContext,
  visualizer: ToolVisualizerDefinition,
): boolean => {
  if (isActionEvent(context.event)) {
    if (
      visualizer.actionKinds &&
      !visualizer.actionKinds.includes(context.event.action.kind)
    ) {
      return false;
    }

    return !visualizer.observationKinds || Boolean(visualizer.actionKinds);
  }

  if (isObservationEvent(context.event)) {
    if (
      visualizer.observationKinds &&
      !visualizer.observationKinds.includes(context.event.observation.kind)
    ) {
      return false;
    }

    if (!visualizer.observationKinds && visualizer.actionKinds) {
      return Boolean(
        context.action &&
        visualizer.actionKinds.includes(context.action.action.kind),
      );
    }

    if (
      context.action &&
      visualizer.actionKinds &&
      !visualizer.actionKinds.includes(context.action.action.kind)
    ) {
      return false;
    }

    return true;
  }

  return false;
};

const customMatcherPasses = (
  context: ToolVisualizerContext,
  visualizer: ToolVisualizerDefinition,
): boolean => {
  if (!visualizer.matches) {
    return true;
  }

  try {
    return visualizer.matches(context);
  } catch (error) {
    console.error(
      `Tool visualizer "${visualizer.id}" matches() failed; skipping visualizer.`,
      error,
    );
    return false;
  }
};

const matchesContext = (
  context: ToolVisualizerContext,
  visualizer: ToolVisualizerDefinition,
): boolean =>
  kindMatches(context, visualizer) && customMatcherPasses(context, visualizer);

export const registerToolVisualizer = (
  visualizer: ToolVisualizerDefinition,
): ToolVisualizerCleanup => {
  if (!visualizer.id.trim()) {
    throw new Error("Tool visualizers must declare a non-empty id.");
  }

  const existingIndex = registeredToolVisualizers.findIndex(
    (registered) => registered.id === visualizer.id,
  );

  if (existingIndex >= 0) {
    registeredToolVisualizers.splice(existingIndex, 1);
  }

  registeredToolVisualizers.push(visualizer);

  return () => {
    const currentIndex = registeredToolVisualizers.indexOf(visualizer);
    if (currentIndex >= 0) {
      registeredToolVisualizers.splice(currentIndex, 1);
    }
  };
};

export const getRegisteredToolVisualizers =
  (): readonly ToolVisualizerDefinition[] => getAddonVisualizersLifo();

export const clearRegisteredToolVisualizersForTest = (): void => {
  registeredToolVisualizers.splice(0, registeredToolVisualizers.length);
};

export const getMatchingToolVisualizers = (
  context: ToolVisualizerContext,
  builtInVisualizers: readonly ToolVisualizerDefinition[] = [],
): readonly ToolVisualizerDefinition[] => {
  const addonVisualizers = getAddonVisualizersLifo().filter((visualizer) =>
    matchesContext(context, visualizer),
  );
  const builtIns = builtInVisualizers.filter((visualizer) =>
    matchesContext(context, visualizer),
  );

  return [...addonVisualizers, ...builtIns];
};

interface ToolVisualizerErrorBoundaryProps {
  fallback: React.ReactNode;
  visualizerId: string;
  children: React.ReactNode;
}

interface ToolVisualizerErrorBoundaryState {
  hasError: boolean;
}

class ToolVisualizerErrorBoundary extends React.Component<
  ToolVisualizerErrorBoundaryProps,
  ToolVisualizerErrorBoundaryState
> {
  override state: ToolVisualizerErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ToolVisualizerErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: unknown): void {
    console.error(
      `Tool visualizer "${this.props.visualizerId}" failed; falling back to the next renderer.`,
      error,
    );
  }

  override render(): React.ReactNode {
    if (this.state.hasError) {
      return this.props.fallback;
    }

    return this.props.children;
  }
}

export function ToolVisualizerRenderer({
  context,
  visualizers,
  fallback,
}: ToolVisualizerRendererProps): React.ReactNode {
  const [visualizer, ...remainingVisualizers] = visualizers;

  if (!visualizer) {
    return <>{fallback}</>;
  }

  const Body = visualizer.Body;
  const nextFallback = (
    <ToolVisualizerRenderer
      context={context}
      visualizers={remainingVisualizers}
      fallback={fallback}
    />
  );

  return (
    <ToolVisualizerErrorBoundary
      key={visualizer.id}
      visualizerId={visualizer.id}
      fallback={nextFallback}
    >
      <Body
        event={context.event}
        action={context.action}
        observation={context.observation}
      />
    </ToolVisualizerErrorBoundary>
  );
}

export const getToolVisualizerBody = (
  context: ToolVisualizerContext,
  fallback: React.ReactNode,
  builtInVisualizers: readonly ToolVisualizerDefinition[] = [],
): React.ReactNode => {
  const visualizers = getMatchingToolVisualizers(context, builtInVisualizers);

  if (visualizers.length === 0) {
    return fallback;
  }

  return (
    <ToolVisualizerRenderer
      context={context}
      visualizers={visualizers}
      fallback={fallback}
    />
  );
};

export const createAddonApi = (): AddonApi => ({
  registerToolVisualizer,
});

export const addonApi: AddonApi = createAddonApi();
