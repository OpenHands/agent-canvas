/**
 * Centralized query keys and cache configuration for TanStack Query.
 * Using constants ensures type safety and prevents typos.
 */

import { SettingsScope } from "#/types/settings";

interface BackendQueryIdentity {
  id: string;
  kind: string;
  host: string;
  apiKey?: string | null;
}

const WEB_CLIENT_CONFIG_QUERY_KEY = ["web-client-config"] as const;

export const QUERY_KEYS = {
  /** Web client configuration from the server */
  WEB_CLIENT_CONFIG: WEB_CLIENT_CONFIG_QUERY_KEY,
  WEB_CLIENT_CONFIG_BY_BACKEND: (backend: BackendQueryIdentity) =>
    [
      ...WEB_CLIENT_CONFIG_QUERY_KEY,
      backend.id,
      backend.kind,
      backend.host,
      backend.apiKey ?? "",
    ] as const,
} as const;

export const SETTINGS_QUERY_KEYS = {
  all: ["settings"] as const,
  byScope: (scope: SettingsScope) => ["settings", scope] as const,
  personal: () => ["settings", "personal"] as const,
} as const;

export const LLM_PROFILES_QUERY_KEYS = {
  all: ["llm-profiles"] as const,
} as const;

export const LOCAL_WORKSPACES_QUERY_KEYS = {
  all: ["local-workspaces"] as const,
} as const;

/** Cache configuration shared across all config-related queries */
export const CONFIG_CACHE_OPTIONS = {
  staleTime: 1000 * 60 * 5, // 5 minutes
  gcTime: 1000 * 60 * 15, // 15 minutes
} as const;

export type QueryKeys = (typeof QUERY_KEYS)[keyof typeof QUERY_KEYS];
