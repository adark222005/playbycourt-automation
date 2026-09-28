import { test, expect } from "@playwright/test";
import { fetchGoPlayFacilityAvailability } from "@utils/goplayApi.util";
import { getGoPlaySlots } from "@utils/goplaySlots.util";

const GOPLAY_URL =
  "https://hhifcmpdogsyijohomxk.supabase.co/functions/v1/get-facilities-availability";

test.describe("API request format", () => {
  let originalFetch: typeof globalThis.fetch;

  test.beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  test.afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("sends POST with facility_ids array and date", async () => {
    let capturedUrl: string | undefined;
    let capturedInit: RequestInit | undefined;

    globalThis.fetch = async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      capturedUrl = input as string;
      capturedInit = init;
      return {
        ok: true,
        json: async () => ({
          date: "2025-03-15",
          facilities: [],
        }),
        text: async () => "",
      } as Response;
    };

    await fetchGoPlayFacilityAvailability(["facility-123"], "2025-03-15");

    expect(capturedUrl).toBe(GOPLAY_URL);
    expect(capturedInit?.method).toBe("POST");
    expect(capturedInit?.headers).toEqual({
      "Content-Type": "application/json",
      "User-Agent": "goplay-slot-scanner/1.0",
    });
    expect(JSON.parse(capturedInit?.body as string)).toEqual({
      facility_ids: ["facility-123"],
      date: "2025-03-15",
    });
  });

  test("throws error with status code on failure", async () => {
    globalThis.fetch = async () =>
      ({
        ok: false,
        status: 400,
        text: async () => "Bad Request",
      }) as Response;

    await expect(
      fetchGoPlayFacilityAvailability(["facility-123"], "2025-03-15"),
    ).rejects.toThrow(/GoPlay API error 400/);
  });
});

test.describe("getGoPlaySlots integration", () => {
  let originalFetch: typeof globalThis.fetch;

  test.beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  test.afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("makes one fetch call per date", async () => {
    let callCount = 0;

    globalThis.fetch = async () => {
      callCount++;
      return {
        ok: true,
        json: async () => ({
          date: "2025-03-10",
          facilities: [
            {
              facility_id: "facility-abc",
              facility_name: "Test",
              available_slots: [],
            },
          ],
        }),
        text: async () => "",
      } as Response;
    };

    const dates = [
      new Date(2025, 2, 10),
      new Date(2025, 2, 11),
      new Date(2025, 2, 12),
    ];

    await getGoPlaySlots("facility-abc", dates, 8, 20, 1);
    expect(callCount).toBe(3);
  });

  test("returns empty when no slots in hour range", async () => {
    globalThis.fetch = async () =>
      ({
        ok: true,
        json: async () => ({
          date: "2025-03-15",
          facilities: [
            {
              facility_id: "my-facility",
              facility_name: "My Court",
              available_slots: [
                { start_time: "06:00", duration_options: [60] },
              ],
            },
          ],
        }),
        text: async () => "",
      }) as Response;

    const dates = [new Date(2025, 2, 15)];
    const result = await getGoPlaySlots("my-facility", dates, 10, 22, 1);
    expect(result).toEqual([]);
  });

  test("returns qualifying TimeSlots with correct shape", async () => {
    globalThis.fetch = async () =>
      ({
        ok: true,
        json: async () => ({
          date: "2025-03-15",
          facilities: [
            {
              facility_id: "goplay-club-1",
              facility_name: "GoPlay Club",
              available_slots: [
                { start_time: "10:00", duration_options: [60, 90, 120] },
                { start_time: "11:00", duration_options: [60, 90] },
                { start_time: "14:30", duration_options: [60] },
              ],
            },
          ],
        }),
        text: async () => "",
      }) as Response;

    const dates = [new Date(2025, 2, 15)];
    const result = await getGoPlaySlots("goplay-club-1", dates, 8, 22, 1);

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);

    for (const slot of result) {
      expect(slot).toHaveProperty("date");
      expect(slot).toHaveProperty("start");
      expect(slot).toHaveProperty("end");
      expect(typeof slot.start).toBe("number");
      expect(typeof slot.end).toBe("number");
      expect(slot.end).toBeGreaterThan(slot.start);
    }
  });
});
