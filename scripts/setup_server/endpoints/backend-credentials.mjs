import {
  chmodSync,
  closeSync,
  existsSync,
  fchmodSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { execFileSync } from "node:child_process";
import { isIP } from "node:net";
import { homedir } from "node:os";
import path from "node:path";

export const SETUP_BACKENDS_ENDPOINT = "/setup/backends";

const OPENHANDS_PERSISTENCE_DIR_ENV = "OPENHANDS_PERSISTENCE_DIR";
const SETUP_SERVER_AUTH_RATE_LIMIT_GLOBAL_MAX_FAILURES_ENV =
  "SETUP_SERVER_AUTH_RATE_LIMIT_GLOBAL_MAX_FAILURES";
const SETUP_SERVER_REQUEST_RATE_LIMIT_GLOBAL_MAX_REQUESTS_ENV =
  "SETUP_SERVER_REQUEST_RATE_LIMIT_GLOBAL_MAX_REQUESTS";
// Only enable this behind a trusted reverse proxy that overwrites
// X-Forwarded-For. The proxy must replace the header entirely, e.g.
// nginx `proxy_set_header X-Forwarded-For $remote_addr;`. Do not use
// append mode such as `$proxy_add_x_forwarded_for`, which preserves
// attacker-supplied entries and can bypass rate limiting.
const SETUP_SERVER_TRUST_PROXY_ENV = "SETUP_SERVER_TRUST_PROXY";
const SETUP_SERVER_TRUSTED_PROXY_IPS_ENV = "SETUP_SERVER_TRUSTED_PROXY_IPS";
const AGENT_CANVAS_BACKENDS_DIR = path.join("agent-canvas", "backends");
const MAX_REQUEST_BODY_BYTES = 64 * 1024;
const CREDENTIAL_TEMP_FILE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SENSITIVE_PERSISTENCE_ROOTS =
  process.platform === "win32"
    ? [
        "C:\\Windows",
        "C:\\Windows\\System32",
        "C:\\Program Files",
        "C:\\Program Files (x86)",
        "C:\\ProgramData",
        "C:\\Users\\Public",
      ]
    : ["/etc", "/root", "/sys", "/proc", "/dev", "/boot"];
const AUTH_RATE_LIMIT_MAX_CLIENTS = 1024;
const AUTH_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const AUTH_RATE_LIMIT_MAX_FAILURES = 10;
const DEFAULT_AUTH_RATE_LIMIT_GLOBAL_MAX_FAILURES =
  AUTH_RATE_LIMIT_MAX_FAILURES * AUTH_RATE_LIMIT_MAX_CLIENTS;
const REQUEST_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const REQUEST_RATE_LIMIT_MAX_REQUESTS = 120;
const DEFAULT_REQUEST_RATE_LIMIT_GLOBAL_MAX_REQUESTS =
  REQUEST_RATE_LIMIT_MAX_REQUESTS * AUTH_RATE_LIMIT_MAX_CLIENTS;
const WINDOWS_CREDENTIAL_WRITE_UNSUPPORTED =
  "Backend credential persistence is not supported on Windows because secure NTFS ACL enforcement is not implemented";
let warnedUnauthenticatedSetupBackends = false;
const authFailuresByClient = new Map();
const requestsByClient = new Map();
const globalAuthFailures = [];
const globalRequests = [];

function makeHttpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function getPositiveIntegerEnv(name, fallback) {
  const rawValue = process.env[name]?.trim();
  if (!rawValue) return fallback;
  const value = Number.parseInt(rawValue, 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function getAuthRateLimitGlobalMaxFailures() {
  return getPositiveIntegerEnv(
    SETUP_SERVER_AUTH_RATE_LIMIT_GLOBAL_MAX_FAILURES_ENV,
    DEFAULT_AUTH_RATE_LIMIT_GLOBAL_MAX_FAILURES,
  );
}

function getRequestRateLimitGlobalMaxRequests() {
  return getPositiveIntegerEnv(
    SETUP_SERVER_REQUEST_RATE_LIMIT_GLOBAL_MAX_REQUESTS_ENV,
    DEFAULT_REQUEST_RATE_LIMIT_GLOBAL_MAX_REQUESTS,
  );
}

function expandHomeDir(value) {
  if (value === "~") return homedir();
  if (value.startsWith("~/")) return path.join(homedir(), value.slice(2));
  return value;
}

function validatePersistenceDir(value) {
  const resolved = path.resolve(expandHomeDir(value));
  const normalizeForPlatform = (targetPath) => {
    const normalized = path.normalize(targetPath);
    return process.platform === "win32" || process.platform === "darwin"
      ? normalized.toLowerCase()
      : normalized;
  };

  const normalizedResolved = normalizeForPlatform(
    canonicalizeExistingPath(resolved),
  );
  const forbidden = SENSITIVE_PERSISTENCE_ROOTS.find((root) => {
    const normalizedRoot = normalizeForPlatform(canonicalizeExistingPath(root));
    return (
      normalizedResolved === normalizedRoot ||
      normalizedResolved.startsWith(`${normalizedRoot}${path.sep}`)
    );
  });
  if (forbidden) {
    throw new Error(
      `${OPENHANDS_PERSISTENCE_DIR_ENV} cannot point to sensitive system path ${forbidden}`,
    );
  }
  return resolved;
}

function canonicalizeExistingPath(targetPath) {
  let existingPath = targetPath;
  const missingSegments = [];

  while (!existsSync(existingPath)) {
    const parent = path.dirname(existingPath);
    if (parent === existingPath) break;
    missingSegments.unshift(path.basename(existingPath));
    existingPath = parent;
  }

  try {
    return path.join(realpathSync(existingPath), ...missingSegments);
  } catch {
    return targetPath;
  }
}

function getOpenHandsPersistenceDir() {
  const configured = process.env[OPENHANDS_PERSISTENCE_DIR_ENV]?.trim();
  return validatePersistenceDir(
    configured || path.join(homedir(), ".openhands"),
  );
}

export function getAgentCanvasBackendsDir() {
  return path.join(getOpenHandsPersistenceDir(), AGENT_CANVAS_BACKENDS_DIR);
}

function normalizeString(value, fieldName) {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} is required`);
  }
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${fieldName} is required`);
  return trimmed;
}

function normalizeApiKey(value) {
  return normalizeString(value, "api_key");
}

function normalizeBackendId(value) {
  const id = normalizeString(value, "id");
  if (id === "." || id === ".." || id.includes("/") || id.includes("\\")) {
    throw new Error("id must not contain path separators");
  }
  if (id.includes("..")) {
    throw new Error("id must not contain path traversal segments");
  }
  return id;
}

function normalizeHost(value) {
  const host = normalizeString(value, "host").replace(/\/+$/, "");
  let url;
  try {
    url = new URL(host);
  } catch {
    throw new Error("host must be a valid URL");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("host must use http or https");
  }
  if (url.username || url.password) {
    throw new Error("host must not include credentials");
  }

  return host;
}

function normalizeKind(value) {
  const kind = normalizeString(value, "kind");
  if (kind !== "cloud") {
    throw new Error("Only cloud backend credentials can be persisted");
  }
  return kind;
}

function backendFileName(id) {
  return `${encodeURIComponent(id)}.json`;
}

export function getAgentCanvasBackendFilePath(id) {
  return path.join(
    getAgentCanvasBackendsDir(),
    backendFileName(normalizeBackendId(id)),
  );
}

function readBackendCredentialFromPayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Backend credential payload is required");
  }

  return {
    id: normalizeBackendId(value.id),
    name: normalizeString(value.name, "name"),
    host: normalizeHost(value.host),
    kind: normalizeKind(value.kind),
    api_key: normalizeApiKey(value.api_key),
  };
}

