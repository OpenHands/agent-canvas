/**
 * MSW handlers for the extension proxy endpoint.
 *
 * In mock mode, this simulates the backend proxy that fetches extension assets
 * from GitHub and serves them with appropriate headers. In real mode, Vite
 * proxies `/api/extensions/proxy` to the actual agent-server backend.
 */

import { http, HttpResponse } from "msw";

/** Sample extension manifest for mock responses. */
const MOCK_MANIFEST = {
  id: "mock.extension",
  name: "Mock Extension",
  version: "1.0.0",
  publisher: "mock",
  engines: { "agent-canvas": ">=0.1.0" },
};

/** Sample HTML content for mock webview. */
const MOCK_PANEL_HTML = `<!DOCTYPE html>
<html>
<head><title>Mock Extension Panel</title></head>
<body><h1>Mock Extension</h1></body>
</html>`;

/** Sample JS content for mock worker. */
const MOCK_MAIN_JS = `
// Mock extension worker
self.onmessage = (e) => {
  if (e.data.type === 'activate') {
    console.log('Mock extension activated');
  }
};
`;

/** Sample CSS content. */
const MOCK_STYLE_CSS = `
body { font-family: sans-serif; }
`;

/** Sample SVG icon. */
const MOCK_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>`;

/** Content types by extension. */
const CONTENT_TYPES: Record<string, string> = {
  ".json": "application/json",
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

/** Get content type for a file extension. */
function getContentType(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

/** Get mock content for a file. */
function getMockContent(file: string): string | null {
  if (file === "extension.json") {
    return JSON.stringify(MOCK_MANIFEST);
  }
  if (file === "panel.html" || file.endsWith(".html")) {
    return MOCK_PANEL_HTML;
  }
  if (file === "main.js" || file.endsWith(".js")) {
    return MOCK_MAIN_JS;
  }
  if (file.endsWith(".css")) {
    return MOCK_STYLE_CSS;
  }
  if (file.endsWith(".svg")) {
    return MOCK_ICON_SVG;
  }
  return null;
}

/** Validate a source ref format. */
function isValidSource(source: string): boolean {
  // Must start with a known prefix (canonical `github:` plus the `gh:` alias).
  return (
    source.startsWith("github:") ||
    source.startsWith("gh:") ||
    source.startsWith("npm:")
  );
}

/** Validate file path (prevent traversal). */
function isValidFilePath(file: string): boolean {
  if (file.includes("..")) return false;
  if (file.startsWith("/")) return false;
  if (file.includes("?") || file.includes("#")) return false;
  if (file.length > 256) return false;
  return true;
}

export const EXTENSION_PROXY_HANDLERS = [
  /**
   * Extension proxy endpoint.
   *
   * GET /api/extensions/proxy?source=<source>&file=<file>
   *
   * Fetches extension assets from external sources and serves them with
   * appropriate headers. In mock mode, returns canned responses.
   */
  http.get("/api/extensions/proxy", ({ request }) => {
    const url = new URL(request.url);
    const source = url.searchParams.get("source");
    const file = url.searchParams.get("file");

    // Validate required params
    if (!source || !file) {
      return HttpResponse.json(
        { error: "Missing required parameters: source and file" },
        { status: 400 },
      );
    }

    // Validate source format
    if (!isValidSource(source)) {
      return HttpResponse.json(
        { error: `Invalid source format: ${source}` },
        { status: 400 },
      );
    }

    // Validate file path
    if (!isValidFilePath(file)) {
      return HttpResponse.json({ error: "Invalid file path" }, { status: 400 });
    }

    // Get mock content
    const content = getMockContent(file);
    if (!content) {
      return HttpResponse.json(
        { error: `File not found: ${file}` },
        { status: 404 },
      );
    }

    const contentType = getContentType(file);
    return new HttpResponse(content, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }),
];
