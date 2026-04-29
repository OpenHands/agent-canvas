import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsDropdownInput } from "#/components/features/settings/settings-dropdown-input";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const items = [
  { key: "english", label: "English" },
  { key: "spanish", label: "Spanish" },
  { key: "german", label: "German" },
];

describe("SettingsDropdownInput", () => {
  it("shows the default selection and emits selection changes", async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();

    render(
      <SettingsDropdownInput
        defaultSelectedKey="english"
        items={items}
        label="Language"
        name="language"
        onSelectionChange={onSelectionChange}
        testId="language-input"
      />,
    );

    const input = screen.getByLabelText("Language");

    expect(input).toHaveValue("English");

    await user.click(input);
    await user.click(await screen.findByText("Spanish"));

    expect(onSelectionChange).toHaveBeenCalledWith("spanish");
  });

  it("clears the selection when the clear button is pressed", async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    const onInputChange = vi.fn();

    render(
      <SettingsDropdownInput
        defaultSelectedKey="english"
        isClearable
        items={items}
        label="Language"
        name="language"
        onInputChange={onInputChange}
        onSelectionChange={onSelectionChange}
        testId="language-input"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Clear selection" }));

    expect(screen.getByLabelText("Language")).toHaveValue("");
    expect(onSelectionChange).toHaveBeenCalledWith(null);
    expect(onInputChange).toHaveBeenCalledWith("");
  });
});
