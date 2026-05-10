import { buildHttpBaseUrl } from "#/utils/websocket-url";

/**
 * Build a URL for a single file in a conversation's workspace, served by the
 * agent server's static workspace fileserver (introduced in
 * software-agent-sdk PR #3192).
 *
 * The route shape is:
 *   GET {base}/api/conversations/{conversationId}/workspace/{relativePath}
 *
 * For directories, omit `relativePath` (or pass empty); the server falls
 * back to that directory's `index.html`.
 *
 * The route inherits the agent server's session-API-key auth dependency,
 * but `auto_error=False` means it returns 401 only when the server is
 * configured with session keys. On unauthenticated dev servers the URL
 * can be used directly as e.g. an `<iframe src>` with no extra headers.
 *
 * Returns `null` when we don't have enough information to construct a
 * usable URL (no conversation URL or no conversation id yet).
 */
export function buildWorkspaceFileUrl(params: {
  conversationUrl: string | null | undefined;
  conversationId: string | null | undefined;
  relativePath?: string | null;
}): string | null {
  const { conversationUrl, conversationId, relativePath } = params;
  if (!conversationUrl || !conversationId) return null;

  const base = buildHttpBaseUrl(conversationUrl);
  // Encode each path segment so spaces / unicode / `#` don't break the URL,
  // but leave the `/` separators intact.
  const cleaned = (relativePath ?? "").replace(/^\/+/, "");
  const encodedPath = cleaned
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  const suffix = encodedPath ? `/${encodedPath}` : "";
  return `${base}/api/conversations/${conversationId}/workspace${suffix}`;
}
