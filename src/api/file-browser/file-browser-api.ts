import axios from "axios";
import {
  getActiveBackend,
  getEffectiveLocalBackend,
} from "../backend-registry/active-store";
import { callCloudProxy } from "../cloud/proxy";
import { NoBackendAvailableError } from "../agent-server-client-options";
import type {
  FileBrowserEntry,
  HomeDirectoryResponse,
} from "#/hooks/query/use-search-subdirs";

// TEMPORARY: the pinned typed `FileClient` (1.24.3) cannot forward an
// `include_hidden` query param to the agent-server file-browser endpoints, so
// the "show hidden folders" path issues those two requests directly via axios.
// This file is on the API-access guard's allowlist for exactly that reason.
// Once @openhands/typescript-client adds `includeHidden` to
// `FileClient.searchSubdirectories` / `getHome`, bump the client pin, route
// both calls through the typed client, and delete this module + its allowlist
// entry.

interface SubdirectoryEntry {
  name: string;
  path: string;
}

interface SubdirectoryPage {
  items: SubdirectoryEntry[];
  next_page_id: string | null;
}

const SEARCH_SUBDIRS_PATH = "/api/file/search_subdirs";
const HOME_PATH = "/api/file/home";

const localFileAxios = axios.create();

localFileAxios.interceptors.request.use((config) => {
  const backend = getEffectiveLocalBackend();
  if (!backend) throw new NoBackendAvailableError();
  // eslint-disable-next-line no-param-reassign
  if (!config.baseURL) config.baseURL = backend.host;
  const apiKey = backend.apiKey?.trim();
  if (apiKey) {
    config.headers.set("X-Session-API-Key", apiKey);
  }
  return config;
});

interface HiddenSearchParams {
  path: string;
  pageId?: string | null;
  limit?: number;
}

async function searchSubdirectoriesWithHidden(
  params: HiddenSearchParams,
): Promise<SubdirectoryPage> {
  const active = getActiveBackend();
  if (active.backend.kind === "cloud") {
    const query = new URLSearchParams({
      path: params.path,
      include_hidden: "true",
    });
    if (params.pageId) query.set("page_id", params.pageId);
    if (params.limit !== undefined) query.set("limit", String(params.limit));
    return callCloudProxy<SubdirectoryPage>({
      backend: active.backend,
      method: "GET",
      path: `${SEARCH_SUBDIRS_PATH}?${query.toString()}`,
    });
  }

  const response = await localFileAxios.get<SubdirectoryPage>(
    SEARCH_SUBDIRS_PATH,
    { params: { ...params, include_hidden: true } },
  );
  return response.data;
}

async function getHomeWithHidden(): Promise<HomeDirectoryResponse> {
  const active = getActiveBackend();
  if (active.backend.kind === "cloud") {
    return callCloudProxy<HomeDirectoryResponse>({
      backend: active.backend,
      method: "GET",
      path: `${HOME_PATH}?include_hidden=true`,
    });
  }

  const response = await localFileAxios.get<HomeDirectoryResponse>(HOME_PATH, {
    params: { include_hidden: true },
  });
  return response.data;
}

export const fileBrowserApi = {
  searchSubdirectoriesWithHidden,
  getHomeWithHidden,
};

export type { FileBrowserEntry, HomeDirectoryResponse };
