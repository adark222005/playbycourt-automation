import { GoPlayFacilityResponse } from "./types.util";

const GOPLAY_API_URL =
  "https://hhifcmpdogsyijohomxk.supabase.co/functions/v1/get-facility-court-availability";

export async function fetchGoPlayFacilityAvailability(
  facilityId: string,
  date: string,
): Promise<GoPlayFacilityResponse> {
  const res = await fetch(GOPLAY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ facility_id: facilityId, date }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GoPlay API error ${res.status}: ${body}`);
  }

  const json = await res.json();

  if (!json || !Array.isArray(json.slots)) {
    throw new Error("Invalid GoPlay response: missing slots array");
  }

  return json as GoPlayFacilityResponse;
}
