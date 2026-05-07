import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import type { Backend } from "#/api/backend-registry/types";
import UserService from "#/api/user-service/user-service.api";

const cloudGitUser = vi.fn();
const providerHandlerGetUser = vi.fn();

vi.mock("#/api/cloud/user-service.api", () => ({
  getCloudGitUser: () => cloudGitUser(),
}));
vi.mock("#/api/git-providers/provider-handler", () => ({
  ProviderHandler: {
    getUserGitInfo: () => providerHandlerGetUser(),
  },
}));

const cloudBackend: Backend = {
  id: "prod",
  name: "Production",
  host: "https://app.all-hands.dev",
  apiKey: "bearer-token",
  kind: "cloud",
};

beforeEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  cloudGitUser.mockReset();
  providerHandlerGetUser.mockReset();
});

afterEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
});

describe("UserService.getUser branch by backend kind", () => {
  it("uses the cloud /api/v1/users/git-info path when active is cloud (no false 'No git provider' toast)", async () => {
    setRegisteredBackends([cloudBackend]);
    setActiveSelection({ backendId: cloudBackend.id });
    cloudGitUser.mockResolvedValue({
      id: "u1",
      login: "alice",
      avatar_url: "",
      company: null,
      name: null,
      email: null,
    });

    const user = await UserService.getUser();

    expect(cloudGitUser).toHaveBeenCalledOnce();
    // The local "no git provider" check must NOT run for cloud — it would
    // throw on a clean install where the user has not pasted a local PAT.
    expect(providerHandlerGetUser).not.toHaveBeenCalled();
    expect(user?.login).toBe("alice");
  });

  it("uses the local ProviderHandler when active is local (preserves the local 'No git provider' check)", async () => {
    providerHandlerGetUser.mockResolvedValue({
      id: "u2",
      login: "bob",
      avatar_url: "",
      company: null,
      name: null,
      email: null,
    });

    await UserService.getUser();

    expect(providerHandlerGetUser).toHaveBeenCalledOnce();
    expect(cloudGitUser).not.toHaveBeenCalled();
  });
});
