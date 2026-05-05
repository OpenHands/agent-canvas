import { createHttpClient } from "../typescript-client";

export interface SubdirectoryEntry {
  name: string;
  path: string;
}

export interface ListSubdirsResponse {
  path: string;
  subdirs: SubdirectoryEntry[];
}

export interface HomeResponse {
  home: string;
}

const FilesService = {
  async listSubdirs(path: string): Promise<ListSubdirsResponse> {
    const response = await createHttpClient().get<ListSubdirsResponse>(
      "/api/file/list_subdirs",
      { params: { path } },
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
