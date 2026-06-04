/**
 * electron-builder configuration for the Agent Canvas desktop app.
 *
 * `directories.app: 'electron'` tells electron-builder to use electron/package.json
 * as the app manifest (with `"main": "main.mjs"`). This sidesteps the root
 * package.json's `"main": "./dist/index.cjs"` without any afterPack patching.
 *
 * NODE_MODULES NOTE:
 *
 *   Even with zero `dependencies` in electron/package.json, electron-builder's
 *   "search for node modules" routine walks UP from directories.app looking
 *   for the first node_modules in scope. It runs `npm list --json` in the
 *   project root, gets the full hoisted tree (~342 dirs, ~600 MB: Vite,
 *   React, Monaco, HeroUI, etc.), and copies all of it into the packaged
 *   app at Resources/app/node_modules/.
 *
 *   None of those packages are imported at desktop runtime — main.mjs and
 *   the backend scripts (static-server.mjs, ingress.mjs, dev-with-automation.mjs,
 *   dev-safe.mjs, etc.) use only Node built-ins. We can't disable the search
 *   from the config (it's hardcoded in app-builder-lib), and creating an
 *   empty electron/node_modules/ doesn't help because `npm list` from the
 *   project root still reports the full hoisted tree.
 *
 *   The fix is the `afterPack` hook below: after electron-builder has
 *   finished copying files, we rm -rf the bundled Resources/app/node_modules/
 *   directory. The build wastes a few seconds copying files we immediately
 *   delete, but the final artifact is correctly tiny (~10 MB vs ~600 MB).
 *
 * Packaged app layout (Resources/app/ = electron/ contents):
 *   main.mjs        ← Electron entry point
 *   loading.html    ← loading splash
 *   package.json    ← {"main":"main.mjs"} (from electron/package.json)
 *   scripts/        ← backend scripts, Node.js built-ins only
 *   config/         ← defaults.json
 *   build/          ← static frontend (npm run build:app output)
 *
 * The bundled uv binary (resources/bin/) lands in <Resources>/bin/ via
 * extraResources so Electron can inject it into PATH on startup.
 *
 * The bundled Node.js distribution (resources/node/) lands in
 * <Resources>/node/ via extraResources. Electron prepends its bin dir to
 * PATH at startup so backend scripts (`node scripts/ingress.mjs` etc.) and
 * stdio MCP servers spawned via `npx -y …` (Slack, GitHub, Figma, etc.)
 * can find a working node/npm/npx — the OS gives a Finder-launched .app
 * a minimal PATH (/usr/bin:/bin) that has none of those.
 */

import { rm } from "node:fs/promises";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Strip the auto-bundled node_modules from the packaged app.
 *
 * See the NODE_MODULES NOTE in the file header for the why. This is invoked
 * by electron-builder once per platform target after the unpacked directory
 * has been populated but before installer-format packaging (DMG, NSIS, deb).
 *
 * On macOS the app dir is inside a `.app` bundle; on Linux/Windows it's a
 * flat resources/ subdirectory. We resolve both shapes from
 * `context.appOutDir` + the productFilename.
 */
async function stripBundledNodeModules(context) {
  const platform = context.electronPlatformName;
  const productFilename = context.packager.appInfo.productFilename;
  const appDir =
    platform === "darwin" || platform === "mas"
      ? join(
          context.appOutDir,
          `${productFilename}.app`,
          "Contents",
          "Resources",
          "app",
        )
      : join(context.appOutDir, "resources", "app");

  const nm = join(appDir, "node_modules");
  if (!existsSync(nm)) return;

  // Best-effort size report so the log line shows what we saved. Skip if
  // walking the tree fails for any reason — the rm below is what matters.
  let sizeMb = null;
  try {
    sizeMb = Math.round(getDirSizeBytes(nm) / (1024 * 1024));
  } catch {}

  await rm(nm, { recursive: true, force: true });

  const rel = relative(process.cwd(), nm);
  const human = sizeMb != null ? ` (~${sizeMb} MB)` : "";
  // eslint-disable-next-line no-console -- electron-builder build log
  console.log(
    `[electron-builder] stripped bundled node_modules${human}: ${rel}`,
  );
}

function getDirSizeBytes(dir) {
  // Synchronous walk so we can run it before the rm without async juggling
  // in the hook. The directory we're sizing is always small enough (<1 GB)
  // that this is negligible compared to the rm itself.
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const next = stack.pop();
    let entries;
    try {
      entries = readdirSync(next, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const p = join(next, entry.name);
      if (entry.isDirectory()) {
        stack.push(p);
      } else {
        try {
          total += statSync(p).size;
        } catch {}
      }
    }
  }
  return total;
}

