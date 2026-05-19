import { handleSetupBackendsRequest } from "./endpoints/backend-credentials.mjs";

const handlers = [handleSetupBackendsRequest];

export async function handleSetupServerRequest(req, res) {
  for (const handler of handlers) {
    if (await handler(req, res)) return true;
  }
  return false;
}
