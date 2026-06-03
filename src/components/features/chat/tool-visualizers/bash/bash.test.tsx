import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { SecurityRisk } from "#/types/agent-server/core";
import { bashVisualizer } from "./bash";
import { renderVisualizer, bashAction, bashObservation } from "../test-utils";

const Body = bashVisualizer.Body;

describe("bashVisualizer", () => {
  it("renders the command in the action card", () => {
    const { container } = renderVisualizer(
      <Body action={bashAction("echo hello")} />,
    );
    expect(container).toHaveTextContent("echo hello");
  });

  it("warns about high-risk actions", () => {
    renderVisualizer(
      <Body action={bashAction("rm -rf /", SecurityRisk.HIGH)} />,
    );
    expect(screen.getByText("SECURITY$HIGH_RISK")).toBeInTheDocument();
  });

  it("shows output without an exit badge on success", () => {
    const { container } = renderVisualizer(
      <Body
        observation={bashObservation("hello world", 0, "echo hello world")}
      />,
    );
    expect(container).toHaveTextContent("hello world");
    expect(screen.queryByText("OBSERVATION$EXIT_CODE")).not.toBeInTheDocument();
  });

  it("badges a non-zero exit code (error state)", () => {
    renderVisualizer(<Body observation={bashObservation("boom", 1)} />);
    expect(screen.getByText("OBSERVATION$EXIT_CODE")).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();
  });

  it("shows a placeholder when there is no output", () => {
    renderVisualizer(<Body observation={bashObservation("", 0)} />);
    expect(
      screen.getByText("OBSERVATION$COMMAND_NO_OUTPUT"),
    ).toBeInTheDocument();
  });

  it("matches snapshot", () => {
    const { container } = renderVisualizer(
      <Body observation={bashObservation("ok", 0, "ls")} />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
