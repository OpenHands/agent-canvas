import { createFileClient } from "../typescript-client";

export interface SubdirectoryEntry {
  name: string;
  path: string;
}

export interface SubdirectoryPage {
  items: SubdirectoryEntry[];
  next_page_id: string | null;
}

export interface HomeResponse {
  home: string;
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
    return createFileClient().searchSubdirectories(path, options);
  },

  async getHome(): Promise<HomeResponse> {
    return createFileClient().getHome();
  },
};

export default FilesService;
