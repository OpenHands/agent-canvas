import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  useSearchSubdirs,
  useHomeDirectory,
} from "#/hooks/query/use-search-subdirs";

const backendMock = vi.hoisted(() => ({
  current: {
    backend: { id: "local-1", kind: "local" as "local" | "cloud" },
    orgId: null as string | null,
  },
}));
vi.mock("#/contexts/active-backend-context", () => ({
  useActiveBackend: () => backendMock.current,
}));

vi.mock("#/api/agent-server-client-options", () => ({
  getAgentServerClientOptions: () => ({ host: "http://localhost" }),
}));

const fileSearch = vi.hoisted(() => vi.fn());
const fileGetHome = vi.hoisted(() => vi.fn());
vi.mock("@openhands/typescript-client/clients", () => ({
  FileClient: class {
    searchSubdirectories = fileSearch;

    getHome = fileGetHome;
  },
}));

const searchHidden = vi.hoisted(() => vi.fn());
const getHomeHidden = vi.hoisted(() => vi.fn());
vi.mock("#/api/file-browser/file-browser-api", () => ({
  fileBrowserApi: {
    searchSubdirectoriesWithHidden: searchHidden,
    getHomeWithHidden: getHomeHidden,
  },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  backendMock.current = {
    backend: { id: "local-1", kind: "local" },
    orgId: null,
  };
});

describe("useSearchSubdirs", () => {
  it("uses the typed FileClient and omits hidden dirs by default", async () => {
    fileSearch.mockResolvedValue({ items: [], next_page_id: null });

    const { result } = renderHook(() => useSearchSubdirs("/home/me"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fileSearch).toHaveBeenCalledWith("/home/me");
    expect(searchHidden).not.toHaveBeenCalled();
  });

  it("requests include_hidden when showing hidden dirs", async () => {
    searchHidden.mockResolvedValue({
      items: [{ name: ".config", path: "/home/me/.config" }],
      next_page_id: null,
    });

    const { result } = renderHook(() => useSearchSubdirs("/home/me", true), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(searchHidden).toHaveBeenCalledWith({ path: "/home/me" });
    expect(fileSearch).not.toHaveBeenCalled();
    expect(result.current.data?.items[0]?.name).toBe(".config");
  });
});

describe("useHomeDirectory", () => {
  it("uses the typed FileClient by default", async () => {
    fileGetHome.mockResolvedValue({ home: "/home/me" });

    const { result } = renderHook(() => useHomeDirectory(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fileGetHome).toHaveBeenCalledTimes(1);
    expect(getHomeHidden).not.toHaveBeenCalled();
  });

  it("requests include_hidden when showing hidden dirs", async () => {
    getHomeHidden.mockResolvedValue({
      home: "/home/me",
      favorites: [{ label: ".cache", path: "/home/me/.cache" }],
    });

    const { result } = renderHook(() => useHomeDirectory(true), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getHomeHidden).toHaveBeenCalledTimes(1);
    expect(fileGetHome).not.toHaveBeenCalled();
    expect(result.current.data?.favorites?.[0]?.label).toBe(".cache");
  });
});