function readBackendCredentialFile(filePath) {
  try {
    const stats = lstatSync(filePath);
    if (!stats.isFile()) {
      throw new Error(`Credential path is not a regular file: ${filePath}`);
    }
    if ((stats.mode & 0o777) !== 0o600) {
      throw new Error(`Insecure credential file permissions: ${filePath}`);
    }
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    return readBackendCredentialFromPayload(parsed);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.error(
        `Failed to read backend credential from ${filePath}`,
        error,
      );
    }
    return null;
  }
}

export function readAgentCanvasBackendCredentials() {
  try {
    const dir = getAgentCanvasBackendsDir();
    assertPrivateDirectoryPath(dir);
    cleanupStaleCredentialLockFiles(dir);
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => readBackendCredentialFile(path.join(dir, entry.name)))
      .filter(Boolean);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.error("Failed to read Agent Canvas backend credentials", error);
    }
    return [];
  }
}

function ensureAgentCanvasBackendsDir() {
  const dir = getAgentCanvasBackendsDir();
  ensurePrivateDirectoryTree(dir);
  cleanupStaleCredentialTempFiles(dir);
  return dir;
}

function getDirectoryCreationRoot(targetDir) {
  let currentDir = path.resolve(targetDir);
  while (!existsSync(currentDir)) {
    const parent = path.dirname(currentDir);
    if (parent === currentDir) break;
    currentDir = parent;
  }
  return currentDir;
}

