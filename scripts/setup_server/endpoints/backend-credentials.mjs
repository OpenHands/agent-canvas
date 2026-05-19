import { timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const SETUP_BACKENDS_PREFIX = "/setup/backends";
const MAX_BODY_BYTES = 64 * 1024;
const LOCK_STALE_MS = 30_000;
const LOCK_RETRY_MS = 20;
const LOCK_MAX_ATTEMPTS = 50;
const STORE_LOCK_ID = "__store__";
const AUTH_FAILURE_WINDOW_MS = 60_000;
const AUTH_MAX_FAILURES_PER_WINDOW = 10;
const authFailures = new Map();

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function readLinuxProcessStartTime(pid) {
  if (process.platform !== "linux") return null;
  try {
    const stat = await fs.readFile(`/proc/${pid}/stat`, "utf8");
    const endOfCommand = stat.lastIndexOf(")");
    const fields = stat
      .slice(endOfCommand + 2)
      .trim()
      .split(/\s+/);
    return fields[19] || null;
  } catch {
    return null;
  }
}

async function currentProcessLockMetadata() {
  return {
    pid: process.pid,
    process_start_time: await readLinuxProcessStartTime(process.pid),
    created_at: Date.now(),
  };
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function sendError(res, status, error) {
  sendJson(res, status, { error });
}

function readString(value) {
  return typeof value === "string" ? value.trim() || null : null;
}

function normalizeHost(value) {
  const host = readString(value);
  if (!host) return null;

  try {
    const url = new URL(host);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    url.pathname = url.pathname.replace(/\/+$/, "");
    if (url.pathname === "/") url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function validateCredential(value) {
  if (!value || typeof value !== "object") return null;
  const record = value;
  if (record.kind !== undefined && record.kind !== "cloud") return null;

  const id = readString(record.id);
  const name = readString(record.name);
  const host = normalizeHost(record.host);
  const apiKey = readString(record.api_key);

  if (!id || !name || !host || !apiKey) return null;

  return {
    id,
    name,
    host,
    kind: "cloud",
    api_key: apiKey,
  };
}

function getPersistenceRoot() {
  return (
    process.env.OPENHANDS_PERSISTENCE_DIR ||
    path.join(os.homedir(), ".openhands")
  );
}

function getCredentialDir() {
  return path.join(getPersistenceRoot(), "agent-canvas", "backends");
}

function credentialFileName(id) {
  return `${Buffer.from(id, "utf8").toString("base64url")}.json`;
}

function credentialPath(id) {
  return path.join(getCredentialDir(), credentialFileName(id));
}

function lockPath(id) {
  return `${credentialPath(id)}.lock`;
}

function assertSupportedPlatform() {
  if (process.platform === "win32") {
    throw new Error(
      "Cloud credential persistence is not supported on Windows until ACL enforcement is implemented",
    );
  }
}

function assertPrivateMode(stat, expectedMode, label) {
  const actualMode = stat.mode & 0o777;
  if (actualMode !== expectedMode) {
    throw new Error(
      `${label} must have mode ${expectedMode.toString(8)} (got ${actualMode.toString(8)})`,
    );
  }
}

async function ensurePrivateDirectory(dir) {
  assertSupportedPlatform();
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const stat = await fs.lstat(dir);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`Credential path is not a private directory: ${dir}`);
  }
  await fs.chmod(dir, 0o700);
  assertPrivateMode(await fs.lstat(dir), 0o700, "Credential directory");
}

async function fsyncPath(targetPath) {
  const handle = await fs.open(targetPath, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function readCredentialFile(filePath) {
  assertSupportedPlatform();
  const stat = await fs.lstat(filePath);
  if (stat.isSymbolicLink() || !stat.isFile()) return null;
  assertPrivateMode(stat, 0o600, "Credential file");
  const parsed = JSON.parse(await fs.readFile(filePath, "utf8"));
  return validateCredential(parsed);
}

async function readAllCredentials() {
  const dir = getCredentialDir();
  await ensurePrivateDirectory(dir);

  const entries = await fs.readdir(dir, { withFileTypes: true });
  const credentials = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const credential = await readCredentialFile(path.join(dir, entry.name));
    if (credential) credentials.push(credential);
  }
  credentials.sort((a, b) => a.name.localeCompare(b.name));
  return credentials;
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

async function isLockOwnerAlive(metadata) {
  if (!isProcessAlive(metadata.pid)) return false;
  const expectedStartTime =
    typeof metadata.process_start_time === "string"
      ? metadata.process_start_time
      : null;
  if (!expectedStartTime) return false;
  const actualStartTime = await readLinuxProcessStartTime(metadata.pid);
  return actualStartTime !== null && actualStartTime === expectedStartTime;
}

async function readLockMetadata(file) {
  const stat = await fs.lstat(file).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  if (!stat) return null;
  if (stat.isSymbolicLink()) throw new Error("Refusing to follow symlink lock");
  assertPrivateMode(stat, 0o600, "Credential lock file");

  let parsed = null;
  try {
    parsed = JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    parsed = null;
  }
  return parsed && typeof parsed === "object"
    ? {
        pid: Number(parsed.pid),
        process_start_time: readString(parsed.process_start_time),
        mtimeMs: stat.mtimeMs,
      }
    : { pid: null, process_start_time: null, mtimeMs: stat.mtimeMs };
}

async function shouldRemoveExistingLock(file) {
  const metadata = await readLockMetadata(file);
  if (!metadata) return true;
  if (await isLockOwnerAlive(metadata)) return false;
  return (
    Date.now() - metadata.mtimeMs > LOCK_STALE_MS ||
    !isProcessAlive(metadata.pid)
  );
}

async function acquireLock(id) {
  const file = lockPath(id);
  await ensurePrivateDirectory(getCredentialDir());

  for (let attempt = 0; attempt < LOCK_MAX_ATTEMPTS; attempt += 1) {
    try {
      const handle = await fs.open(file, "wx", 0o600);
      try {
        await handle.writeFile(
          JSON.stringify(await currentProcessLockMetadata()),
        );
        await handle.sync();
      } finally {
        await handle.close();
      }
      return async () => {
        await fs.unlink(file).catch(() => undefined);
      };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      if (await shouldRemoveExistingLock(file)) {
        await fs.unlink(file).catch(() => undefined);
        continue;
      }
      if (attempt < LOCK_MAX_ATTEMPTS - 1) {
        await sleep(LOCK_RETRY_MS);
        continue;
      }
      throw new Error("Credential store is busy");
    }
  }

  throw new Error("Credential store is busy");
}

async function withCredentialLock(id, operation) {
  const release = await acquireLock(id);
  try {
    return await operation();
  } finally {
    await release();
  }
}

async function writeCredential(credential) {
  const dir = getCredentialDir();
  await ensurePrivateDirectory(dir);

  return withCredentialLock(STORE_LOCK_ID, async () => {
    const existing = (await readAllCredentials()).find(
      (stored) =>
        stored.host === credential.host &&
        stored.api_key === credential.api_key,
    );
    if (existing) return existing;

    const file = credentialPath(credential.id);
    const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
    let handle;

    try {
      handle = await fs.open(temp, "wx", 0o600);
      await handle.writeFile(
        `${JSON.stringify(credential, null, 2)}
`,
        "utf8",
      );
      await handle.sync();
      await handle.close();
      handle = null;
      await fs.chmod(temp, 0o600);
      await fs.rename(temp, file);
      await fsyncPath(dir);
      return credential;
    } catch (error) {
      if (handle) await handle.close().catch(() => undefined);
      await fs.unlink(temp).catch(() => undefined);
      throw error;
    }
  });
}

async function deleteCredential(id) {
  const dir = getCredentialDir();
  await ensurePrivateDirectory(dir);
  await withCredentialLock(STORE_LOCK_ID, async () => {
    const file = credentialPath(id);
    const stat = await fs.lstat(file).catch((error) => {
      if (error?.code === "ENOENT") return null;
      throw error;
    });
    if (!stat) return;
    if (stat.isSymbolicLink())
      throw new Error("Refusing to delete symlink credential");
    assertPrivateMode(stat, 0o600, "Credential file");
    await fs.unlink(file);
    await fsyncPath(dir);
  });
}

function configuredSessionKeys() {
  const keys = [
    process.env.SESSION_API_KEY,
    process.env.VITE_SESSION_API_KEY,
    process.env.OH_SESSION_API_KEYS_0,
  ];
  for (let i = 1; i < 10; i += 1) {
    keys.push(process.env[`OH_SESSION_API_KEYS_${i}`]);
  }
  return [...new Set(keys.map(readString).filter(Boolean))];
}

function safeEqual(a, b) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
}

function requestSessionKey(req) {
  const header = req.headers["x-session-api-key"];
  if (typeof header === "string" && header.trim()) return header.trim();

  const authorization = req.headers.authorization;
  if (typeof authorization === "string") {
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (match) return match[1].trim();
  }

  return null;
}

function authRateLimitKey(req) {
  return `${req.socket.remoteAddress || "unknown"}:${req.socket.localPort || "unknown"}`;
}

function pruneExpiredAuthFailures(now = Date.now()) {
  for (const [key, entry] of authFailures.entries()) {
    if (now - entry.windowStartedAt > AUTH_FAILURE_WINDOW_MS) {
      authFailures.delete(key);
    }
  }
}

function getAuthFailureEntry(req) {
  const key = authRateLimitKey(req);
  const now = Date.now();
  pruneExpiredAuthFailures(now);
  const entry = authFailures.get(key);
  if (!entry || now - entry.windowStartedAt > AUTH_FAILURE_WINDOW_MS) {
    return { key, count: 0, windowStartedAt: now };
  }
  return { key, ...entry };
}

function isAuthRateLimited(req) {
  return getAuthFailureEntry(req).count >= AUTH_MAX_FAILURES_PER_WINDOW;
}

function recordAuthFailure(req) {
  const entry = getAuthFailureEntry(req);
  authFailures.set(entry.key, {
    count: entry.count + 1,
    windowStartedAt: entry.windowStartedAt,
  });
}

function clearAuthFailures(req) {
  authFailures.delete(authRateLimitKey(req));
}

function isAuthorized(req) {
  const allowed = configuredSessionKeys();
  if (allowed.length === 0) return false;
  const provided = requestSessionKey(req);
  return Boolean(provided && allowed.some((key) => safeEqual(provided, key)));
}

async function readJsonBody(req) {
  const chunks = [];
  let total = 0;

  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      const error = new Error("Request body too large");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) return null;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function credentialIdFromUrl(url) {
  if (url.pathname === SETUP_BACKENDS_PREFIX) {
    return readString(url.searchParams.get("id"));
  }

  const prefix = `${SETUP_BACKENDS_PREFIX}/`;
  if (!url.pathname.startsWith(prefix)) return null;
  try {
    return readString(decodeURIComponent(url.pathname.slice(prefix.length)));
  } catch {
    return null;
  }
}

export async function handleSetupBackendsRequest(req, res) {
  const url = new URL(req.url || "/", "http://localhost");
  if (
    url.pathname !== SETUP_BACKENDS_PREFIX &&
    !url.pathname.startsWith(`${SETUP_BACKENDS_PREFIX}/`)
  ) {
    return false;
  }

  if (isAuthRateLimited(req)) {
    sendError(res, 429, "Too many authentication attempts");
    return true;
  }

  if (!isAuthorized(req)) {
    recordAuthFailure(req);
    sendError(res, 401, "Unauthorized");
    return true;
  }
  clearAuthFailures(req);

  try {
    if (req.method === "GET" && url.pathname === SETUP_BACKENDS_PREFIX) {
      sendJson(res, 200, { backends: await readAllCredentials() });
      return true;
    }

    if (req.method === "POST" && url.pathname === SETUP_BACKENDS_PREFIX) {
      const credential = validateCredential(await readJsonBody(req));
      if (!credential) {
        sendError(res, 400, "Invalid Cloud backend credential");
        return true;
      }
      sendJson(res, 200, { backend: await writeCredential(credential) });
      return true;
    }

    if (req.method === "DELETE") {
      const id = credentialIdFromUrl(url);
      if (!id) {
        sendError(res, 400, "Missing credential id");
        return true;
      }
      await deleteCredential(id);
      sendJson(res, 200, { ok: true });
      return true;
    }

    sendError(res, 405, "Method not allowed");
    return true;
  } catch (error) {
    if (error instanceof SyntaxError) {
      sendError(res, 400, "Malformed JSON body");
      return true;
    }

    const status = Number.isInteger(error?.status) ? error.status : 500;
    sendError(
      res,
      status,
      error instanceof Error ? error.message : String(error),
    );
    return true;
  }
}
