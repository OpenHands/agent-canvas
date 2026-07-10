export {
  DeviceFlowError,
  pollForToken,
  startDeviceFlow,
} from "@openhands/typescript-client/clients";
import { isOpenHandsCloudHost as sdkIsOpenHandsCloudHost } from "@openhands/typescript-client/clients";

const OPENHANDS_CLOUD_HOST_SUFFIXES = ["all-hands.dev", "openhands.dev"];

function isAllowedCloudHostname(hostname: string): boolean {
  return OPENHANDS_CLOUD_HOST_SUFFIXES.some(
    (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
  );
}

function fallbackIsOpenHandsCloudHost(host: string): boolean {
  if (!host.trim()) return false;

  try {
    const normalizedHost = host.includes("://") ? host : `https://${host}`;
    const { hostname } = new URL(normalizedHost);
    return isAllowedCloudHostname(hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function isOpenHandsCloudHost(host: string): boolean {
  try {
    if (typeof sdkIsOpenHandsCloudHost === "function") {
      return sdkIsOpenHandsCloudHost(host);
    }
  } catch {
    return fallbackIsOpenHandsCloudHost(host);
  }

  return fallbackIsOpenHandsCloudHost(host);
}
export type {
  DeviceAuthorizationResponse,
  DeviceTokenResponse,
  PollDeviceTokenOptions as PollOptions,
} from "@openhands/typescript-client/clients";