function ensurePrivateDirectoryTree(targetDir) {
  const resolvedTarget = path.resolve(targetDir);
  const privateRoot = path.resolve(getOpenHandsPersistenceDir());
  const root = getDirectoryCreationRoot(resolvedTarget);
  const relativeSegments = path
    .relative(root, resolvedTarget)
    .split(path.sep)
    .filter(Boolean);
  let currentDir = root;

  if (isWithinPrivateDirectoryRoot(currentDir, privateRoot)) {
    assertPrivateDirectory(currentDir);
  }

  if (relativeSegments.length === 0) {
    return;
  }

  for (const segment of relativeSegments) {
    currentDir = path.join(currentDir, segment);
    let created = false;
    try {
      mkdirSync(currentDir, { mode: 0o700 });
      created = true;
    } catch (error) {
      if (error?.code !== "EEXIST") {
        throw new Error("Failed to create secure backend directory", {
          cause: error,
        });
      }
    }
    if (!created) {
      assertPrivateDirectory(currentDir);
      continue;
    }
    try {
      chmodSync(currentDir, 0o700);
    } catch (error) {
      throw new Error("Failed to set secure directory permissions", {
        cause: error,
      });
    }
  }
}

function isWithinPrivateDirectoryRoot(dir, privateRoot) {
  const resolvedDir = path.resolve(dir);
  return (
    resolvedDir === privateRoot ||
    resolvedDir.startsWith(`${privateRoot}${path.sep}`)
  );
}

function assertPrivateDirectoryPath(targetDir) {
  const privateRoot = path.resolve(getOpenHandsPersistenceDir());
  const resolvedTarget = path.resolve(targetDir);
  if (!isWithinPrivateDirectoryRoot(resolvedTarget, privateRoot)) {
    throw new Error(`Directory path is outside private root: ${targetDir}`);
  }

  const relativeSegments = path
    .relative(privateRoot, resolvedTarget)
    .split(path.sep)
    .filter(Boolean);
  let currentDir = privateRoot;
  assertPrivateDirectory(currentDir);
  for (const segment of relativeSegments) {
    currentDir = path.join(currentDir, segment);
    assertPrivateDirectory(currentDir);
  }
}

function assertPrivateDirectory(dir) {
  const stats = lstatSync(dir);
  if (!stats.isDirectory()) {
    throw new Error(`Directory path is not a directory: ${dir}`);
  }
  if ((stats.mode & 0o777) !== 0o700) {
    throw new Error(`Directory exists with insecure permissions: ${dir}`);
  }
}

function assertCredentialWritesSupported() {
  if (process.platform === "win32") {
    throw new Error(WINDOWS_CREDENTIAL_WRITE_UNSUPPORTED);
  }
}

function isCredentialTempFileName(fileName) {
  return /\.[a-f0-9]{16}\.tmp$/i.test(fileName);
}

function cleanupStaleCredentialTempFiles(dir, now = Date.now()) {
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (
        (!entry.isFile() && !entry.isSymbolicLink()) ||
        !isCredentialTempFileName(entry.name)
      ) {
        continue;
      }
      const filePath = path.join(dir, entry.name);
      const stats = lstatSync(filePath);
      if (now - stats.mtimeMs >= CREDENTIAL_TEMP_FILE_MAX_AGE_MS) {
        removeCredentialFile(filePath);
      }
    }
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.warn(
        "Failed to clean stale backend credential temp files",
        error,
      );
    }
  }
}

function cleanupStaleCredentialLockFiles(dir) {
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (
        (!entry.isFile() && !entry.isSymbolicLink()) ||
        !entry.name.endsWith(".lock")
      ) {
        continue;
      }
      removeStaleCredentialLockFile(path.join(dir, entry.name));
    }
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.warn(
        "Failed to clean stale backend credential lock files",
        error,
      );
    }
  }
}

