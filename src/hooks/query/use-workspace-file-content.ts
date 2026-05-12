import { useQuery } from "@tanstack/react-query";
import { FileClient } from "@openhands/typescript-client/clients";

import { getAgentServerClientOptions } from "#/api/agent-server-client-options";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useRuntimeIsReady } from "#/hooks/use-runtime-is-ready";
import { useWorkspaceMutationCounter } from "#/stores/use-workspace-mutation-counter";

// Magic-number sniff for common binary formats we can render via iframe.
const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "ico",
  "svg",
  "avif",
]);

const PDF_EXTENSIONS = new Set(["pdf"]);

export type WorkspaceFileKind = "text" | "image" | "pdf" | "binary";

export interface WorkspaceFileContent {
  path: string;
  kind: WorkspaceFileKind;
  /** Decoded text contents — only populated when kind === "text". */
  text: string | null;
  /**
   * Browser-renderable URL for rich previews and "open in new window".
   * Usually a local Blob URL derived from `/api/file/download` bytes.
   */
  staticUrl: string;
  /** MIME type guessed from the file extension. */
  mimeType: string;
}

function getExtension(path: string): string {
  const idx = path.lastIndexOf(".");
  if (idx === -1) return "";
  return path.slice(idx + 1).toLowerCase();
}

function guessMimeType(path: string): string {
  const ext = getExtension(path);
  switch (ext) {
    case "html":
    case "htm":
      return "text/html";
    case "css":
      return "text/css";
    case "js":
    case "mjs":
    case "cjs":
      return "text/javascript";
    case "json":
      return "application/json";
    case "md":
    case "markdown":
      return "text/markdown";
    case "svg":
      return "image/svg+xml";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "bmp":
      return "image/bmp";
    case "ico":
      return "image/x-icon";
    case "avif":
      return "image/avif";
    case "pdf":
      return "application/pdf";
    default:
      return "text/plain";
  }
}

function classifyKind(path: string): WorkspaceFileKind {
  const ext = getExtension(path);
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (PDF_EXTENSIONS.has(ext)) return "pdf";
  // Everything else is treated as text and decoded; if decoding produces
  // null bytes we fall back to "binary" downstream.
  return "text";
}

function isLikelyBinary(buffer: ArrayBuffer): boolean {
  // Same heuristic git uses: presence of a NUL byte in the first ~8KB.
  const view = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 8000));
  for (let i = 0; i < view.length; i += 1) {
    if (view[i] === 0) return true;
  }
  return false;
}

function resolveWorkspacePath(
  workingDir: string,
  relativePath: string,
): string {
  const normalizedWorkingDir = workingDir.replace(/\/+$/, "");
  const segments: string[] = [];

  for (const segment of relativePath.replace(/^\/+/, "").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      throw new Error("Workspace file path must stay inside the workspace");
    }
    segments.push(segment);
  }

  if (!normalizedWorkingDir.startsWith("/") || segments.length === 0) {
    throw new Error("Invalid workspace file path");
  }

  return `${normalizedWorkingDir}/${segments.join("/")}`;
}

function makePreviewUrl(buffer: ArrayBuffer, mimeType: string): string {
  return URL.createObjectURL(new Blob([buffer], { type: mimeType }));
}

/**
 * Reads a single file out of the active conversation's workspace through the
 * typed file API and classifies it as text/image/pdf/binary so the UI can pick
 * a renderer. We intentionally avoid the cookie-based workspace-session route
 * here: older live agent-server previews may not expose it yet, and credentialed
 * cross-origin requests fail when those backends return wildcard CORS headers.
 *
 * Pass a falsy `relativePath` to disable the query (e.g. when no file is
 * selected yet).
 */
export function useWorkspaceFileContent(relativePath: string | null) {
  const { data: conversation } = useActiveConversation();
  const runtimeIsReady = useRuntimeIsReady();
  const workspaceMutationCount = useWorkspaceMutationCounter(
    (state) => state.count,
  );

  const conversationId = conversation?.id;
  const conversationUrl = conversation?.conversation_url;
  const sessionApiKey = conversation?.session_api_key;
  const workingDir = conversation?.workspace?.working_dir?.trim();

  return useQuery<WorkspaceFileContent>({
    queryKey: [
      "workspace-file-content",
      conversationId,
      conversationUrl,
      sessionApiKey,
      workingDir,
      relativePath,
      workspaceMutationCount,
    ],
    queryFn: async () => {
      if (!relativePath) throw new Error("No path");
      if (!workingDir) throw new Error("No workspace directory");

      const kind = classifyKind(relativePath);
      const mimeType = guessMimeType(relativePath);
      const filePath = resolveWorkspacePath(workingDir, relativePath);
      const fileClient = new FileClient(
        getAgentServerClientOptions({ conversationUrl, sessionApiKey }),
      );
      const buffer = await fileClient.downloadFile(filePath);

      if (kind !== "text") {
        return {
          path: relativePath,
          kind,
          text: null,
          staticUrl: makePreviewUrl(buffer, mimeType),
          mimeType,
        };
      }

      if (isLikelyBinary(buffer)) {
        const binaryMimeType = "application/octet-stream";
        return {
          path: relativePath,
          kind: "binary",
          text: null,
          staticUrl: makePreviewUrl(buffer, binaryMimeType),
          mimeType: binaryMimeType,
        };
      }

      const text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
      return {
        path: relativePath,
        kind: "text",
        text,
        staticUrl: makePreviewUrl(buffer, mimeType),
        mimeType,
      };
    },
    enabled:
      runtimeIsReady && !!conversationId && !!workingDir && !!relativePath,
    retry: false,
    staleTime: 1000 * 5,
    gcTime: 1000 * 60,
    meta: { disableToast: true },
  });
}
