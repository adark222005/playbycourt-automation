import fs from "fs";
import path from "path";
import { GOPLAY_API_KEY, GOPLAY_SEED_REFRESH_TOKEN } from "env-variables";
import { sendTelegramMessage } from "./telegramSender.util";
import { logWithTimestamp } from "./logger.utils";

const PROCESS_TAG = `${Date.now().toString(36)}-${Math.floor(
  Math.random() * 1e4,
)}`;

const TOKEN_URL =
  "https://hhifcmpdogsyijohomxk.supabase.co/auth/v1/token?grant_type=refresh_token";
const REFRESH_TOKEN_FILE = path.resolve(
  __dirname,
  "../../data/goplay_refresh_token",
);
const ACCESS_TOKEN_FILE = path.resolve(
  __dirname,
  "../../data/goplay_access_token.json",
);

// Refresh only when the access token is within this window of expiring.
const TOKEN_EXPIRY_BUFFER_MS = 300000; // 5 minutes

let cachedToken: string | null = null;
let tokenExpiresAt: number | null = null;
let tokenRefreshPromise: Promise<string> | null = null;

function isTokenValid(token: string | null, expiresAt: number | null): boolean {
  return (
    !!token && !!expiresAt && Date.now() < expiresAt - TOKEN_EXPIRY_BUFFER_MS
  );
}

function readStoredAccessToken(): { token: string; expiresAt: number } | null {
  try {
    const raw = fs.readFileSync(ACCESS_TOKEN_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.token === "string" &&
      typeof parsed.expiresAt === "number"
    ) {
      return { token: parsed.token, expiresAt: parsed.expiresAt };
    }
  } catch (err: any) {
    if (err.code !== "ENOENT") {
      // Corrupt/unreadable cache is non-fatal: fall through to a refresh.
      logWithTimestamp(
        `Warning: could not read GoPlay access token cache: ${err.message}`,
      );
    }
  }
  return null;
}

function storeAccessToken(token: string, expiresAt: number): void {
  const dir = path.dirname(ACCESS_TOKEN_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(
    ACCESS_TOKEN_FILE,
    JSON.stringify({ token, expiresAt }),
    "utf8",
  );
}

function readStoredFileToken(): string | null {
  try {
    const stored = fs.readFileSync(REFRESH_TOKEN_FILE, "utf8").trim();
    if (stored) return stored;
  } catch (err: any) {
    if (err.code !== "ENOENT") throw err;
  }
  return null;
}

function storeRefreshToken(token: string): void {
  const dir = path.dirname(REFRESH_TOKEN_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(REFRESH_TOKEN_FILE, token, "utf8");
}

/**
 * Resolve a valid GoPlay access token.
 * Checks the in-memory cache, then the on-disk cache, and only performs a
 * refresh (rotating the refresh token) when no valid token is available.
 */
export async function getGoPlayToken(): Promise<string> {
  // 1. In-memory cache (valid within a single process/run).
  if (isTokenValid(cachedToken, tokenExpiresAt)) {
    return cachedToken!;
  }

  // 2. Disk cache (shared across cron runs). Avoids a refresh — and a refresh
  //    token rotation — on every run when a prior access token is still valid.
  const stored = readStoredAccessToken();
  if (stored && isTokenValid(stored.token, stored.expiresAt)) {
    cachedToken = stored.token;
    tokenExpiresAt = stored.expiresAt;
    return stored.token;
  }

  // 3. No valid token anywhere: refresh.
  if (!tokenRefreshPromise) {
    tokenRefreshPromise = refreshToken();
  }

  try {
    return await tokenRefreshPromise;
  } finally {
    tokenRefreshPromise = null;
  }
}

async function attemptRefresh(
  refreshToken: string,
): Promise<
  | { ok: true; accessToken: string }
  | { ok: false; status: number; body: string }
> {
  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apiKey: GOPLAY_API_KEY,
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!tokenRes.ok) {
    return { ok: false, status: tokenRes.status, body: await tokenRes.text() };
  }

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    throw new Error("Invalid token response: missing access_token");
  }

  if (tokenData.refresh_token) {
    storeRefreshToken(tokenData.refresh_token as string);
  }

  const accessToken = tokenData.access_token as string;
  cachedToken = accessToken;
  const expiresIn = tokenData.expires_in
    ? tokenData.expires_in * 1000
    : 3600000;
  tokenExpiresAt = Date.now() + expiresIn;
  storeAccessToken(accessToken, tokenExpiresAt);

  return { ok: true, accessToken };
}

async function refreshToken(): Promise<string> {
  const fileToken = readStoredFileToken();
  const seedToken = GOPLAY_SEED_REFRESH_TOKEN;

  if (fileToken) {
    const result = await attemptRefresh(fileToken);
    if (result.ok) return result.accessToken;

    if (seedToken && seedToken !== fileToken) {
      const seedResult = await attemptRefresh(seedToken);
      if (seedResult.ok) return seedResult.accessToken;
      await alertFailure("seed", seedToken, seedResult.status, seedResult.body);
      throw new Error(
        `Failed to get GoPlay token: ${seedResult.status} ${seedResult.body}`,
      );
    }

    await alertFailure("file", fileToken, result.status, result.body);
    throw new Error(
      `Failed to get GoPlay token: ${result.status} ${result.body}`,
    );
  }

  if (!seedToken) {
    throw new Error(
      "No GoPlay refresh token available: cache empty and GOPLAY_SEED_REFRESH_TOKEN not set",
    );
  }

  const result = await attemptRefresh(seedToken);
  if (result.ok) return result.accessToken;
  await alertFailure("seed", seedToken, result.status, result.body);
  throw new Error(
    `Failed to get GoPlay token: ${result.status} ${result.body}`,
  );
}

async function alertFailure(
  source: "file" | "seed",
  refreshToken: string,
  status: number,
  body: string,
): Promise<void> {
  const alert =
    `🔴 GoPlay token refresh FAILED\n` +
    `run: ${PROCESS_TAG}\n` +
    `status: ${status}\n` +
    `source: ${source}\n` +
    `refresh_token: …${refreshToken.slice(-4)} (len ${refreshToken.length})\n` +
    `body: ${body.slice(0, 300)}`;
  await sendTelegramMessage(alert);
}
