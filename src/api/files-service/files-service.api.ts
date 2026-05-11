import { createHttpClient } from "../typescript-client";

export interface SubdirectoryEntry {
  name: string;
  path: string;
}

export interface SubdirectoryPage {
  items: SubdirectoryEntry[];
  next_page_id: string | null;
}

export interface FileBrowserEntry {
  label: string;
  path: string;
}

export interface HomeResponse {
  home: string;
  favorites: FileBrowserEntry[];
  locations: FileBrowserEntry[];
}

export interface SearchSubdirsOptions {
  pageId?: string | null;
  limit?: number;
}

const FilesService = {
  async searchSubdirs(
    path: string,
    options: SearchSubdirsOptions = {},
  ): Promise<SubdirectoryPage> {
    const params: Record<string, string | number> = { path };
    if (options.pageId) params.page_id = options.pageId;
    if (typeof options.limit === "number") params.limit = options.limit;

    const response = await createHttpClient().get<SubdirectoryPage>(
      "/api/file/search_subdirs",
      { params },
    );
    return response.data;
  },

  async getHome(): Promise<HomeResponse> {
    const response =
      await createHttpClient().get<HomeResponse>("/api/file/home");
    return response.data;
  },
};

export default FilesService;
