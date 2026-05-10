import { describe, it, expect } from "vitest";

import { buildWorkspaceFileUrl } from "#/utils/workspace-file-url";

// `buildHttpBaseUrl` reads `window.location.protocol`. jsdom defaults to
// `http:`, which is what these tests assert against.

describe("buildWorkspaceFileUrl", () => {
  it("returns null without a conversation URL", () => {
    expect(
      buildWorkspaceFileUrl({
        conversationUrl: null,
        conversationId: "abc",
        relativePath: "index.html",
      }),
    ).toBeNull();
  });

  it("returns null without a conversation id", () => {
    expect(
      buildWorkspaceFileUrl({
        conversationUrl: "http://host:1234/api/conversations/abc",
        conversationId: null,
        relativePath: "index.html",
      }),
    ).toBeNull();
  });

  it("joins host + workspace path for a top-level file", () => {
    expect(
      buildWorkspaceFileUrl({
        conversationUrl: "http://localhost:3000/api/conversations/abc",
        conversationId: "abc",
        relativePath: "index.html",
      }),
    ).toBe("http://localhost:3000/api/conversations/abc/workspace/index.html");
  });

  it("preserves slash separators while encoding individual segments", () => {
    expect(
      buildWorkspaceFileUrl({
        conversationUrl: "http://localhost:3000/api/conversations/abc",
        conversationId: "abc",
        relativePath: "src/dir name/file with space.ts",
      }),
    ).toBe(
      "http://localhost:3000/api/conversations/abc/workspace/src/dir%20name/file%20with%20space.ts",
    );
  });

  it("strips a leading slash from the relative path", () => {
    expect(
      buildWorkspaceFileUrl({
        conversationUrl: "http://localhost:3000/api/conversations/abc",
        conversationId: "abc",
        relativePath: "/index.html",
      }),
    ).toBe("http://localhost:3000/api/conversations/abc/workspace/index.html");
  });

  it("returns the directory URL (no trailing slash) when no relative path is given", () => {
    expect(
      buildWorkspaceFileUrl({
        conversationUrl: "http://localhost:3000/api/conversations/abc",
        conversationId: "abc",
      }),
    ).toBe("http://localhost:3000/api/conversations/abc/workspace");
  });

  it("honours a path prefix in the conversation URL (proxy deployments)", () => {
    expect(
      buildWorkspaceFileUrl({
        conversationUrl:
          "http://localhost:3000/runtime/55313/api/conversations/abc",
        conversationId: "abc",
        relativePath: "index.html",
      }),
    ).toBe(
      "http://localhost:3000/runtime/55313/api/conversations/abc/workspace/index.html",
    );
  });
});
