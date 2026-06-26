const WORKSPACE_SESSION_PATH = "/api/auth/workspace-session";

function isWorkspaceSessionRequest(url) {
  return (
    url === WORKSPACE_SESSION_PATH ||
    url.startsWith(`${WORKSPACE_SESSION_PATH}?`)
  );
}

function stripSecureAttribute(cookie) {
  return cookie.replace(/;\s*Secure(?=;|$)/gi, "");
}

export function maybeRewriteWorkspaceSessionCookieHeaders(
  headers,
  reqUrl,
  opts,
) {
  if (
    !opts?.disableSecureWorkspaceSession ||
    !isWorkspaceSessionRequest(reqUrl)
  ) {
    return headers;
  }

  const nextHeaders = { ...headers };
  const setCookie = nextHeaders["set-cookie"];
  if (!setCookie) {
    return nextHeaders;
  }

  nextHeaders["set-cookie"] = Array.isArray(setCookie)
    ? setCookie.map(stripSecureAttribute)
    : stripSecureAttribute(setCookie);
  return nextHeaders;
}
