import { describe, expect, it } from "vitest";

import { maybeRewriteWorkspaceSessionCookieHeaders } from "../../scripts/proxy-cookie-utils.mjs";

describe("proxy-cookie-utils", () => {
  const workspaceCookie =
    "oh_workspace_session_key=abc; Path=/api/conversations; HttpOnly; Secure; SameSite=Lax";

  it("leaves workspace-session cookies secure by default", () => {
    const headers = maybeRewriteWorkspaceSessionCookieHeaders(
      { "set-cookie": [workspaceCookie] },
      "/api/auth/workspace-session",
      {},
    );

    expect(headers["set-cookie"]).toEqual([workspaceCookie]);
  });

  it("strips Secure from workspace-session cookies when explicitly enabled", () => {
    const headers = maybeRewriteWorkspaceSessionCookieHeaders(
      { "set-cookie": [workspaceCookie] },
      "/api/auth/workspace-session",
      { disableSecureWorkspaceSession: true },
    );

    expect(headers["set-cookie"]).toEqual([
      "oh_workspace_session_key=abc; Path=/api/conversations; HttpOnly; SameSite=Lax",
    ]);
  });

  it("does not strip Secure from unrelated cookies", () => {
    const headers = maybeRewriteWorkspaceSessionCookieHeaders(
      { "set-cookie": ["other=abc; Path=/; Secure; SameSite=Lax"] },
      "/api/settings",
      { disableSecureWorkspaceSession: true },
    );

    expect(headers["set-cookie"]).toEqual([
      "other=abc; Path=/; Secure; SameSite=Lax",
    ]);
  });
});
