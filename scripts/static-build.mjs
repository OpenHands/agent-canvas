import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import {
  c,
  logError,
  logService,
  logStep,
  logSuccess,
} from "./dev-with-automation.mjs";
import { buildNpmScriptCommand } from "./dev-safe.mjs";

export function buildFrontend(config, args = {}) {
  const buildDir = join(config.canvasPath, "build");

  if (args.skipBuild) {
    if (!existsSync(buildDir)) {
      logError(
        "--skip-build was passed but build/ does not exist. Run without --skip-build first.",
      );
      process.exit(1);
    }
    logStep("build", "Skipping frontend build (--skip-build)");
    logService("build", `Reusing existing build/ at ${buildDir}`, c.dim);
    return;
  }

  logStep("build", "Building frontend (npm run build:app)...");
  logService(
    "build",
    "This typically takes 30-60s; cached as build/ for --skip-build reuse",
    c.dim,
  );

  const cmd = buildNpmScriptCommand("build:app");
  const result = spawnSync(cmd.command, cmd.args, {
    cwd: config.canvasPath,
    stdio: "inherit",
    env: {
      ...process.env,
      // Bake the same default workspace path that the dynamic launcher passes
      // to Vite. Docker uses an in-container path; dockerless uses host state.
      VITE_WORKING_DIR:
        config.viteWorkingDir ?? join(config.stateDir, "workspaces"),
      // Bake the automation backend API key so the static frontend can talk
      // to /api/automation through the ingress.
      VITE_AUTOMATION_API_KEY: config.localApiKey,
      // Bake the same session key the agent-server accepts. Without this,
      // a fresh browser session seeds the Local backend with an empty key and
      // all authenticated agent-server calls fail with 401.
      VITE_SESSION_API_KEY: config.sessionApiKey,
      // Intentionally do NOT set VITE_BACKEND_BASE_URL: leaving it unset makes
      // the runtime fall back to window.location.origin, which keeps the build
      // portable across localhost, LAN hosts, and tunnels such as ngrok.
    },
  });

  if (result.status !== 0) {
    logError(`Build failed with exit code ${result.status ?? "null"}`);
    process.exit(result.status ?? 1);
  }

  if (!existsSync(join(buildDir, "index.html"))) {
    logError(
      `Build completed but ${join(buildDir, "index.html")} is missing. ` +
        "Did react-router build write somewhere unexpected?",
    );
    process.exit(1);
  }

  logSuccess("Build complete");
}
