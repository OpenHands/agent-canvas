import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProfilesBody } from "#/components/features/settings/llm-profiles/profiles-body";
import { ProfileInfo } from "#/api/profiles-service/profiles-service.api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "SETTINGS$PROFILES_LOAD_ERROR": "Failed to load profiles",
        "SETTINGS$PROFILES_EMPTY": "No profiles saved yet",
        "SETTINGS$PROFILE_API_KEY_SET": "API Key Set",
        "SETTINGS$PROFILE_MENU": "Profile menu",
        "SETTINGS$PROFILE_EDIT": "Edit",
        "SETTINGS$PROFILE_RENAME": "Rename",
        "SETTINGS$PROFILE_DELETE": "Delete",
      };
      return translations[key] || key;
    },
  }),
}));

const mockProfiles: ProfileInfo[] = [
  {
    name: "gpt-4-profile",
    model: "openai/gpt-4",
    base_url: null,
    api_key_set: true,
  },
  {
    name: "claude-profile",
    model: "anthropic/claude-3",
    base_url: "https://api.anthropic.com",
    api_key_set: false,
  },
];

describe("ProfilesBody", () => {
  it("shows loading spinner when isLoading is true", () => {
    render(
      <ProfilesBody
        isLoading={true}
        loadError={null}
        profiles={[]}
        onEdit={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
  });

  it("shows error message when loadError is present", () => {
    render(
      <ProfilesBody
        isLoading={false}
        loadError={new Error("Network error")}
        profiles={[]}
        onEdit={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("Failed to load profiles")).toBeInTheDocument();
  });

  it("shows empty state when profiles array is empty", () => {
    render(
      <ProfilesBody
        isLoading={false}
        loadError={null}
        profiles={[]}
        onEdit={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("No profiles saved yet")).toBeInTheDocument();
  });

  it("renders a list of profiles", () => {
    render(
      <ProfilesBody
        isLoading={false}
        loadError={null}
        profiles={mockProfiles}
        onEdit={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("gpt-4-profile")).toBeInTheDocument();
    expect(screen.getByText("openai/gpt-4")).toBeInTheDocument();
    expect(screen.getByText("claude-profile")).toBeInTheDocument();
    expect(screen.getByText("anthropic/claude-3")).toBeInTheDocument();
  });

  it("renders profile rows for each profile", () => {
    render(
      <ProfilesBody
        isLoading={false}
        loadError={null}
        profiles={mockProfiles}
        onEdit={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    const rows = screen.getAllByTestId("profile-row");
    expect(rows).toHaveLength(2);
  });

  it("shows API key badge only for profiles with api_key_set", () => {
    render(
      <ProfilesBody
        isLoading={false}
        loadError={null}
        profiles={mockProfiles}
        onEdit={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    const badges = screen.getAllByTestId("profile-api-key-badge");
    expect(badges).toHaveLength(1);
  });

  it("loading state takes priority over error", () => {
    render(
      <ProfilesBody
        isLoading={true}
        loadError={new Error("Error")}
        profiles={[]}
        onEdit={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
    expect(screen.queryByText("Failed to load profiles")).not.toBeInTheDocument();
  });

  it("error state takes priority over empty state", () => {
    render(
      <ProfilesBody
        isLoading={false}
        loadError={new Error("Error")}
        profiles={[]}
        onEdit={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("Failed to load profiles")).toBeInTheDocument();
    expect(screen.queryByText("No profiles saved yet")).not.toBeInTheDocument();
  });
});
