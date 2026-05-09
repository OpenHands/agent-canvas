import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useActivateLlmProfile } from "#/hooks/mutation/use-activate-llm-profile";
import ProfilesService from "#/api/profiles-service/profiles-service.api";
import SettingsService from "#/api/settings-service/settings-service.api";

vi.mock("#/api/profiles-service/profiles-service.api", () => ({
  default: {
    activateProfile: vi.fn(),
  },
}));

describe("useActivateLlmProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    SettingsService.invalidateCache();
  });

  it("calls activateProfile and invalidates settings cache on success", async () => {
    const mockActivateProfile = vi.mocked(ProfilesService.activateProfile);
    mockActivateProfile.mockResolvedValue({
      name: "my-profile",
      message: "Profile activated",
      model: "gpt-4",
    });

    const invalidateCacheSpy = vi.spyOn(SettingsService, "invalidateCache");

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const { result } = renderHook(() => useActivateLlmProfile(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    });

    // Trigger the mutation
    result.current.mutate("my-profile");

    // Wait for the mutation to complete
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // Verify activateProfile was called with the correct name
    expect(mockActivateProfile).toHaveBeenCalledWith("my-profile");

    // Verify SettingsService.invalidateCache was called
    // This ensures getSettingsForConversation will fetch fresh settings
    expect(invalidateCacheSpy).toHaveBeenCalled();

    invalidateCacheSpy.mockRestore();
  });

  it("does not invalidate cache on activation failure", async () => {
    const mockActivateProfile = vi.mocked(ProfilesService.activateProfile);
    mockActivateProfile.mockRejectedValue(new Error("Profile not found"));

    // Create spy after beforeEach invalidation
    const invalidateCacheSpy = vi.spyOn(SettingsService, "invalidateCache");

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const { result } = renderHook(() => useActivateLlmProfile(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    });

    // Trigger the mutation
    result.current.mutate("nonexistent-profile");

    // Wait for the mutation to fail
    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    // invalidateCache should NOT have been called on failure
    // (onSuccess is not called when mutation fails)
    expect(invalidateCacheSpy).not.toHaveBeenCalled();

    invalidateCacheSpy.mockRestore();
  });
});
