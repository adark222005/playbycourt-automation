import fs from "fs";
import path from "path";
import { GOPLAY_API_KEY, GOPLAY_SEED_REFRESH_TOKEN } from "env-variables";
import { GoPlayAvailabilityResponse } from "./types.util";
import { sendTelegramMessage } from "./telegramSender.util";

const PROCESS_TAG = `${Date.now().toString(36)}-${Math.floor(
  Math.random() * 1e4,
)}`;

const GOPLAY_API_URL =
  "https://hhifcmpdogsyijohomxk.supabase.co/functions/v1/get-facilities-availability";

const TOKEN_URL =
  "https://hhifcmpdogsyijohomxk.supabase.co/auth/v1/token?grant_type=refresh_token";
const REFRESH_TOKEN_FILE = path.resolve(
  __dirname,
  "../../data/goplay_refresh_token",
);

let cachedToken: string | null = null;
let tokenExpiresAt: number | null = null;
let tokenRefreshPromise: Promise<string> | null = null;

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

async function getToken(): Promise<string> {
  // Return cached token if it's still valid (with 5 minute buffer)
  if (cachedToken && tokenExpiresAt && Date.now() < tokenExpiresAt - 300000) {
    return cachedToken;
  }

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
): Promise<{ ok: true; accessToken: string } | { ok: false; status: number; body: string }> {
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
    throw new Error(`Failed to get GoPlay token: ${result.status} ${result.body}`);
  }

  if (!seedToken) {
    throw new Error(
      "No GoPlay refresh token available: cache empty and GOPLAY_SEED_REFRESH_TOKEN not set",
    );
  }

  const result = await attemptRefresh(seedToken);
  if (result.ok) return result.accessToken;
  await alertFailure("seed", seedToken, result.status, result.body);
  throw new Error(`Failed to get GoPlay token: ${result.status} ${result.body}`);
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
    `refresh_token: ${refreshToken}\n` +
    `body: ${body.slice(0, 300)}`;
  await sendTelegramMessage(alert);
}

export async function fetchGoPlayFacilityAvailability(
  facilityIds: string[],
  date: string,
): Promise<GoPlayAvailabilityResponse> {
  const token = await getToken();

  const res = await fetch(GOPLAY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "goplay-slot-scanner/1.0",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ facility_ids: facilityIds, date }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GoPlay API error ${res.status}: ${body}`);
  }

  const json = await res.json();

  if (!json || !Array.isArray(json.facilities)) {
    throw new Error("Invalid GoPlay response: missing facilities array");
  }

  return json as GoPlayAvailabilityResponse;
}
