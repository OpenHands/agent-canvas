import { describe, expect, vi, beforeEach, it, afterEach } from "vitest";
import GitService from "#/api/git-service/git-service.api";
import * as cloudGitService from "#/api/cloud/git-service.api";
import { ProviderHandler } from "#/api/git-providers/provider-handler";
import * as activeStore from "#/api/backend-registry/active-store";

// Mock the cloud git service
vi.mock("#/api/cloud/git-service.api", () => ({
  searchCloudRepositories: vi.fn(),
  getCloudInstallations: vi.fn(),
  getCloudRepositoryBranches: vi.fn(),
}));

// Mock the provider handler
vi.mock("#/api/git-providers/provider-handler", () => ({
  ProviderHandler: {
    searchRepositories: vi.fn(),
    getInstallations: vi.fn(),
    getBranches: vi.fn(),
  },
}));

// Mock the active backend store
vi.mock("#/api/backend-registry/active-store", () => ({
  getActiveBackend: vi.fn(),
}));

const mockSearchCloudRepositories = vi.mocked(
  cloudGitService.searchCloudRepositories,
);
const mockGetCloudInstallations = vi.mocked(
  cloudGitService.getCloudInstallations,
);
const mockGetCloudRepositoryBranches = vi.mocked(
  cloudGitService.getCloudRepositoryBranches,
);
const mockProviderSearchRepositories = vi.mocked(
  ProviderHandler.searchRepositories,
);
const mockProviderGetInstallations = vi.mocked(
  ProviderHandler.getInstallations,
);
const mockProviderGetBranches = vi.mocked(ProviderHandler.getBranches);
const mockGetActiveBackend = vi.mocked(activeStore.getActiveBackend);

