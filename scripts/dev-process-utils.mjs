import process from "node:process";

/**
 * Return true while Node still considers the child process active.
 *
 * Do not use ChildProcess#killed for cleanup decisions. In Node, `killed`
 * only means a signal was sent successfully; it does not mean the process has
 * exited. That distinction matters for dev launchers because uvx/npm
 * wrappers can receive SIGTERM while their long-running child process keeps
 * serving on the original port.
 */
export function isProcessRunning(proc) {
  return proc.exitCode === null && proc.signalCode === null;
}

/**
 * Add spawn options needed for process-tree cleanup.
 *
 * On POSIX, `detached: true` makes the spawned service the leader of a new
 * process group. Later we can signal `-pid` to terminate that whole group,
 * including wrapper chains like:
 *
 *   launcher -> uvx -> python agent-server
 *   launcher -> npm -> sh -> Vite
 *
 * Windows does not support POSIX process groups, so callers fall back to
 * signaling the direct child process there.
 */
export function getProcessTreeSpawnOptions(options = {}) {
  return {
    ...options,
    detached: process.platform !== "win32",
  };
}

/**
 * Signal the whole spawned service tree when possible.
 *
 * POSIX `process.kill(-pid, signal)` targets the process group whose id is
 * `pid`; this only works because services are spawned with
 * `getProcessTreeSpawnOptions()`. Without the negative pid, shutdown would
 * often stop only the wrapper process and leave the actual server child
 * listening on its port.
 */
export function signalProcessTree(proc, signal) {
  if (!isProcessRunning(proc)) {
    return false;
  }

  try {
    if (process.platform === "win32" || !proc.pid) {
      proc.kill(signal);
    } else {
      process.kill(-proc.pid, signal);
    }
    return true;
  } catch (err) {
    if (err?.code === "ESRCH") {
      return false;
    }
    throw err;
  }
}

export function createShutdownHookRegistry(onError) {
  const hooks = new Set();

  return {
    add(hook) {
      hooks.add(hook);
      return () => hooks.delete(hook);
    },

    run() {
      for (const hook of hooks) {
        try {
          hook();
        } catch (err) {
          onError?.(err);
        }
      }
    },
  };
}
