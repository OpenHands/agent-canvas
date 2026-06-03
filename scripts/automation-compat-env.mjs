import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const AUTOMATION_COMPAT_PYTHON_DIR = join(
  __dirname,
  "automation-compat-python",
);

export function prependPythonPath(existingPythonPath, extraPath) {
  const delimiter = process.platform === "win32" ? ";" : ":";
  if (!existingPythonPath) {
    return extraPath;
  }
  return `${extraPath}${delimiter}${existingPythonPath}`;
}

export function buildAutomationCompatEnv(baseEnv = {}) {
  return {
    OPENHANDS_AGENT_CANVAS_AUTOMATION_COMPAT: "1",
    PYTHONPATH: prependPythonPath(
      baseEnv.PYTHONPATH,
      AUTOMATION_COMPAT_PYTHON_DIR,
    ),
  };
}

export default buildAutomationCompatEnv;
