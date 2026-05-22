import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  NavigationProvider,
  type NavigationContextValue,
} from "#/context/navigation-context";
import { AddAutomationModal } from "#/components/features/automations/add-automation-modal";
import { I18nKey } from "#/i18n/declaration";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

function renderModal(isOpen = true) {
  const onClose = vi.fn();
  const navigation: NavigationContextValue = {
    currentPath: "/automations",
    conversationId: null,
    isNavigating: false,
    navigate: vi.fn(),
  };

  render(
    <NavigationProvider value={navigation}>
      <AddAutomationModal isOpen={isOpen} onClose={onClose} />
    </NavigationProvider>,
  );

  return { onClose };
}

describe("AddAutomationModal", () => {
  it("renders the create instructions content when open", () => {
    renderModal();

    expect(screen.getByTestId("add-automation-modal")).toBeInTheDocument();
    expect(
      screen.getByText(I18nKey.AUTOMATIONS$EMPTY_OPTION_PLUGIN_TITLE),
    ).toBeInTheDocument();
    expect(
      screen.getByText(I18nKey.AUTOMATIONS$EMPTY_OPTION_CONVERSATION_TITLE),
    ).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    renderModal(false);

    expect(screen.queryByTestId("add-automation-modal")).not.toBeInTheDocument();
  });

  it("calls onClose when the close button is clicked", async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();

    await user.click(screen.getByLabelText(I18nKey.BUTTON$CLOSE));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
