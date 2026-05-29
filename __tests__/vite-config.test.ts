// @vitest-environment node
import viteConfig from "../vite.config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const MANAGED_ENV_KEYS = [
  "BUILD_LIB",
  "VITE_BACKEND_BASE_URL",
  "VITE_BACKEND_HOST",
  "VITE_USE_TLS",
  "VITE_FRONTEND_PORT",
  "VITE_INSECURE_SKIP_VERIFY",
] as const;
const originalEnv = new Map(
  MANAGED_ENV_KEYS.map((key) => [key, process.env[key]]),
);

function restoreManagedEnv() {
  for (const key of MANAGED_ENV_KEYS) {
    const originalValue = originalEnv.get(key);

    if (originalValue === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalValue;
    }
  }
}

beforeEach(() => {
  for (const key of MANAGED_ENV_KEYS) {
    delete process.env[key];
  }
});

afterEach(() => {
  restoreManagedEnv();
});

describe("vite optimizeDeps", () => {
  it("prebundles core client entry dependencies", async () => {
    const config = await viteConfig({ mode: "development", command: "serve" });
    const optimizedDeps = config.optimizeDeps?.include ?? [];

    expect(optimizedDeps).toEqual(
      expect.arrayContaining([
        "react",
        "react/jsx-runtime",
        "react-dom/client",
        "react-router/dom",
      ]),
    );
  });
});

describe("vite path resolution", () => {
  it("uses Vite's native tsconfig paths support", async () => {
    const config = await viteConfig({ mode: "development", command: "serve" });

    expect(config.resolve?.tsconfigPaths).toBe(true);
    expect(config.plugins).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "vite-tsconfig-paths" }),
      ]),
    );
  });
});

describe("vite app build", () => {
  it("configures Rolldown code splitting for large vendor chunks", async () => {
    const config = await viteConfig({ mode: "production", command: "build" });
    const appBuild = config as {
      build?: {
        rolldownOptions?: {
          output?: {
            codeSplitting?: {
              groups?: Array<{
                name?: string;
                maxSize?: number;
                entriesAware?: boolean;
              }>;
            };
          };
        };
      };
    };

    expect(appBuild.build?.rolldownOptions?.output?.codeSplitting?.groups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "vendor",
          maxSize: 450 * 1024,
          entriesAware: true,
        }),
      ]),
    );
  });
});

describe("vite backend defaults", () => {
  it("does not synthesize backend config or proxy routes for the frontend-only dev server", async () => {
    const config = await viteConfig({ mode: "development", command: "serve" });

    expect(process.env.VITE_BACKEND_BASE_URL).toBeUndefined();
    expect(config.server?.proxy).toBeUndefined();
  });

  it("uses VITE_BACKEND_HOST for the dev proxy target", async () => {
    process.env.VITE_BACKEND_HOST = "127.0.0.1:19000";

    const config = await viteConfig({ mode: "development", command: "serve" });
    const proxy = config.server?.proxy as Record<string, { target?: string }>;

    expect(proxy["/api"]?.target).toBe("http://127.0.0.1:19000/");
    expect(process.env.VITE_BACKEND_BASE_URL).toBeUndefined();
  });

  it("does not inject a backend base URL for production builds", async () => {
    await viteConfig({ mode: "production", command: "build" });

    expect(process.env.VITE_BACKEND_BASE_URL).toBeUndefined();
  });
});

describe("vite library build", () => {
  it("configures a dual-format preserved-module library build", async () => {
    process.env.BUILD_LIB = "true";

    const config = await viteConfig({ mode: "production", command: "build" });

    expect((config as { copyPublicDir?: boolean }).copyPublicDir).toBe(false);
    expect(config.build?.lib).toMatchObject({
      formats: ["es"],
    });
    expect(config.build?.rollupOptions?.external).toEqual(
      expect.arrayContaining(["react", "react-dom", "react-router"]),
    );
    expect(config.build?.rollupOptions?.output).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          format: "es",
          preserveModules: true,
          preserveModulesRoot: "src",
        }),
        expect.objectContaining({
          format: "cjs",
          preserveModules: true,
          preserveModulesRoot: "src",
          exports: "named",
        }),
      ]),
    );
  });
});