function withCredentialFileLock(filePath, callback) {
  const lockPath = `${filePath}.lock`;
  let lockFd;
  try {
    lockFd = acquireCredentialLock(lockPath);
    try {
      writeFileSync(lockFd, `${JSON.stringify(getCurrentLockInfo())}\n`);
      fsyncSync(lockFd);
    } catch (error) {
      try {
        closeSync(lockFd);
      } catch (closeError) {
        console.warn(
          `Failed to close backend credential lock ${lockPath}`,
          closeError,
        );
      }
      lockFd = undefined;
      removeCredentialFile(lockPath);
      throw error;
    }
  } catch (error) {
    throw error;
  }

  try {
    return callback();
  } finally {
    if (lockFd !== undefined) {
      try {
        closeSync(lockFd);
      } catch (error) {
        console.warn(
          `Failed to close backend credential lock ${lockPath}`,
          error,
        );
      }
    }
    removeCredentialFile(lockPath);
  }
}

function acquireCredentialLock(lockPath, didRetry = false) {
  try {
    return openSync(lockPath, "wx", 0o600);
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    if (!didRetry && removeStaleCredentialLockFile(lockPath)) {
      return acquireCredentialLock(lockPath, true);
    }
    throw makeHttpError("Backend credential is locked", 409);
  }
}

function removeCredentialFile(filePath) {
  try {
    rmSync(filePath, { force: true });
  } catch (error) {
    console.warn(`Failed to remove backend credential file ${filePath}`, error);
  }
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function getProcessStartToken(pid) {
  if (process.platform === "linux") {
    try {
      const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
      const fieldsStart = stat.lastIndexOf(") ");
      if (fieldsStart === -1) return null;
      const fields = stat
        .slice(fieldsStart + 2)
        .trim()
        .split(/\s+/);
      return fields[19] ? `linux:${fields[19]}` : null;
    } catch {
      return null;
    }
  }

  if (process.platform === "darwin") {
    try {
      // `lstart` only has second-level precision on macOS. Include
      // elapsed time, parent PID, and executable path so a reused PID
      // has to collide on more than wall-clock second alone.
      const processIdentity = execFileSync(
        "ps",
        [
          "-p",
          String(pid),
          "-o",
          "lstart=",
          "-o",
          "etime=",
          "-o",
          "ppid=",
          "-o",
          "comm=",
        ],
        {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
          timeout: 1000,
        },
      )
        .trim()
        .replace(/\s+/g, " ");
      return processIdentity ? `darwin:${processIdentity}` : null;
    } catch {
      return null;
    }
  }

  if (process.platform === "win32") {
    try {
      const startTime = execFileSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-Command",
          `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToString('o')`,
        ],
        {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
          timeout: 1000,
          windowsHide: true,
        },
      ).trim();
      return startTime ? `win32:${startTime}` : null;
    } catch {
      return null;
    }
  }

  return null;
}

function getCurrentLockInfo() {
  const processStartToken = getProcessStartToken(process.pid);
  if (!processStartToken) {
    throw new Error(
      "Backend credential locking requires process start token support on this platform",
    );
  }

  return {
    pid: process.pid,
    process_start: processStartToken,
  };
}

function readCredentialLockInfo(lockPath) {
  const rawLock = readFileSync(lockPath, "utf8").trim();
  if (!rawLock) return null;
  const readLegacyPid = () => {
    const pid = Number.parseInt(rawLock, 10);
    return Number.isInteger(pid) && pid > 0
      ? { pid, processStartToken: null }
      : null;
  };

  try {
    const parsed = JSON.parse(rawLock);
    if (typeof parsed === "number") return readLegacyPid();
    const pid = Number(parsed?.pid);
    if (!Number.isInteger(pid) || pid <= 0) return readLegacyPid();
    return {
      pid,
      processStartToken:
        typeof parsed.process_start === "string" ? parsed.process_start : null,
    };
  } catch {
    return readLegacyPid();
  }
}

function isLockOwnerRunning(lockInfo) {
  if (!isProcessRunning(lockInfo.pid)) return false;
  if (!lockInfo.processStartToken) return true;

  const currentStartToken = getProcessStartToken(lockInfo.pid);
  return (
    currentStartToken !== null &&
    currentStartToken === lockInfo.processStartToken
  );
}

