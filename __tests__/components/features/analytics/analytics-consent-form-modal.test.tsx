import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("posthog-js/react", () => ({
  usePostHog: () => ({ capture: vi.fn() }),
}));

const { saveUserSettingsMock } = vi.hoisted(() => ({
  saveUserSettingsMock: vi.fn(),
}));

vi.mock("#/hooks/mutation/use-save-settings", () => ({
  useSaveSettings: () => ({ mutate: saveUserSettingsMock }),
}));

const setTelemetryConsentMock = vi.fn((_consent: string) => Promise.resolve());
vi.mock("#/services/telemetry", () => ({
  setTelemetryConsent: (consent: string) => setTelemetryConsentMock(consent),
}));

vi.mock("#/utils/handle-capture-consent", () => ({
  handleCaptureConsent: vi.fn(),
}));

// Import after mocks.
import { AnalyticsConsentFormModal } from "#/components/features/analytics/analytics-consent-form-modal";

const onCloseMock = vi.fn();

describe("AnalyticsConsentFormModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Make saveUserSettings call onSuccess immediately.
    saveUserSettingsMock.mockImplementation(
      (_data: unknown, callbacks?: { onSuccess?: () => void }) => {
        callbacks?.onSuccess?.();
      },
    );
  });

  it("calls setTelemetryConsent('granted') when user submits with analytics checked", () => {
    render(<AnalyticsConsentFormModal onClose={onCloseMock} />);

    // Checkbox is checked by default (defaultChecked).
    fireEvent.submit(screen.getByTestId("user-capture-consent-form"));

    expect(setTelemetryConsentMock).toHaveBeenCalledWith("granted");
  });

  it("calls setTelemetryConsent('denied') when user unchecks and submits", () => {
    render(<AnalyticsConsentFormModal onClose={onCloseMock} />);

    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox); // uncheck
    fireEvent.submit(screen.getByTestId("user-capture-consent-form"));

    expect(setTelemetryConsentMock).toHaveBeenCalledWith("denied");
  });

  it("calls onClose after successful submission", () => {
    render(<AnalyticsConsentFormModal onClose={onCloseMock} />);

    fireEvent.submit(screen.getByTestId("user-capture-consent-form"));

    expect(onCloseMock).toHaveBeenCalled();
  });

  it("saves user_consents_to_analytics: true when checkbox is checked", () => {
    render(<AnalyticsConsentFormModal onClose={onCloseMock} />);

    fireEvent.submit(screen.getByTestId("user-capture-consent-form"));

    expect(saveUserSettingsMock).toHaveBeenCalledWith(
      { user_consents_to_analytics: true },
      expect.any(Object),
    );
  });

  it("saves user_consents_to_analytics: false when checkbox is unchecked", () => {
    render(<AnalyticsConsentFormModal onClose={onCloseMock} />);

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.submit(screen.getByTestId("user-capture-consent-form"));

    expect(saveUserSettingsMock).toHaveBeenCalledWith(
      { user_consents_to_analytics: false },
      expect.any(Object),
    );
  });
});
