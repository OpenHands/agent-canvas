/// <reference types="vitest" />
/// <reference types="vite-plugin-svgr/client" />
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import svgr from "vite-plugin-svgr";
import { reactRouter } from "@react-router/dev/vite";
import { configDefaults } from "vitest/config";
import tailwindcss from "@tailwindcss/vite";
import prefixer from "postcss-prefix-selector";
import {
  AGENT_SERVER_UI_SCOPE_SELECTOR,
  transformAgentServerUISelector,
} from "./src/styles/agent-server-ui-style-scope";

const LIB_ENTRY = fileURLToPath(new URL("./src/index.ts", import.meta.url));
const LIB_EXTERNALS = [
  "react",
  "react-dom",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "react-router",
];
const APP_CHUNK_MAX_BYTES = 450 * 1024;

const appBuildConfig = {
  rolldownOptions: {
    output: {
      codeSplitting: {
        groups: [
          {
            name: "vendor",
            test: /node_modules[\\/]/,
            maxSize: APP_CHUNK_MAX_BYTES,
            minSize: 20 * 1024,
            entriesAware: true,
          },
        ],
      },
    },
  },
};

export default defineConfig(({ mode }) => {
  const {
    VITE_BACKEND_HOST = "127.0.0.1:8000",
    VITE_USE_TLS = "false",
    VITE_FRONTEND_PORT = "3001",
    VITE_INSECURE_SKIP_VERIFY = "false",
  } = loadEnv(mode, process.cwd());

  const isLibraryBuild = process.env.BUILD_LIB === "true";
  const USE_TLS = VITE_USE_TLS === "true";
  const INSECURE_SKIP_VERIFY = VITE_INSECURE_SKIP_VERIFY === "true";
  const PROTOCOL = USE_TLS ? "https" : "http";
  const WS_PROTOCOL = USE_TLS ? "wss" : "ws";

  const API_URL = `${PROTOCOL}://${VITE_BACKEND_HOST}/`;
  const WS_URL = `${WS_PROTOCOL}://${VITE_BACKEND_HOST}/`;
  const FE_PORT = Number.parseInt(VITE_FRONTEND_PORT, 10);

  return {
    plugins: [
      {
        name: "suppress-chrome-devtools-well-known",
        apply: "serve",
        configureServer(server) {
          server.middlewares.use(
            "/.well-known/appspecific/com.chrome.devtools.json",
            (_req, res) => {
              res.statusCode = 204;
              res.end();
            },
          );
        },
      },
      !process.env.VITEST && !isLibraryBuild && reactRouter(),
      svgr(),
      tailwindcss(),
    ],
    resolve: {
      tsconfigPaths: true,
    },
    css: {
      postcss: {
        plugins: [
          prefixer({
            prefix: AGENT_SERVER_UI_SCOPE_SELECTOR,
            transform(
              prefix: string,
              selector: string,
              prefixedSelector: string,
            ) {
              return transformAgentServerUISelector(
                prefix,
                selector,
                prefixedSelector,
              );
            },
          }),
        ],
      },
    },
    build: isLibraryBuild
      ? {
          outDir: "dist",
          emptyOutDir: true,
          sourcemap: true,
          lib: {
            entry: LIB_ENTRY,
            formats: ["es"],
          },
          rollupOptions: {
            external: LIB_EXTERNALS,
            output: [
              {
                format: "es",
                preserveModules: true,
                preserveModulesRoot: "src",
                entryFileNames: "[name].js",
                chunkFileNames: "chunks/[name]-[hash].js",
                assetFileNames: "assets/[name]-[hash][extname]",
              },
              {
                format: "cjs",
                preserveModules: true,
                preserveModulesRoot: "src",
                entryFileNames: "[name].cjs",
                chunkFileNames: "chunks/[name]-[hash].cjs",
                assetFileNames: "assets/[name]-[hash][extname]",
                exports: "named",
              },
            ],
          },
        }
      : appBuildConfig,
    copyPublicDir: !isLibraryBuild,
    optimizeDeps: {
      // Disable discovery of new deps at runtime. All deps must be listed in
      // `include`. This prevents Vite from returning 504s while optimizing
      // newly-discovered deps - Safari doesn't retry like Chrome does.
      noDiscovery: true,
      include: [
        // Pre-bundle client entry dependencies so the first page load does not 504
        // with Vite's "Outdated Optimize Dep" before hydration finishes.
        // Safari is particularly sensitive to runtime dep optimization - it gets
        // stuck in 504 errors when Vite triggers "optimized dependencies changed. reloading"
        "react",
        "react/jsx-runtime",
        "react-dom/client",
        "react-router/dom",
        // Pre-bundle ALL dependencies to prevent runtime optimization and page reloads
        // These are discovered during initial app load:
        "posthog-js",
        "posthog-js/react",
        "@tanstack/react-query",
        "react-hot-toast",
        "i18next",
        "i18next-http-backend",
        "i18next-browser-languagedetector",
        "react-i18next",
        "axios",
        "@uidotdev/usehooks",
        "react-icons/fa6",
        "react-icons/fa",
        "clsx",
        "tailwind-merge",
        // CJS dependencies used by react-transition-group. Without pre-bundling,
        // Vite can serve them directly to the browser before route hydration.
        "prop-types",
        "react-is",
        "@heroui/react",
        "lucide-react",
        "@microlink/react-json-view",
        "socket.io-client",
        // These are discovered when launching conversations:
        "react-icons/vsc",
        "react-icons/lu",
        "react-icons/di",
        "react-icons/io5",
        "react-icons/io",
        "@monaco-editor/react",
        "react-textarea-autosize",
        "react-markdown",
        "remark-gfm",
        "remark-breaks",
        "react-syntax-highlighter",
        "react-syntax-highlighter/dist/esm/styles/prism",
        "react-syntax-highlighter/dist/esm/styles/hljs",
        // Terminal dependencies - added to prevent runtime optimization
        "@xterm/addon-fit",
        "@xterm/xterm",
        "@xterm/xterm/css/xterm.css",
        // OpenHands typescript client
        "@openhands/typescript-client",
        "@openhands/typescript-client/client/http-client",
        "@openhands/typescript-client/clients",
        "@openhands/typescript-client/events/remote-events-list",
        "@openhands/typescript-client/workspace/remote-workspace",
        // Additional dependencies discovered at runtime
        "class-variance-authority",
        "downshift",
        "framer-motion",
        "rehype-raw",
        "rehype-sanitize",
        // ``shell-quote`` is a CJS module used by ``src/utils/acp-command.ts``
        // for the Settings → Agent textarea. With ``noDiscovery: true`` above,
        // omitting it from this list means Vite serves the raw CJS file to
        // the browser and dev crashes with ``ReferenceError: exports is not
        // defined`` on the first import of agent-settings.tsx.
        "shell-quote",
        "unist-util-visit",
        "uuid",
        "zustand",
        "zustand/middleware",
        // Syntax highlighter language definitions - Safari fails if these are
        // optimized at runtime. Include all commonly used languages.
        "react-syntax-highlighter/dist/esm/languages/prism/bash",
        "react-syntax-highlighter/dist/esm/languages/prism/batch",
        "react-syntax-highlighter/dist/esm/languages/prism/c",
        "react-syntax-highlighter/dist/esm/languages/prism/clike",
        "react-syntax-highlighter/dist/esm/languages/prism/clojure",
        "react-syntax-highlighter/dist/esm/languages/prism/cpp",
        "react-syntax-highlighter/dist/esm/languages/prism/csharp",
        "react-syntax-highlighter/dist/esm/languages/prism/css",
        "react-syntax-highlighter/dist/esm/languages/prism/dart",
        "react-syntax-highlighter/dist/esm/languages/prism/diff",
        "react-syntax-highlighter/dist/esm/languages/prism/docker",
        "react-syntax-highlighter/dist/esm/languages/prism/elixir",
        "react-syntax-highlighter/dist/esm/languages/prism/erlang",
        "react-syntax-highlighter/dist/esm/languages/prism/fsharp",
        "react-syntax-highlighter/dist/esm/languages/prism/go",
        "react-syntax-highlighter/dist/esm/languages/prism/graphql",
        "react-syntax-highlighter/dist/esm/languages/prism/groovy",
        "react-syntax-highlighter/dist/esm/languages/prism/haskell",
        "react-syntax-highlighter/dist/esm/languages/prism/hcl",
        "react-syntax-highlighter/dist/esm/languages/prism/http",
        "react-syntax-highlighter/dist/esm/languages/prism/ini",
        "react-syntax-highlighter/dist/esm/languages/prism/java",
        "react-syntax-highlighter/dist/esm/languages/prism/javascript",
        "react-syntax-highlighter/dist/esm/languages/prism/json",
        "react-syntax-highlighter/dist/esm/languages/prism/json5",
        "react-syntax-highlighter/dist/esm/languages/prism/jsx",
        "react-syntax-highlighter/dist/esm/languages/prism/julia",
        "react-syntax-highlighter/dist/esm/languages/prism/kotlin",
        "react-syntax-highlighter/dist/esm/languages/prism/less",
        "react-syntax-highlighter/dist/esm/languages/prism/lua",
        "react-syntax-highlighter/dist/esm/languages/prism/makefile",
        "react-syntax-highlighter/dist/esm/languages/prism/markdown",
        "react-syntax-highlighter/dist/esm/languages/prism/markup",
        "react-syntax-highlighter/dist/esm/languages/prism/matlab",
        "react-syntax-highlighter/dist/esm/languages/prism/nginx",
        "react-syntax-highlighter/dist/esm/languages/prism/nix",
        "react-syntax-highlighter/dist/esm/languages/prism/objectivec",
        "react-syntax-highlighter/dist/esm/languages/prism/ocaml",
        "react-syntax-highlighter/dist/esm/languages/prism/perl",
        "react-syntax-highlighter/dist/esm/languages/prism/php",
        "react-syntax-highlighter/dist/esm/languages/prism/powershell",
        "react-syntax-highlighter/dist/esm/languages/prism/properties",
        "react-syntax-highlighter/dist/esm/languages/prism/protobuf",
        "react-syntax-highlighter/dist/esm/languages/prism/python",
        "react-syntax-highlighter/dist/esm/languages/prism/r",
        "react-syntax-highlighter/dist/esm/languages/prism/regex",
        "react-syntax-highlighter/dist/esm/languages/prism/ruby",
        "react-syntax-highlighter/dist/esm/languages/prism/rust",
        "react-syntax-highlighter/dist/esm/languages/prism/sass",
        "react-syntax-highlighter/dist/esm/languages/prism/scala",
        "react-syntax-highlighter/dist/esm/languages/prism/scss",
        "react-syntax-highlighter/dist/esm/languages/prism/shell-session",
        "react-syntax-highlighter/dist/esm/languages/prism/solidity",
        "react-syntax-highlighter/dist/esm/languages/prism/sql",
        "react-syntax-highlighter/dist/esm/languages/prism/swift",
        "react-syntax-highlighter/dist/esm/languages/prism/toml",
        "react-syntax-highlighter/dist/esm/languages/prism/tsx",
        "react-syntax-highlighter/dist/esm/languages/prism/typescript",
        "react-syntax-highlighter/dist/esm/languages/prism/yaml",
      ],
    },
    server: {
      port: FE_PORT,
      strictPort: true, // Fail if port is busy (dynamic allocation handles fallback)
      host: true,
      allowedHosts: true,
      proxy: {
        "/api": {
          target: API_URL,
          changeOrigin: true,
          secure: !INSECURE_SKIP_VERIFY,
        },
        "/server_info": {
          target: API_URL,
          changeOrigin: true,
          secure: !INSECURE_SKIP_VERIFY,
        },
        "/alive": {
          target: API_URL,
          changeOrigin: true,
          secure: !INSECURE_SKIP_VERIFY,
        },
        "/health": {
          target: API_URL,
          changeOrigin: true,
          secure: !INSECURE_SKIP_VERIFY,
        },
        "/ready": {
          target: API_URL,
          changeOrigin: true,
          secure: !INSECURE_SKIP_VERIFY,
        },
        "/docs": {
          target: API_URL,
          changeOrigin: true,
          secure: !INSECURE_SKIP_VERIFY,
        },
        "/redoc": {
          target: API_URL,
          changeOrigin: true,
          secure: !INSECURE_SKIP_VERIFY,
        },
        "/openapi.json": {
          target: API_URL,
          changeOrigin: true,
          secure: !INSECURE_SKIP_VERIFY,
        },
        "/sockets": {
          target: WS_URL,
          ws: true,
          changeOrigin: true,
          secure: !INSECURE_SKIP_VERIFY,
        },
      },
      watch: {
        ignored: ["**/node_modules/**", "**/.git/**"],
      },
    },
    ssr: {
      noExternal: ["react-syntax-highlighter"],
    },
    clearScreen: false,
    test: {
      environment: "jsdom",
      setupFiles: ["vitest.setup.ts"],
      exclude: [...configDefaults.exclude, "tests"],
      coverage: {
        reporter: ["text", "json", "html", "lcov", "text-summary"],
        reportsDirectory: "coverage",
        include: ["src/**/*.{ts,tsx}"],
      },
    },
  };
});
