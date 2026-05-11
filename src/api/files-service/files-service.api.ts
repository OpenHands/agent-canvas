import { createFileClient } from "../typescript-client";

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
    // SDK's `FileClient.searchSubdirectories` returns the same JSON shape
    // (items + next_page_id); the `pageId ?? undefined` filters out the
    // null-vs-undefined mismatch so the SDK doesn't serialize `page_id=null`.
    const page = await createFileClient().searchSubdirectories(path, {
      pageId: options.pageId ?? undefined,
      limit: options.limit,
    });
    return {
      items: page.items,
      next_page_id: page.next_page_id ?? null,
    };
  },

  async getHome(): Promise<HomeResponse> {
    return createFileClient().getHome();
  },
};

export default FilesService;
