// @vitest-environment node
import viteConfig from "../vite.config";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  delete process.env.BUILD_LIB;
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

describe("vite dev server security headers", () => {
  it("emits a Content-Security-Policy on the dev server", async () => {
    const config = await viteConfig({ mode: "development", command: "serve" });
    const headers = (config.server ?? {}).headers ?? {};
    const csp = headers["Content-Security-Policy"];

    expect(typeof csp).toBe("string");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  it("emits the standard hardening headers alongside CSP", async () => {
    const config = await viteConfig({ mode: "development", command: "serve" });
    const headers = (config.server ?? {}).headers ?? {};

    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Strict-Transport-Security"]).toContain("max-age=");
  });

  it("relaxes frame-ancestors / X-Frame-Options via VITE_FRAME_ANCESTORS", async () => {
    process.env.VITE_FRAME_ANCESTORS = "'self'";
    try {
      const config = await viteConfig({
        mode: "development",
        command: "serve",
      });
      const headers = (config.server ?? {}).headers ?? {};
      const csp = headers["Content-Security-Policy"] ?? "";

      expect(csp).toContain("frame-ancestors 'self'");
      expect(csp).not.toContain("frame-ancestors 'none'");
      expect(headers["X-Frame-Options"]).toBe("SAMEORIGIN");
    } finally {
      delete process.env.VITE_FRAME_ANCESTORS;
    }
  });

  it("omits X-Frame-Options when frame-ancestors whitelists an origin", async () => {
    process.env.VITE_FRAME_ANCESTORS = "https://portal.example.com";
    try {
      const config = await viteConfig({
        mode: "development",
        command: "serve",
      });
      const headers = (config.server ?? {}).headers ?? {};
      const csp = headers["Content-Security-Policy"] ?? "";

      expect(csp).toContain("frame-ancestors https://portal.example.com");
      expect(headers["X-Frame-Options"]).toBeUndefined();
    } finally {
      delete process.env.VITE_FRAME_ANCESTORS;
    }
  });

  it("widens form-action to include the dev backend origin (hosted scenarios)", async () => {
    const config = await viteConfig({ mode: "development", command: "serve" });
    const headers = (config.server ?? {}).headers ?? {};
    const csp = headers["Content-Security-Policy"] ?? "";

    // form-action should include 'self' AND the dev backend origin so that
    // legitimate cross-origin form submissions (file uploads, OAuth
    // returns) succeed even when the canvas and the agent-server are on
    // different origins.
    expect(csp).toMatch(/form-action[^;]*'self'/);
    expect(csp).toContain("http://127.0.0.1:8000");
  });
});
