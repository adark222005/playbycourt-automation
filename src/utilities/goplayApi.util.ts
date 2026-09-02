import { GoPlayAvailabilityResponse } from "./types.util";

const GOPLAY_API_URL =
  "https://hhifcmpdogsyijohomxk.supabase.co/functions/v1/get-facilities-availability";

export async function fetchGoPlayFacilityAvailability(
  facilityIds: string[],
  date: string,
): Promise<GoPlayAvailabilityResponse> {
  const res = await fetch(GOPLAY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
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
