import { GoPlayAvailabilityResponse } from "./types.util";

const GOPLAY_API_URL =
  "https://hhifcmpdogsyijohomxk.supabase.co/functions/v1/get-facilities-availability";

const TOKEN_URL =
  "https://hhifcmpdogsyijohomxk.supabase.co/auth/v1/token?grant_type=refresh_token";
const REFRESH_TOKEN = "sxamf6orgd4s";
const API_KEY = "sb_publishable__I1XRF8C-OCEnIJV40DUUQ_enuDgiCX";

let cachedToken: string | null = null;
let tokenExpiresAt: number | null = null;

async function getToken(): Promise<string> {
  // Return cached token if it's still valid (with 5 minute buffer)
  if (cachedToken && tokenExpiresAt && Date.now() < tokenExpiresAt - 300000) {
    return cachedToken;
  }

  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apiKey: API_KEY,
    },
    body: JSON.stringify({ refresh_token: REFRESH_TOKEN }),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    throw new Error(`Failed to get GoPlay token: ${tokenRes.status} ${body}`);
  }

  const tokenData = await tokenRes.json();

  if (!tokenData.access_token) {
    throw new Error("Invalid token response: missing access_token");
  }

  const accessToken = tokenData.access_token as string;
  cachedToken = accessToken;
  // Token expires in 3600 seconds by default, set expiry to slightly before
  const expiresIn = tokenData.expires_in ? tokenData.expires_in * 1000 : 3600000;
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
