import axios, {
  AxiosError,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";
import {
  getActiveBackend,
  getEffectiveLocalBackend,
} from "./backend-registry/active-store";
import { buildAuthHeaders } from "./backend-registry/auth";

function serializeParams(
  params: Record<string, unknown> | URLSearchParams,
): string {
  if (params instanceof URLSearchParams) {
    return params.toString();
  }

  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item !== undefined && item !== null) {
          searchParams.append(key, String(item));
        }
      });
      return;
    }

    searchParams.append(key, String(value));
  });

  return searchParams.toString();
}

export const openHands = axios.create({
  paramsSerializer: { serialize: serializeParams },
});

openHands.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  // The default openHands axios speaks the *local agent-server's* protocol
  // (X-Session-API-Key auth, /api/* paths). When the active backend is
  // cloud, fall back to the first registered local backend — cloud-
  // specific calls go through `callCloudProxy` (which uses axios directly)
  // and never hit this interceptor.
  const active = getActiveBackend().backend;
  const backend = active.kind === "cloud" ? getEffectiveLocalBackend() : active;

  // Mutating the per-request config is the canonical axios interceptor pattern.
  // eslint-disable-next-line no-param-reassign
  if (!config.baseURL) config.baseURL = backend.host;

  const headers = buildAuthHeaders(backend);
  Object.entries(headers).forEach(([key, value]) => {
    config.headers.set(key, value);
  });
  return config;
});

// Helper function to check if a response contains an email verification error
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const checkForEmailVerificationError = (data: any): boolean => {
  const EMAIL_NOT_VERIFIED = "EmailNotVerifiedError";

  if (typeof data === "string") {
    return data.includes(EMAIL_NOT_VERIFIED);
  }

  if (typeof data === "object" && data !== null) {
    if ("message" in data) {
      const { message } = data;
      if (typeof message === "string") {
        return message.includes(EMAIL_NOT_VERIFIED);
      }
      if (Array.isArray(message)) {
        return message.some(
          (msg) => typeof msg === "string" && msg.includes(EMAIL_NOT_VERIFIED),
        );
      }
    }

    return Object.values(data).some(
      (value) =>
        (typeof value === "string" && value.includes(EMAIL_NOT_VERIFIED)) ||
        (Array.isArray(value) &&
          value.some(
            (v) => typeof v === "string" && v.includes(EMAIL_NOT_VERIFIED),
          )),
    );
  }

  return false;
};

openHands.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: AxiosError) => {
    if (
      error.response?.status === 403 &&
      checkForEmailVerificationError(error.response?.data)
    ) {
      if (window.location.pathname !== "/settings/user") {
        window.location.reload();
      }
    }

    return Promise.reject(error);
  },
);
