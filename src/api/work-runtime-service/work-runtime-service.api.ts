import axios from "axios";
import { getEffectiveLocalBackend } from "../backend-registry/active-store";
import type {
  ValidatePathsResponse,
  WorkManifest,
  WorkRuntimeHealthResponse,
} from "#/types/work-manifest";

export const WORK_RUNTIME_BASE_PATH = "/api/work";

const localWorkRuntimeAxios = axios.create();

localWorkRuntimeAxios.interceptors.request.use((config) => {
  // eslint-disable-next-line no-param-reassign
  if (!config.baseURL) config.baseURL = getEffectiveLocalBackend().host;

  const apiKey = import.meta.env.VITE_WORK_RUNTIME_API_KEY?.trim();
  if (apiKey) {
    config.headers.set("Authorization", `Bearer ${apiKey}`);
  }
  return config;
});

class WorkRuntimeService {
  static async checkHealth(): Promise<WorkRuntimeHealthResponse> {
    try {
      const { data } =
        await localWorkRuntimeAxios.get<WorkRuntimeHealthResponse>(
          `${WORK_RUNTIME_BASE_PATH}/health`,
        );
      return data;
    } catch {
      return { status: "error", message: "Work Runtime unavailable" };
    }
  }

  static async getManifest(): Promise<WorkManifest> {
    const { data } = await localWorkRuntimeAxios.get<WorkManifest>(
      `${WORK_RUNTIME_BASE_PATH}/manifest`,
    );
    return data;
  }

  static async updateManifest(manifest: WorkManifest): Promise<WorkManifest> {
    const { data } = await localWorkRuntimeAxios.put<WorkManifest>(
      `${WORK_RUNTIME_BASE_PATH}/manifest`,
      manifest,
    );
    return data;
  }

  static async validatePaths(paths: string[]): Promise<ValidatePathsResponse> {
    const { data } = await localWorkRuntimeAxios.post<ValidatePathsResponse>(
      `${WORK_RUNTIME_BASE_PATH}/manifest/validate-paths`,
      { paths },
    );
    return data;
  }
}

export default WorkRuntimeService;
