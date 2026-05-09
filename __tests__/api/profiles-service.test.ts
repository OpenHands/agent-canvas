import { afterEach, describe, expect, it, vi } from "vitest";
import ProfilesService from "#/api/profiles-service/profiles-service.api";
import { openHands } from "#/api/open-hands-axios";

vi.mock("#/api/open-hands-axios", () => ({
  openHands: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

describe("ProfilesService", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("listProfiles", () => {
    it("calls GET /api/profiles and returns profiles list", async () => {
      const mockResponse = {
        profiles: [
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
        ],
      };

      vi.mocked(openHands.get).mockResolvedValue({ data: mockResponse });

      const result = await ProfilesService.listProfiles();

      expect(openHands.get).toHaveBeenCalledWith("/api/profiles");
      expect(result).toEqual(mockResponse);
      expect(result.profiles).toHaveLength(2);
    });

    it("returns empty profiles array when no profiles exist", async () => {
      const mockResponse = { profiles: [] };
      vi.mocked(openHands.get).mockResolvedValue({ data: mockResponse });

      const result = await ProfilesService.listProfiles();

      expect(result.profiles).toEqual([]);
    });
  });

  describe("getProfile", () => {
    it("calls GET /api/profiles/:name with encoded name", async () => {
      const mockResponse = {
        name: "my-profile",
        config: { model: "openai/gpt-4", base_url: null },
        api_key_set: true,
      };

      vi.mocked(openHands.get).mockResolvedValue({ data: mockResponse });

      const result = await ProfilesService.getProfile("my-profile");

      expect(openHands.get).toHaveBeenCalledWith("/api/profiles/my-profile", {
        headers: {},
      });
      expect(result).toEqual(mockResponse);
    });

    it("encodes profile names with special characters", async () => {
      const mockResponse = { name: "profile+name", config: {}, api_key_set: false };
      vi.mocked(openHands.get).mockResolvedValue({ data: mockResponse });

      await ProfilesService.getProfile("profile+name");

      expect(openHands.get).toHaveBeenCalledWith("/api/profiles/profile%2Bname", {
        headers: {},
      });
    });

    it("passes X-Expose-Secrets header when exposeSecrets is set", async () => {
      const mockResponse = {
        name: "my-profile",
        config: { model: "openai/gpt-4", api_key: "encrypted_..." },
        api_key_set: true,
      };

      vi.mocked(openHands.get).mockResolvedValue({ data: mockResponse });

      await ProfilesService.getProfile("my-profile", "encrypted");

      expect(openHands.get).toHaveBeenCalledWith("/api/profiles/my-profile", {
        headers: { "X-Expose-Secrets": "encrypted" },
      });
    });
  });

  describe("saveProfile", () => {
    it("calls POST /api/profiles/:name with request body", async () => {
      const mockResponse = { name: "new-profile", message: "Profile saved" };
      vi.mocked(openHands.post).mockResolvedValue({ data: mockResponse });

      const request = {
        llm: {
          model: "openai/gpt-4",
          api_key: "sk-xxx",
          base_url: null,
        },
        include_secrets: true,
      };

      const result = await ProfilesService.saveProfile("new-profile", request);

      expect(openHands.post).toHaveBeenCalledWith(
        "/api/profiles/new-profile",
        request,
      );
      expect(result).toEqual(mockResponse);
    });

    it("allows saving profile without llm config (uses current settings)", async () => {
      const mockResponse = { name: "snapshot-profile", message: "Profile saved" };
      vi.mocked(openHands.post).mockResolvedValue({ data: mockResponse });

      const request = { include_secrets: false };

      await ProfilesService.saveProfile("snapshot-profile", request);

      expect(openHands.post).toHaveBeenCalledWith(
        "/api/profiles/snapshot-profile",
        request,
      );
    });
  });

  describe("deleteProfile", () => {
    it("calls DELETE /api/profiles/:name", async () => {
      const mockResponse = { name: "old-profile", message: "Profile deleted" };
      vi.mocked(openHands.delete).mockResolvedValue({ data: mockResponse });

      const result = await ProfilesService.deleteProfile("old-profile");

      expect(openHands.delete).toHaveBeenCalledWith("/api/profiles/old-profile");
      expect(result).toEqual(mockResponse);
    });
  });

  describe("renameProfile", () => {
    it("calls POST /api/profiles/:name/rename with new_name", async () => {
      const mockResponse = { name: "renamed-profile", message: "Profile renamed" };
      vi.mocked(openHands.post).mockResolvedValue({ data: mockResponse });

      const result = await ProfilesService.renameProfile(
        "old-name",
        "renamed-profile",
      );

      expect(openHands.post).toHaveBeenCalledWith("/api/profiles/old-name/rename", {
        new_name: "renamed-profile",
      });
      expect(result).toEqual(mockResponse);
    });
  });
});
