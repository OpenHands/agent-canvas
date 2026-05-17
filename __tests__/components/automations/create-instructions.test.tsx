import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import {
  NavigationProvider,
  type NavigationContextValue,
} from "#/context/navigation-context";
import { CreateInstructions } from "#/components/features/automations/create-instructions";
import { I18nKey } from "#/i18n/declaration";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        [I18nKey.AUTOMATIONS$EMPTY_START_CONVERSATION]: "Start a conversation",
      };
      return translations[key] || key;
    },
  }),
}));

function renderCreateInstructions() {
  const value: NavigationContextValue = {
    currentPath: "/automations",
    conversationId: null,
    isNavigating: false,
    navigate: vi.fn(),
  };

  const result = render(
    <NavigationProvider value={value}>
      <CreateInstructions />
    </NavigationProvider>,
  );

  return { ...result, navigate: value.navigate };
}

describe("CreateInstructions", () => {
  it("navigates to the home route via SPA routing when 'Start a conversation' is clicked", () => {
    const { navigate } = renderCreateInstructions();

    const link = screen.getByRole("link", { name: /start a conversation/i });
    const clickEvent = fireEvent.click(link);

    expect(navigate).toHaveBeenCalledWith("/", { replace: false });
    expect(clickEvent).toBe(false);
  });
});
