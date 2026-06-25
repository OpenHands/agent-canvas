import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGet, mockPut, mockPost } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPut: vi.fn(),
  mockPost: vi.fn(),
}));

vi.mock("axios", () => ({
  default: {
    create: () => ({
      get: mockGet,
      put: mockPut,
      post: mockPost,
      interceptors: {
        request: {
          use: vi.fn(),
        },
      },
    }),
  },
}));

vi.mock("#/api/backend-registry/active-store", () => ({
  getEffectiveLocalBackend: () => ({
    id: "local-1",
    host: "http://localhost:8000",
    kind: "local",
    name: "Local",
    apiKey: "k",
  }),
}));

import WorkRuntimeService from "#/api/work-runtime-service/work-runtime-service.api";

describe("WorkRuntimeService", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPut.mockReset();
    mockPost.mockReset();
  });

  it("checks health", async () => {
    mockGet.mockResolvedValue({ data: { status: "ok" } });
    await expect(WorkRuntimeService.checkHealth()).resolves.toEqual({
      status: "ok",
    });
    expect(mockGet).toHaveBeenCalledWith("/api/work/health");
  });

  it("loads and updates manifest", async () => {
    const manifest = {
      id: "w1",
      name: "Work",
      grantedFolders: ["/tmp/docs"],
      deliverablesPath: "/tmp/docs/deliverables",
    };
    mockGet.mockResolvedValue({ data: manifest });
    mockPut.mockResolvedValue({ data: manifest });

    await expect(WorkRuntimeService.getManifest()).resolves.toEqual(manifest);
    await expect(WorkRuntimeService.updateManifest(manifest)).resolves.toEqual(
      manifest,
    );
  });
});
