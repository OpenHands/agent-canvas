import { useQuery } from "@tanstack/react-query";

import { createRemoteWorkspace } from "#/api/typescript-client";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useRuntimeIsReady } from "#/hooks/use-runtime-is-ready";

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
  absolutePath: string;
  kind: WorkspaceFileKind;
  /** Decoded text contents — only populated when kind === "text". */
  text: string | null;
  /** Object URL pointing at the file blob — populated for non-text kinds. */
  blobUrl: string | null;
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

function joinPath(workingDir: string, relPath: string): string {
  const trimmedDir = workingDir.replace(/\/+$/, "");
  const trimmedPath = relPath.replace(/^\/+/, "");
  return trimmedPath ? `${trimmedDir}/${trimmedPath}` : trimmedDir;
}

/**
 * Reads a single file out of the active conversation's workspace and
 * classifies it as text/image/pdf/binary so the UI can pick a renderer.
 *
 * Pass a falsy `relativePath` to disable the query (e.g. when no file is
 * selected yet).
 */
export function useWorkspaceFileContent(relativePath: string | null) {
  const { data: conversation } = useActiveConversation();
  const runtimeIsReady = useRuntimeIsReady();

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
    ],
    queryFn: async () => {
      if (!relativePath) throw new Error("No path");
      if (!workingDir) throw new Error("No working dir");

      const absolutePath = joinPath(workingDir, relativePath);
      const workspace = createRemoteWorkspace({
        conversationUrl,
        sessionApiKey,
      });

      const kind = classifyKind(relativePath);
      const mimeType = guessMimeType(relativePath);

      // Always materialise the response as an ArrayBuffer so we can run
      // the same NUL-byte heuristic on text-classified files.
      const blob = await workspace.downloadAsBlob(absolutePath);
      const buffer = await blob.arrayBuffer();

      if (kind === "text") {
        if (isLikelyBinary(buffer)) {
          const binaryBlob = new Blob([buffer], {
            type: "application/octet-stream",
          });
          return {
            path: relativePath,
            absolutePath,
            kind: "binary",
            text: null,
            blobUrl: URL.createObjectURL(binaryBlob),
            mimeType: "application/octet-stream",
          };
        }
        const text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
        return {
          path: relativePath,
          absolutePath,
          kind: "text",
          text,
          blobUrl: null,
          mimeType,
        };
      }

      const typedBlob = new Blob([buffer], { type: mimeType });
      return {
        path: relativePath,
        absolutePath,
        kind,
        text: null,
        blobUrl: URL.createObjectURL(typedBlob),
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
