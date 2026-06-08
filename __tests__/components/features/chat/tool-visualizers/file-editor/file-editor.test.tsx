import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { fileEditorVisualizer } from "#/components/features/chat/tool-visualizers/file-editor/file-editor";
import {
  renderVisualizer,
  fileEditorAction,
  fileEditorObservation,
} from "../test-utils";

const Body = fileEditorVisualizer.Body;

describe("fileEditorVisualizer", () => {
  it("shows path and content for a create action", () => {
    const { container } = renderVisualizer(
      <Body
        action={fileEditorAction({
          command: "create",
          path: "/workspace/app.ts",
          file_text: "const x = 1;",
        })}
      />,
    );
    expect(container).toHaveTextContent("/workspace/app.ts");
    expect(container).toHaveTextContent("const x = 1;");
  });

  it("shows the path with a line range for a view action", () => {
    const { container } = renderVisualizer(
      <Body
        action={fileEditorAction({
          command: "view",
          path: "/workspace/app.ts",
          view_range: [1, 10],
        })}
      />,
    );
    expect(container).toHaveTextContent("/workspace/app.ts:1-10");
  });

  it("shows the file snippet the agent saw for a view observation", () => {
    const { container } = renderVisualizer(
      <Body
        observation={fileEditorObservation({
          command: "view",
          content: [
            {
              type: "text",
              text: "Here's the result of running `cat -n`:\n     1\tconst x = 1;",
            },
          ],
        })}
      />,
    );
    expect(container).toHaveTextContent("const x = 1;");
  });

  it("renders a diff for an edit observation", () => {
    const { container } = renderVisualizer(
      <Body
        observation={fileEditorObservation({
          command: "str_replace",
          old_content: "line one\nOLD\nline three",
          new_content: "line one\nNEW\nline three",
        })}
      />,
    );
    expect(container).toHaveTextContent("- OLD");
    expect(container).toHaveTextContent("+ NEW");
  });

  it("renders the error message for a failed edit (error state)", () => {
    renderVisualizer(
      <Body
        observation={fileEditorObservation({
          command: "str_replace",
          error: "No replacement performed",
        })}
      />,
    );
    expect(screen.getByText("No replacement performed")).toBeInTheDocument();
  });

  it("matches snapshot for a diff", () => {
    const { container } = renderVisualizer(
      <Body
        observation={fileEditorObservation({
          command: "str_replace",
          old_content: "a\nb",
          new_content: "a\nc",
        })}
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
