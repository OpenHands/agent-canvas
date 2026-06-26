import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExtensionWebview } from "#/components/features/extensions/extension-webview";
import type { HostApiDeps } from "#/extensions/host/host-api";

function makeDeps(): HostApiDeps {
  return {
    getActiveConversation: () => null,
    showInformationMessage: vi.fn(),
    executeCommand: vi.fn(),
    storageGet: vi.fn(),
    storageSet: vi.fn(),
  };
}

const panelTitle = "Policy Checks";

describe("ExtensionWebview", () => {
  it("renders a sandboxed iframe without allow-same-origin", () => {
    render(
      <ExtensionWebview
        extensionId="acme.compliance"
        capabilities={["conversation:read"]}
        deps={makeDeps()}
        src="blob:panel-html"
        title={panelTitle}
      />,
    );

    const frame = screen.getByTestId(
      "extension-webview-acme.compliance",
    ) as HTMLIFrameElement;

    const sandbox = frame.getAttribute("sandbox") ?? "";
    expect(sandbox).toContain("allow-scripts");
    expect(sandbox).not.toContain("allow-same-origin");
    expect(frame).toHaveAttribute("src", "blob:panel-html");
    expect(frame).toHaveAttribute("referrerpolicy", "no-referrer");
    expect(frame).toHaveAttribute("title", "Policy Checks");
  });
});
