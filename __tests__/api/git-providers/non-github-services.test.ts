import { afterEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "#/mocks/node";
import { GitLabService } from "#/api/git-providers/gitlab-service";
import { BitbucketService } from "#/api/git-providers/bitbucket-service";
import { BitbucketDataCenterService } from "#/api/git-providers/bitbucket-dc-service";
import { AzureDevOpsService } from "#/api/git-providers/azure-devops-service";
import { ForgejoService } from "#/api/git-providers/forgejo-service";

afterEach(() => {
  server.resetHandlers();
});

describe("GitLabService.getUser", () => {
  it("maps GitLab /user payload into GitUser", async () => {
    server.use(
      http.get("https://gitlab.com/api/v4/user", () =>
        HttpResponse.json({
          id: 17,
          username: "glab-user",
          avatar_url: "https://gitlab.example/avatar.png",
          name: "GLab User",
          email: "user@example.com",
          organization: "GitLab Inc",
        }),
      ),
    );

    const user = await new GitLabService({ token: "glpat", host: null }).getUser();

    expect(user).toMatchObject({
      id: "17",
      login: "glab-user",
      email: "user@example.com",
      company: "GitLab Inc",
    });
  });
});

describe("BitbucketService.getUser", () => {
  it("uses the Cloud /user response and the primary email fallback", async () => {
    server.use(
      http.get("https://api.bitbucket.org/2.0/user", () =>
        HttpResponse.json({
          account_id: "acc-1",
          username: "bbuser",
          display_name: "Bitbucket User",
          links: { avatar: { href: "https://bb.example/a.png" } },
        }),
      ),
      http.get("https://api.bitbucket.org/2.0/user/emails", () =>
        HttpResponse.json({
          values: [
            { email: "user@example.com", is_primary: true, is_confirmed: true },
          ],
        }),
      ),
    );

    const user = await new BitbucketService({
      token: "bbtoken",
      host: null,
    }).getUser();

    expect(user).toMatchObject({
      id: "acc-1",
      login: "bbuser",
      email: "user@example.com",
    });
  });
});

describe("BitbucketDataCenterService.getUser", () => {
  it("returns an empty profile placeholder until OAuth is wired", async () => {
    const user = await new BitbucketDataCenterService({
      token: "bbdc",
      host: "bitbucket.example",
    }).getUser();

    expect(user).toEqual({
      id: "",
      login: "",
      avatar_url: "",
      name: null,
      email: null,
      company: null,
    });
  });
});

describe("AzureDevOpsService.getUser", () => {
  it("maps the Azure DevOps profile endpoint into GitUser", async () => {
    server.use(
      http.get(
        "https://app.vssps.visualstudio.com/_apis/profile/profiles/me",
        () =>
          HttpResponse.json({
            id: "az-1",
            displayName: "Az User",
            emailAddress: "az@example.com",
          }),
      ),
    );

    const user = await new AzureDevOpsService({
      token: "azpat",
      host: null,
    }).getUser();

    expect(user).toMatchObject({
      id: "az-1",
      login: "Az User",
      email: "az@example.com",
    });
  });
});

describe("ForgejoService.getUser", () => {
  it("maps Forgejo /user into GitUser via the configured host", async () => {
    server.use(
      http.get("https://forgejo.example.com/api/v1/user", () =>
        HttpResponse.json({
          id: 5,
          username: "fjuser",
          avatar_url: "https://forgejo.example.com/avatar.png",
          full_name: "Forgejo User",
          email: "fj@example.com",
        }),
      ),
    );

    const user = await new ForgejoService({
      token: "fjtoken",
      host: "forgejo.example.com",
    }).getUser();

    expect(user).toMatchObject({
      id: "5",
      login: "fjuser",
      email: "fj@example.com",
      name: "Forgejo User",
    });
  });
});
