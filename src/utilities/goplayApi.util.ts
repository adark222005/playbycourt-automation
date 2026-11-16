import { GoPlayAvailabilityResponse } from "./types.util";
import { getGoPlayToken } from "./goplayAuth.util";

const GOPLAY_API_URL =
  "https://hhifcmpdogsyijohomxk.supabase.co/functions/v1/get-facilities-availability";

// iOS native app style User-Agent (<App>/<build> CFNetwork/<ver> Darwin/<ver>).
const GOPLAY_USER_AGENT = "GoPlay/1 CFNetwork/1490.0.4 Darwin/23.2.0";
export async function fetchGoPlayFacilityAvailability(
  facilityIds: string[],
  date: string,
): Promise<GoPlayAvailabilityResponse> {
  const token = await getGoPlayToken();

  const res = await fetch(GOPLAY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": GOPLAY_USER_AGENT,
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
  console.log(JSON.stringify(json, null, 2));

  return json as GoPlayAvailabilityResponse;
}