describe("GitService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("invalid provider guards", () => {
    const invalidProviders = [
      { value: null, name: "null" },
      { value: undefined, name: "undefined" },
      { value: "", name: "empty string" },
      { value: "undefined", name: '"undefined" string' },
      { value: "null", name: '"null" string' },
    ];

    describe("searchGitRepositories", () => {
      it.each(invalidProviders)(
        "should return empty results when provider is $name (cloud mode)",
        async ({ value }) => {
          mockGetActiveBackend.mockReturnValue({
            backend: { kind: "cloud", id: "test", name: "Test", host: "https://example.com", apiKey: "test-key" },
            orgId: "org-1",
          });

          const result = await GitService.searchGitRepositories(
            "test query",
            value as string,
          );

          expect(result).toEqual({ items: [], next_page_id: null });
          expect(mockSearchCloudRepositories).not.toHaveBeenCalled();
        },
      );

      it.each(invalidProviders)(
        "should return empty results when provider is $name (local mode)",
        async ({ value }) => {
          mockGetActiveBackend.mockReturnValue({
            backend: { kind: "local", id: "test", name: "Test", host: "http://localhost", apiKey: "test-key" },
            orgId: null,
          });

          const result = await GitService.searchGitRepositories(
            "test query",
            value as string,
          );

          expect(result).toEqual({ items: [], next_page_id: null });
          expect(mockProviderSearchRepositories).not.toHaveBeenCalled();
        },
      );
    });

    describe("retrieveUserGitRepositories", () => {
      it.each(invalidProviders)(
        "should return empty results when provider is $name",
        async ({ value }) => {
          mockGetActiveBackend.mockReturnValue({
            backend: { kind: "cloud", id: "test", name: "Test", host: "https://example.com", apiKey: "test-key" },
            orgId: "org-1",
          });

          const result = await GitService.retrieveUserGitRepositories(
            value as string,
          );

          expect(result).toEqual({ items: [], next_page_id: null });
          expect(mockSearchCloudRepositories).not.toHaveBeenCalled();
        },
      );
    });

    describe("retrieveInstallationRepositories", () => {
      it.each(invalidProviders)(
        "should return empty results when provider is $name",
        async ({ value }) => {
          mockGetActiveBackend.mockReturnValue({
            backend: { kind: "cloud", id: "test", name: "Test", host: "https://example.com", apiKey: "test-key" },
            orgId: "org-1",
          });

          const result = await GitService.retrieveInstallationRepositories(
            value as string,
            0,
            ["installation-1"],
          );

          expect(result).toEqual({ items: [], next_page_id: null });
          expect(mockSearchCloudRepositories).not.toHaveBeenCalled();
        },
      );
    });

    describe("getUserInstallations", () => {
      it.each(invalidProviders)(
        "should return empty results when provider is $name (cloud mode)",
        async ({ value }) => {
          mockGetActiveBackend.mockReturnValue({
            backend: { kind: "cloud", id: "test", name: "Test", host: "https://example.com", apiKey: "test-key" },
            orgId: "org-1",
          });

          const result = await GitService.getUserInstallations(value as string);

          expect(result).toEqual({ items: [], next_page_id: null });
          expect(mockGetCloudInstallations).not.toHaveBeenCalled();
        },
      );

      it.each(invalidProviders)(
        "should return empty results when provider is $name (local mode)",
        async ({ value }) => {
          mockGetActiveBackend.mockReturnValue({
            backend: { kind: "local", id: "test", name: "Test", host: "http://localhost", apiKey: "test-key" },
            orgId: null,
          });

          const result = await GitService.getUserInstallations(value as string);

          expect(result).toEqual({ items: [], next_page_id: null });
          expect(mockProviderGetInstallations).not.toHaveBeenCalled();
        },
      );
    });

    describe("getRepositoryBranches", () => {
      it.each(invalidProviders)(
        "should return empty results when provider is $name",
        async ({ value }) => {
          mockGetActiveBackend.mockReturnValue({
            backend: { kind: "cloud", id: "test", name: "Test", host: "https://example.com", apiKey: "test-key" },
            orgId: "org-1",
          });

          const result = await GitService.getRepositoryBranches(
            "owner/repo",
            value as string,
          );

          expect(result).toEqual({ items: [], next_page_id: null });
          expect(mockGetCloudRepositoryBranches).not.toHaveBeenCalled();
        },
      );
    });

    describe("searchRepositoryBranches", () => {
      it.each(invalidProviders)(
        "should return empty results when provider is $name",
        async ({ value }) => {
          mockGetActiveBackend.mockReturnValue({
            backend: { kind: "cloud", id: "test", name: "Test", host: "https://example.com", apiKey: "test-key" },
            orgId: "org-1",
          });

          const result = await GitService.searchRepositoryBranches(
            "owner/repo",
            value as string,
            "main",
          );

          expect(result).toEqual({ items: [], next_page_id: null });
          expect(mockGetCloudRepositoryBranches).not.toHaveBeenCalled();
        },
      );
    });
  });

  describe("valid provider behavior", () => {
    it("should call cloud API when provider is valid and cloud is active", async () => {
      mockGetActiveBackend.mockReturnValue({
        backend: { kind: "cloud", id: "test", name: "Test", host: "https://example.com", apiKey: "test-key" },
        orgId: "org-1",
      });
      mockSearchCloudRepositories.mockResolvedValue({
        items: [{ id: "1", full_name: "owner/repo", git_provider: "github", is_public: true }],
        next_page_id: null,
      });

      const result = await GitService.searchGitRepositories("test", "github");

      expect(mockSearchCloudRepositories).toHaveBeenCalledWith({
        provider: "github",
        query: "test",
        limit: 100,
        pageId: undefined,
        installationId: undefined,
      });
      expect(result.items).toHaveLength(1);
    });

    it("should call provider handler when provider is valid and local is active", async () => {
      mockGetActiveBackend.mockReturnValue({
        backend: { kind: "local", id: "test", name: "Test", host: "http://localhost", apiKey: "test-key" },
        orgId: null,
      });
      mockProviderSearchRepositories.mockResolvedValue({
        items: [{ id: "1", full_name: "owner/repo", git_provider: "github", is_public: true }],
        next_page_id: null,
      });

      const result = await GitService.searchGitRepositories("test", "github");

      expect(mockProviderSearchRepositories).toHaveBeenCalledWith("github", {
        query: "test",
        installationId: undefined,
        pageId: undefined,
        limit: 100,
      });
      expect(result.items).toHaveLength(1);
    });
  });
});
