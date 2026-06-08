import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  SchemaField,
  getNumericFieldError,
} from "#/components/features/settings/sdk-settings/schema-field";
import { SettingsFieldSchema } from "#/types/settings";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        SETTINGS$TOP_P_LABEL: "Top P",
        SETTINGS$TOP_P_DESCRIPTION: "Controls nucleus sampling.",
      })[key] ?? key,
  }),
}));

function buildField(
  overrides: Partial<SettingsFieldSchema> = {},
): SettingsFieldSchema {
  return {
    key: "llm.top_p",
    label: "Top P",
    description: "Controls nucleus sampling.",
    section: "llm",
    section_label: "LLM",
    value_type: "number",
    default: 1,
    choices: [],
    depends_on: [],
    prominence: "major",
    secret: false,
    required: false,
    ...overrides,
  };
}

describe("SchemaField", () => {
  it("constrains the Top P input to the valid numeric range", () => {
    render(
      <SchemaField
        field={buildField()}
        value="1"
        isDisabled={false}
        onChange={() => {}}
      />,
    );

    const input = screen.getByTestId("sdk-settings-llm.top_p");

    expect(input).toHaveAttribute("min", "0");
    expect(input).toHaveAttribute("max", "1");
    expect(input).toHaveAttribute("step", "0.01");
  });

  it("translates schema-backed labels and descriptions", () => {
    render(
      <SchemaField
        field={buildField({
          label: "SETTINGS$TOP_P_LABEL",
          description: "SETTINGS$TOP_P_DESCRIPTION",
        })}
        value="1"
        isDisabled={false}
        onChange={() => {}}
      />,
    );

    expect(screen.getByText("Top P")).toBeInTheDocument();
    expect(screen.getByText("Controls nucleus sampling.")).toBeInTheDocument();
  });

  describe("numeric validation", () => {
    function buildIntegerField(): SettingsFieldSchema {
      return buildField({
        key: "condenser.max_size",
        label: "Max Size",
        section: "condenser",
        section_label: "Condenser",
        value_type: "integer",
        default: 240,
      });
    }

    const errorTestId = "sdk-settings-condenser.max_size-error";

    it("shows an error when the value is below the backend minimum", () => {
      // condenser.max_size must be >= 20; 10 fails validation on save.
      render(
        <SchemaField
          field={buildIntegerField()}
          value="10"
          isDisabled={false}
          onChange={() => {}}
        />,
      );

      expect(screen.getByTestId(errorTestId)).toHaveTextContent(
        "SCHEMA$ERROR$MIN_VALUE",
      );
    });

    it("shows an error when an integer field receives a float value", () => {
      render(
        <SchemaField
          field={buildIntegerField()}
          value="2.5"
          isDisabled={false}
          onChange={() => {}}
        />,
      );

      expect(screen.getByTestId(errorTestId)).toHaveTextContent(
        "SCHEMA$ERROR$WHOLE_NUMBER",
      );
    });

    it("shows no error for a valid non-negative whole number", () => {
      render(
        <SchemaField
          field={buildIntegerField()}
          value="240"
          isDisabled={false}
          onChange={() => {}}
        />,
      );

      expect(screen.queryByTestId(errorTestId)).not.toBeInTheDocument();
    });

    it("shows no error while the field is empty", () => {
      render(
        <SchemaField
          field={buildIntegerField()}
          value=""
          isDisabled={false}
          onChange={() => {}}
        />,
      );

      expect(screen.queryByTestId(errorTestId)).not.toBeInTheDocument();
    });
  });
});

describe("getNumericFieldError", () => {
  function integerField(): SettingsFieldSchema {
    return {
      key: "condenser.max_size",
      label: "Max Size",
      section: "condenser",
      section_label: "Condenser",
      value_type: "integer",
      choices: [],
      depends_on: [],
      prominence: "major",
      secret: false,
      required: false,
    };
  }

  it("flags non-numeric input (e.g. a typed letter) as a whole-number error", () => {
    // Browsers surface unparseable number-input entries as an empty value, so
    // the native bad-input flag is what tells us the user typed a letter.
    expect(getNumericFieldError(integerField(), "", { min: 20 }, true)).toEqual(
      {
        key: "SCHEMA$ERROR$WHOLE_NUMBER",
      },
    );
  });

  it("flags a float on an integer field as a whole-number error", () => {
    expect(getNumericFieldError(integerField(), "0.9", { min: 20 })).toEqual({
      key: "SCHEMA$ERROR$WHOLE_NUMBER",
    });
  });

  it("flags a value below the minimum", () => {
    expect(getNumericFieldError(integerField(), "10", { min: 20 })).toEqual({
      key: "SCHEMA$ERROR$MIN_VALUE",
      options: { min: 20 },
    });
  });

  it("returns null for a valid whole number at or above the minimum", () => {
    expect(getNumericFieldError(integerField(), "240", { min: 20 })).toBeNull();
  });
});
