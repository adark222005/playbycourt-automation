import fs from "fs";
import path from "path";
import { GOPLAY_API_KEY } from "env-variables";
import { GoPlayAvailabilityResponse } from "./types.util";

const GOPLAY_API_URL =
  "https://hhifcmpdogsyijohomxk.supabase.co/functions/v1/get-facilities-availability";

const TOKEN_URL =
  "https://hhifcmpdogsyijohomxk.supabase.co/auth/v1/token?grant_type=refresh_token";
// Seed refresh token — used only on first run before a rotated token is persisted.
const SEED_REFRESH_TOKEN = "atkxpmitukfe";
const REFRESH_TOKEN_FILE = path.resolve(
  __dirname,
  "../../data/goplay_refresh_token",
);

let cachedToken: string | null = null;
let tokenExpiresAt: number | null = null;
let tokenRefreshPromise: Promise<string> | null = null;

/**
 * Supabase rotates refresh tokens: each successful token request invalidates
 * the refresh token used and returns a new one. We persist the latest refresh
 * token to disk so subsequent process runs (e.g. cron) use the valid one
 * instead of the already-consumed seed token.
 */
function readStoredRefreshToken(): string {
  try {
    const stored = fs.readFileSync(REFRESH_TOKEN_FILE, "utf8").trim();
    if (stored) return stored;
  } catch (err: any) {
    if (err.code !== "ENOENT") throw err;
  }
  return SEED_REFRESH_TOKEN;
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

async function refreshToken(): Promise<string> {
  const refreshToken = readStoredRefreshToken();

  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apiKey: GOPLAY_API_KEY,
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    throw new Error(`Failed to get GoPlay token: ${tokenRes.status} ${body}`);
  }

  const tokenData = await tokenRes.json();

  if (!tokenData.access_token) {
    throw new Error("Invalid token response: missing access_token");
  }

  // Persist the rotated refresh token so the next run can authenticate.
  if (tokenData.refresh_token) {
    storeRefreshToken(tokenData.refresh_token as string);
  }

  const accessToken = tokenData.access_token as string;
  cachedToken = accessToken;
  // Token expires in 3600 seconds by default, set expiry to slightly before
  const expiresIn = tokenData.expires_in
    ? tokenData.expires_in * 1000
    : 3600000;
  tokenExpiresAt = Date.now() + expiresIn;

  return accessToken;
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
