import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import type { Backend } from "#/api/backend-registry/types";
import WorkspacesService from "#/api/workspaces-service/workspaces-service.api";

const { mockGet, mockPost, mockDelete } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock("@openhands/typescript-client/client/http-client", () => ({
  HttpClient: vi.fn(function HttpClientMock() {
    return { get: mockGet, post: mockPost, delete: mockDelete };
  }),
}));

const localBackend: Backend = {
  id: "local",
  name: "Local",
  host: "http://127.0.0.1:8000",
  apiKey: "",
  kind: "local",
};

beforeEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  setRegisteredBackends([localBackend]);
  setActiveSelection({ backendId: localBackend.id });
  mockGet.mockReset();
  mockPost.mockReset();
  mockDelete.mockReset();
});

afterEach(() => {
  __resetActiveStoreForTests();
});

describe("WorkspacesService", () => {
  it("listWorkspaces unwraps the response body returned by HttpClient.get", async () => {
    // Arrange
    const body = {
      workspaces: [{ id: "/a", name: "a", path: "/a" }],
      workspaceParents: [{ id: "/p", name: "p", path: "/p" }],
    };
    mockGet.mockResolvedValue({ data: body, status: 200 });

    // Act
    const result = await WorkspacesService.listWorkspaces();

    // Assert
    expect(mockGet).toHaveBeenCalledWith("/api/workspaces");
    expect(result).toEqual(body);
  });

  it("addWorkspaces POSTs the items wrapped in a workspaces envelope", async () => {
    // Arrange
    mockPost.mockResolvedValue({ data: { workspaces: [], workspaceParents: [] } });
    const items = [{ id: "/a", name: "a", path: "/a", parentPath: "/p" }];

    // Act
    await WorkspacesService.addWorkspaces(items);

    // Assert
    expect(mockPost).toHaveBeenCalledWith("/api/workspaces", {
      workspaces: items,
    });
  });

  it("addWorkspaceParents POSTs the items wrapped in a parents envelope", async () => {
    // Arrange
    mockPost.mockResolvedValue({ data: { workspaces: [], workspaceParents: [] } });
    const parents = [{ id: "/p", name: "p", path: "/p" }];

    // Act
    await WorkspacesService.addWorkspaceParents(parents);

    // Assert
    expect(mockPost).toHaveBeenCalledWith("/api/workspaces/parents", {
      parents,
    });
  });

  it("removeWorkspace URL-encodes the path so slashes survive the query string", async () => {
    // Arrange
    mockDelete.mockResolvedValue({ data: { deleted: true } });

    // Act
    await WorkspacesService.removeWorkspace("/Users/me/dev/repo 1");

    // Assert
    expect(mockDelete).toHaveBeenCalledWith(
      "/api/workspaces?path=%2FUsers%2Fme%2Fdev%2Frepo%201",
    );
  });

  it("removeWorkspaceParent targets the parents endpoint", async () => {
    // Arrange
    mockDelete.mockResolvedValue({ data: { deleted: true } });

    // Act
    await WorkspacesService.removeWorkspaceParent("/parents/root");

    // Assert
    expect(mockDelete).toHaveBeenCalledWith(
      "/api/workspaces/parents?path=%2Fparents%2Froot",
    );
  });
});
