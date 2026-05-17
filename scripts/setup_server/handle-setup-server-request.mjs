import { handleSetupBackendsRequest } from "./endpoints/backend-credentials.mjs";

const SETUP_ENDPOINT_HANDLERS = [handleSetupBackendsRequest];

function isSetupRequest(url) {
  try {
    const pathname = new URL(url, "http://localhost").pathname;
    return pathname === "/setup" || pathname.startsWith("/setup/");
  } catch {
    return false;
  }
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}

export async function handleSetupServerRequest(req, res) {
  if (!isSetupRequest(req.url || "")) return false;

  for (const handler of SETUP_ENDPOINT_HANDLERS) {
    if (await handler(req, res)) return true;
  }

  sendJson(res, 404, { error: "Setup endpoint not found" });
  return true;
}
