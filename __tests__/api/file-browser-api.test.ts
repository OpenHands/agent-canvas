import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Backend } from "#/api/backend-registry/types";
import type { InternalAxiosRequestConfig } from "axios";

const {
  mockGet,
  mockCallCloudProxy,
  mockGetActive,
  mockGetEffectiveLocal,
  capturedInterceptors,
} = vi.hoisted(() => {
  const interceptors: Array<
    (config: InternalAxiosRequestConfig) => InternalAxiosRequestConfig
  > = [];
  return {
    mockGet: vi.fn(),
    mockCallCloudProxy: vi.fn(),
    mockGetActive: vi.fn(),
    mockGetEffectiveLocal: vi.fn(),
    capturedInterceptors: interceptors,
  };
});

vi.mock("axios", () => ({
  default: {
    create: () => ({
      get: mockGet,
      interceptors: {
        request: {
          use: (
            fn: (
              config: InternalAxiosRequestConfig,
            ) => InternalAxiosRequestConfig,
          ) => {
            capturedInterceptors.push(fn);
          },
        },
      },
    }),
  },
}));

vi.mock("#/api/cloud/proxy", () => ({
  callCloudProxy: mockCallCloudProxy,
}));

vi.mock("#/api/backend-registry/active-store", () => ({
  getActiveBackend: mockGetActive,
  getEffectiveLocalBackend: mockGetEffectiveLocal,
}));

import { fileBrowserApi } from "#/api/file-browser/file-browser-api";

const localBackend: Backend = {
  id: "local-1",
  name: "Local",
  host: "http://localhost:8000",
  apiKey: "session-key",
  kind: "local",
};

const cloudBackend: Backend = {
  id: "cloud-1",
  name: "Production",
  host: "https://app.all-hands.dev",
  apiKey: "bearer-key",
  kind: "cloud",
};

function makeAxiosConfig(
  overrides: Partial<InternalAxiosRequestConfig> = {},
): InternalAxiosRequestConfig {
  const headers = {
    set: vi.fn(),
    get: vi.fn(),
  } as unknown as InternalAxiosRequestConfig["headers"];
  return {
    headers,
    ...overrides,
  } as unknown as InternalAxiosRequestConfig;
}

describe("fileBrowserApi", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockGet.mockReset();
    mockCallCloudProxy.mockReset();
    mockGetActive.mockReset();
    mockGetActive.mockReturnValue({ backend: localBackend, orgId: null });
    mockGetEffectiveLocal.mockReset();
    mockGetEffectiveLocal.mockReturnValue(localBackend);
  });

  describe("searchSubdirectoriesWithHidden", () => {
    it("sends include_hidden=true via the local axios path", async () => {
      mockGet.mockResolvedValue({
        data: {
          items: [{ name: ".config", path: "/h/.config" }],
          next_page_id: null,
        },
      });

      const result = await fileBrowserApi.searchSubdirectoriesWithHidden({
        path: "/home/me",
      });

      expect(mockGet).toHaveBeenCalledTimes(1);
      const [url] = mockGet.mock.calls[0];
      expect(url).toBe(
        "/api/file/search_subdirs?path=%2Fhome%2Fme&include_hidden=true",
      );
      expect(result.items[0]?.name).toBe(".config");
    });

    it("encodes pagination fields as page_id/limit and not pageId", async () => {
      mockGet.mockResolvedValue({ data: { items: [], next_page_id: null } });

      await fileBrowserApi.searchSubdirectoriesWithHidden({
        path: "/home/me",
        pageId: "p2",
        limit: 25,
      });

      const [url] = mockGet.mock.calls[0];
      expect(url).toContain("page_id=p2");
      expect(url).toContain("limit=25");
      expect(url).not.toContain("pageId");
    });

    it("routes through callCloudProxy for cloud backends", async () => {
      mockGetActive.mockReturnValue({ backend: cloudBackend, orgId: null });
      mockCallCloudProxy.mockResolvedValue({
        items: [{ name: ".cache", path: "/h/.cache" }],
        next_page_id: null,
      });

      await fileBrowserApi.searchSubdirectoriesWithHidden({ path: "/home/me" });

      expect(mockGet).not.toHaveBeenCalled();
      expect(mockCallCloudProxy).toHaveBeenCalledWith({
        backend: cloudBackend,
        method: "GET",
        path: "/api/file/search_subdirs?path=%2Fhome%2Fme&include_hidden=true",
      });
    });
  });

  describe("getHomeWithHidden", () => {
    it("sends include_hidden=true via the local axios path", async () => {
      mockGet.mockResolvedValue({
        data: {
          home: "/home/me",
          favorites: [{ label: ".cache", path: "/home/me/.cache" }],
        },
      });

      const result = await fileBrowserApi.getHomeWithHidden();

      const [url] = mockGet.mock.calls[0];
      expect(url).toBe("/api/file/home?include_hidden=true");
      expect(result.favorites?.[0]?.label).toBe(".cache");
    });

    it("routes through callCloudProxy for cloud backends", async () => {
      mockGetActive.mockReturnValue({ backend: cloudBackend, orgId: null });
      mockCallCloudProxy.mockResolvedValue({ home: "/home/me" });

      await fileBrowserApi.getHomeWithHidden();

      expect(mockGet).not.toHaveBeenCalled();
      expect(mockCallCloudProxy).toHaveBeenCalledWith({
        backend: cloudBackend,
        method: "GET",
        path: "/api/file/home?include_hidden=true",
      });
    });
  });

  describe("localFileAxios interceptor", () => {
    it("sets X-Session-API-Key from the effective local backend", () => {
      const interceptor = capturedInterceptors[0];
      expect(interceptor).toBeDefined();
      const config = makeAxiosConfig();
      interceptor(config);
      expect(config.headers.set).toHaveBeenCalledWith(
        "X-Session-API-Key",
        "session-key",
      );
    });

    it("sets baseURL from the effective local backend", () => {
      const interceptor = capturedInterceptors[0];
      const config = makeAxiosConfig();
      interceptor(config);
      expect(config.baseURL).toBe("http://localhost:8000");
    });

    it("throws when no local backend is available", () => {
      mockGetEffectiveLocal.mockReturnValue(null);
      const interceptor = capturedInterceptors[0];
      const config = makeAxiosConfig();
      expect(() => interceptor(config)).toThrow();
    });
  });
});
