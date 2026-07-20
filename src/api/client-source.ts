import packageJson from "../../package.json";

export const AGENT_CANVAS_CLIENT_SOURCE = "agent_canvas";
export const AGENT_CANVAS_CLIENT_VERSION = packageJson.version;

/**
 * Coarse, non-user-identifying request metadata for Cloud observability.
 *
 * Cloud ingress can retain these headers as facets without logging request
 * bodies, API keys, device codes, or conversation content.
 */
export const AGENT_CANVAS_CLIENT_HEADERS: Readonly<Record<string, string>> = {
  "X-OpenHands-Client": AGENT_CANVAS_CLIENT_SOURCE,
  "X-OpenHands-Client-Version": AGENT_CANVAS_CLIENT_VERSION,
};