function removeStaleCredentialLockFile(lockPath) {
  try {
    const stats = lstatSync(lockPath);
    if (stats.isSymbolicLink()) {
      removeCredentialFile(lockPath);
      return true;
    }
    if (!stats.isFile()) return false;
    const lockInfo = readCredentialLockInfo(lockPath);
    if (!lockInfo || isLockOwnerRunning(lockInfo)) return false;
    removeCredentialFile(lockPath);
    return true;
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.warn(
        `Failed to inspect backend credential lock ${lockPath}`,
        error,
      );
    }
    return false;
  }
}

export function writeAgentCanvasBackendCredential(payload) {
  assertCredentialWritesSupported();
  const credential = readBackendCredentialFromPayload(payload);
  ensureAgentCanvasBackendsDir();

  const filePath = getAgentCanvasBackendFilePath(credential.id);
  return withCredentialFileLock(filePath, () => {
    const tmpPath = `${filePath}.${randomBytes(8).toString("hex")}.tmp`;
    let tmpFd;
    try {
      tmpFd = openSync(tmpPath, "wx", 0o600);
      writeFileSync(
        tmpFd,
        `${JSON.stringify(
          {
            ...credential,
            updated_at: new Date().toISOString(),
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      try {
        fchmodSync(tmpFd, 0o600);
      } catch (error) {
        throw new Error("Failed to set secure file permissions", {
          cause: error,
        });
      }
      fsyncSync(tmpFd);
      closeSync(tmpFd);
      tmpFd = undefined;
      renameSync(tmpPath, filePath);
      fsyncDirectory(path.dirname(filePath));
      return credential;
    } catch (error) {
      if (tmpFd !== undefined) {
        try {
          closeSync(tmpFd);
        } catch (closeError) {
          console.warn(
            `Failed to close backend credential temp file ${tmpPath}`,
            closeError,
          );
        }
      }
      removeCredentialFile(tmpPath);
      throw error;
    }
  });
}

function fsyncDirectory(dir) {
  let dirFd;
  try {
    dirFd = openSync(dir, "r");
    fsyncSync(dirFd);
  } catch (error) {
    console.warn(`Failed to fsync backend credential directory ${dir}`, error);
  } finally {
    if (dirFd !== undefined) {
      try {
        closeSync(dirFd);
      } catch (error) {
        console.warn(
          `Failed to close backend credential directory ${dir}`,
          error,
        );
      }
    }
  }
}

export function deleteAgentCanvasBackendCredential(id) {
  const filePath = getAgentCanvasBackendFilePath(id);
  ensureAgentCanvasBackendsDir();
  withCredentialFileLock(filePath, () => {
    rmSync(filePath, { force: true });
  });
}

function normalizeIpAddress(value) {
  const address = value?.trim();
  if (!address) return null;
  if (address.startsWith("::ffff:")) return address.slice("::ffff:".length);
  return address;
}

function getTrustedProxyAddresses() {
  const addresses = [];
  const invalidAddresses = [];
  for (const value of (
    process.env[SETUP_SERVER_TRUSTED_PROXY_IPS_ENV] || ""
  ).split(",")) {
    const address = normalizeIpAddress(value);
    if (!address) continue;
    if (isIP(address)) {
      addresses.push(address);
    } else {
      invalidAddresses.push(value.trim());
    }
  }
  if (invalidAddresses.length > 0) {
    console.warn(
      `Ignoring invalid ${SETUP_SERVER_TRUSTED_PROXY_IPS_ENV} entries: ${invalidAddresses.join(", ")}`,
    );
  }
  return new Set(addresses);
}

function shouldTrustForwardedFor(req) {
  if (process.env[SETUP_SERVER_TRUST_PROXY_ENV] !== "true") return false;
  const remoteAddress = normalizeIpAddress(req.socket?.remoteAddress);
  return (
    remoteAddress !== null && getTrustedProxyAddresses().has(remoteAddress)
  );
}

function getAuthRateLimitClientKey(req) {
  const remoteAddress = normalizeIpAddress(req.socket?.remoteAddress);
  if (shouldTrustForwardedFor(req)) {
    const forwardedFor = getHeader(req, "x-forwarded-for")
      ?.split(",")
      ?.pop()
      ?.trim();
    if (forwardedFor && isIP(forwardedFor)) return `xff:${forwardedFor}`;
  }
  return remoteAddress ? `remote:${remoteAddress}` : "unknown";
}

function pruneExpiredAuthFailures(now = Date.now()) {
  for (const [key, timestamps] of authFailuresByClient) {
    const recentFailures = timestamps.filter(
      (timestamp) => now - timestamp < AUTH_RATE_LIMIT_WINDOW_MS,
    );

    if (recentFailures.length > 0) {
      authFailuresByClient.set(key, recentFailures);
    } else {
      authFailuresByClient.delete(key);
    }
  }
}

function enforceAuthFailureMapLimit() {
  while (authFailuresByClient.size > AUTH_RATE_LIMIT_MAX_CLIENTS) {
    const oldestKey = getOldestRateLimitClientKey(
      authFailuresByClient,
      getRateLimitClientLastSeenAt,
    );
    if (oldestKey === undefined) return;
    authFailuresByClient.delete(oldestKey);
  }
}

function getOldestRateLimitClientKey(records, getLastSeenAt) {
  let oldestKey;
  let oldestSeenAt = Infinity;
  for (const [key, value] of records) {
    const seenAt = getLastSeenAt(value);
    if (seenAt < oldestSeenAt) {
      oldestSeenAt = seenAt;
      oldestKey = key;
    }
  }
  return oldestKey;
}

function getRateLimitClientLastSeenAt(timestamps) {
  return timestamps.length > 0 ? timestamps[timestamps.length - 1] : 0;
}

function pruneTimestampList(timestamps, windowMs, now = Date.now()) {
  let nextLength = 0;
  for (const timestamp of timestamps) {
    if (now - timestamp < windowMs) {
      timestamps[nextLength] = timestamp;
      nextLength += 1;
    }
  }
  timestamps.length = nextLength;
  return timestamps;
}

function getRecentAuthFailures(req, now = Date.now()) {
  const key = getAuthRateLimitClientKey(req);
  pruneExpiredAuthFailures(now);
  const recentFailures = (authFailuresByClient.get(key) || []).filter(
    (timestamp) => now - timestamp < AUTH_RATE_LIMIT_WINDOW_MS,
  );

  if (recentFailures.length > 0) {
    authFailuresByClient.set(key, recentFailures);
  } else {
    authFailuresByClient.delete(key);
  }

  return recentFailures;
}

function recordFailedAuth(req) {
  const now = Date.now();
  const key = getAuthRateLimitClientKey(req);
  const recentFailures = getRecentAuthFailures(req, now);
  recentFailures.push(now);
  authFailuresByClient.set(key, recentFailures);
  enforceAuthFailureMapLimit();
  const recentGlobalFailures = pruneTimestampList(
    globalAuthFailures,
    AUTH_RATE_LIMIT_WINDOW_MS,
    now,
  );
  recentGlobalFailures.push(now);
  return {
    clientCount: recentFailures.length,
    globalCount: recentGlobalFailures.length,
  };
}

function clearFailedAuth(req) {
  authFailuresByClient.delete(getAuthRateLimitClientKey(req));
}

function pruneExpiredRequests(now = Date.now()) {
  for (const [key, timestamps] of requestsByClient) {
    const recentRequests = timestamps.filter(
      (timestamp) => now - timestamp < REQUEST_RATE_LIMIT_WINDOW_MS,
    );

    if (recentRequests.length > 0) {
      requestsByClient.set(key, recentRequests);
    } else {
      requestsByClient.delete(key);
    }
  }
}

function getRecentRequests(req, now = Date.now()) {
  const key = getAuthRateLimitClientKey(req);
  pruneExpiredRequests(now);
  const recentRequests = (requestsByClient.get(key) || []).filter(
    (timestamp) => now - timestamp < REQUEST_RATE_LIMIT_WINDOW_MS,
  );

  if (recentRequests.length > 0) {
    requestsByClient.set(key, recentRequests);
  } else {
    requestsByClient.delete(key);
  }

  return recentRequests;
}

function recordRequest(req) {
  const now = Date.now();
  const key = getAuthRateLimitClientKey(req);
  const recentRequests = getRecentRequests(req, now);
  recentRequests.push(now);
  requestsByClient.set(key, recentRequests);
  while (requestsByClient.size > AUTH_RATE_LIMIT_MAX_CLIENTS) {
    const oldestKey = getOldestRateLimitClientKey(
      requestsByClient,
      getRateLimitClientLastSeenAt,
    );
    if (oldestKey === undefined) break;
    requestsByClient.delete(oldestKey);
  }
  const recentGlobalRequests = pruneTimestampList(
    globalRequests,
    REQUEST_RATE_LIMIT_WINDOW_MS,
    now,
  );
  recentGlobalRequests.push(now);
  return {
    clientCount: recentRequests.length,
    globalCount: recentGlobalRequests.length,
  };
}

export function __resetSetupBackendsAuthRateLimitForTests() {
  authFailuresByClient.clear();
  requestsByClient.clear();
  globalAuthFailures.length = 0;
  globalRequests.length = 0;
}

export function __getSetupBackendsAuthRateLimitSizeForTests() {
  return authFailuresByClient.size;
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}

function getHeader(req, name) {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function getExpectedApiKey() {
  return (
    process.env.VITE_SESSION_API_KEY ||
    process.env.SESSION_API_KEY ||
    process.env.OH_SESSION_API_KEYS_0 ||
    ""
  ).trim();
}

function timingSafeStringEqual(actual, expected) {
  const actualHash = createHash("sha256").update(actual).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(actualHash, expectedHash);
}

function isAuthorized(req) {
  const expected = getExpectedApiKey();
  if (!expected) {
    if (!warnedUnauthenticatedSetupBackends) {
      console.warn(
        "Setup backend credential endpoint is running without session API key protection; use only for local development.",
      );
      warnedUnauthenticatedSetupBackends = true;
    }
    return true;
  }

  const sessionHeader = getHeader(req, "x-session-api-key")?.trim();
  if (sessionHeader && timingSafeStringEqual(sessionHeader, expected)) {
    return true;
  }

  const authorization = getHeader(req, "authorization")?.trim();
  const bearerPrefix = "Bearer ";
  if (!authorization?.startsWith(bearerPrefix)) return false;
  return timingSafeStringEqual(
    authorization.slice(bearerPrefix.length),
    expected,
  );
}

async function readJsonBody(req, maxSize = MAX_REQUEST_BODY_BYTES) {
  const chunks = [];
  let totalSize = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalSize += buffer.length;
    if (totalSize > maxSize) {
      const error = new Error("Request body too large");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function isSetupBackendsRequest(url) {
  try {
    return (
      new URL(url, "http://localhost").pathname === SETUP_BACKENDS_ENDPOINT
    );
  } catch {
    return false;
  }
}

export async function handleSetupBackendsRequest(req, res) {
  if (!isSetupBackendsRequest(req.url || "")) return false;

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Methods": "DELETE,GET,POST,OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type,Authorization,X-Session-API-Key",
      "Cache-Control": "no-store",
    });
    res.end();
    return true;
  }

  const requestCount = recordRequest(req);
  if (
    requestCount.clientCount > REQUEST_RATE_LIMIT_MAX_REQUESTS ||
    requestCount.globalCount > getRequestRateLimitGlobalMaxRequests()
  ) {
    sendJson(res, 429, { error: "Too many setup requests" });
    return true;
  }

  if (!isAuthorized(req)) {
    const authFailureCount = getExpectedApiKey()
      ? recordFailedAuth(req)
      : { clientCount: 0, globalCount: 0 };
    if (
      getExpectedApiKey() &&
      (authFailureCount.clientCount > AUTH_RATE_LIMIT_MAX_FAILURES ||
        authFailureCount.globalCount > getAuthRateLimitGlobalMaxFailures())
    ) {
      sendJson(res, 429, { error: "Too many unauthorized attempts" });
      return true;
    }
    sendJson(res, 401, { error: "Unauthorized" });
    return true;
  }
  clearFailedAuth(req);

  try {
    if (req.method === "GET") {
      sendJson(res, 200, { backends: readAgentCanvasBackendCredentials() });
      return true;
    }

    if (req.method === "POST") {
      const body = await readJsonBody(req);
      sendJson(res, 200, {
        backend: writeAgentCanvasBackendCredential(body),
      });
      return true;
    }

    if (req.method === "DELETE") {
      const rawId = new URL(req.url || "", "http://localhost").searchParams.get(
        "id",
      );
      if (!rawId) {
        throw makeHttpError("Missing id parameter", 400);
      }
      const id = normalizeBackendId(rawId);
      deleteAgentCanvasBackendCredential(id);
      sendJson(res, 200, { ok: true });
      return true;
    }

    sendJson(res, 405, { error: "Method not allowed" });
    return true;
  } catch (error) {
    sendJson(res, error?.statusCode || 400, {
      error: error instanceof Error ? error.message : "Invalid request",
    });
    return true;
  }
}