/** @type {import('electron-builder').Configuration} */
const config = {
  appId: "dev.openhands.agent-canvas",
  productName: "Agent Canvas",
  copyright: "Copyright © 2025 All Hands AI",

  // Treat electron/ as the app root. electron/package.json provides the
  // Electron entry point without touching the npm-published root package.json.
  // `buildResources` points at electron/build-resources so electron-builder
  // can auto-discover icon.png (1024×1024 OpenHands raised-hands app icon)
  // and generate the platform-specific icon.icns / icon.ico from it.
  directories: {
    app: "electron",
    output: "dist-electron",
    buildResources: "electron/build-resources",
  },

  // Do not pack into asar — scripts are spawned as child processes by
  // dev-with-automation.mjs and must exist as real files on disk.
  asar: false,

  // Skip native-module rebuild — the app has no native deps.
  npmRebuild: false,

  // Strip auto-bundled node_modules (see NODE_MODULES NOTE at top of file).
  afterPack: stripBundledNodeModules,

  // Files included in the packaged app.
  // Paths with `from` are relative to directories.app (electron/).
  // Bare globs are also relative to directories.app.
  files: [
    // electron/ base files (main.mjs, loading.html, package.json)
    "**/*",
    // Bundle the raw 1024×1024 PNG into Resources/app/build-resources/ so
    // main.mjs can set it as the BrowserWindow icon at runtime (used for the
    // Linux taskbar; macOS reads from the .icns inside the .app bundle).
    "build-resources/icon.png",
    // Scripts from project root — Node.js built-ins only, no node_modules needed.
    { from: "../scripts", to: "scripts", filter: ["**/*.mjs", "**/*.cjs"] },
    // Centralised version / port / path config
    { from: "../config", to: "config" },
    // Pre-built static frontend (npm run build:app output)
    { from: "../build", to: "build" },
    // Custom Python tools (canvas_ui_tool.py). dev-safe.mjs sets
    // OH_EXTRA_PYTHON_PATH to this directory so the agent-server can import
    // canvas_ui_tool at runtime. The path is computed as ../tools relative to
    // scripts/dev-safe.mjs, which resolves correctly in both dev and packaged mode.
    { from: "../tools", to: "tools" },
  ],

  // Bundled prerequisites — placed in <Resources>/ so Electron can put
  // them on PATH before starting the backend stack.
  //   bin/   — uv + uvx (downloaded by `npm run download-uv`)
  //   node/  — official Node.js distribution; provides `node` plus the
  //            bundled `npm` / `npx` that stdio MCP servers (Slack, GitHub,
  //            Figma, etc.) spawn via `npx -y <package>` (downloaded by
  //            `npm run download-node`)
  // `from` is relative to the project root (not directories.app).
  // build:desktop calls both download scripts before invoking electron-builder.
  extraResources: [
    { from: "resources/bin/", to: "bin/", filter: ["**/*"] },
    { from: "resources/node/", to: "node/", filter: ["**/*"] },
  ],

  // ── macOS ──────────────────────────────────────────────────────────────────
  //
  // Default to the native CPU arch so day-to-day `npm run build:desktop`
  // is fast (one Electron binary, one packaging pass).
  //
  // For a distributable universal build set ELECTRON_ARCH=universal:
  //   ELECTRON_ARCH=universal npm run build:desktop
  //
  // Or use the dedicated script:
  //   npm run build:desktop:universal
  //
  mac: {
    category: "public.app-category.developer-tools",
    target: [
      {
        target: "dmg",
        arch: [
          process.env.ELECTRON_ARCH ??
            (process.arch === "arm64" ? "arm64" : "x64"),
        ],
      },
    ],
    // Icon auto-discovered from directories.buildResources/icon.png
    // (electron-builder generates icon.icns from the 1024×1024 PNG).
  },

  dmg: {
    title: "Agent Canvas",
    contents: [
      { x: 130, y: 220 },
      { x: 410, y: 220, type: "link", path: "/Applications" },
    ],
    window: { width: 540, height: 380 },
  },

  // ── Windows ────────────────────────────────────────────────────────────────
  win: {
    target: [{ target: "nsis", arch: ["x64"] }],
    // Icon auto-discovered from directories.buildResources/icon.png
    // (electron-builder generates icon.ico from the 1024×1024 PNG).
  },

  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
  },

  // ── Linux ──────────────────────────────────────────────────────────────────
  linux: {
    target: [
      { target: "AppImage", arch: ["x64"] },
      { target: "deb", arch: ["x64"] },
    ],
    category: "Development",
    // Icon auto-discovered from directories.buildResources/icon.png.
  },
};

export default config;
