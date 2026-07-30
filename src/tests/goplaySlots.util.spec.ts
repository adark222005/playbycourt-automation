import { test, expect } from "@playwright/test";
import { fetchGoPlayFacilityAvailability } from "@utils/goplayApi.util";
import { getGoPlaySlots } from "@utils/goplaySlots.util";

const GOPLAY_URL =
  "https://hhifcmpdogsyijohomxk.supabase.co/functions/v1/get-facility-court-availability";

test.describe("API request format", () => {
  let originalFetch: typeof globalThis.fetch;

  test.beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  test.afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("sends POST to correct URL with proper headers and body", async () => {
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
          facility_id: "facility-123",
          facility_name: "Test Court",
          date: "2025-03-15",
          slots: [],
        }),
        text: async () => "",
      } as Response;
    };

    await fetchGoPlayFacilityAvailability("facility-123", "2025-03-15");

    expect(capturedUrl).toBe(GOPLAY_URL);
    expect(capturedInit?.method).toBe("POST");
    expect(capturedInit?.headers).toEqual({
      "Content-Type": "application/json",
    });
    expect(JSON.parse(capturedInit?.body as string)).toEqual({
      facility_id: "facility-123",
      date: "2025-03-15",
    });
  });
});

test.describe("One request per date behavior", () => {
  let originalFetch: typeof globalThis.fetch;

  test.beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  test.afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("makes exactly one fetch call per date", async () => {
    let callCount = 0;

    globalThis.fetch = async () => {
      callCount++;
      return {
        ok: true,
        json: async () => ({
          facility_id: "facility-abc",
          facility_name: "Test",
          date: "2025-03-10",
          slots: [],
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
});

test.describe("HTTP error response handling", () => {
  let originalFetch: typeof globalThis.fetch;

  test.beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  test.afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("throws error with status code on 400 response", async () => {
    globalThis.fetch = async () =>
      ({
        ok: false,
        status: 400,
        text: async () => "Bad Request",
      }) as Response;

    await expect(
      fetchGoPlayFacilityAvailability("facility-123", "2025-03-15"),
    ).rejects.toThrow(/GoPlay API error 400/);
  });

  test("throws error with status code on 500 response", async () => {
    globalThis.fetch = async () =>
      ({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      }) as Response;

    await expect(
      fetchGoPlayFacilityAvailability("facility-123", "2025-03-15"),
    ).rejects.toThrow(/GoPlay API error 500/);
  });
});

test.describe("Empty response / no slots", () => {
  let originalFetch: typeof globalThis.fetch;

  test.beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  test.afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("returns empty array when no slots match filters", async () => {
    globalThis.fetch = async () =>
      ({
        ok: true,
        json: async () => ({
          facility_id: "my-facility",
          facility_name: "My Court",
          date: "2025-03-15",
          slots: [
            {
              start_time: "06:00",
              available_courts: [
                {
                  court_id: "c1",
                  court_name: "Court 1",
                  court_position: 1,
                  duration_options: [60],
                },
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
});

test.describe("Service-layer integration", () => {
  let originalFetch: typeof globalThis.fetch;

  test.beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  test.afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("getGoPlaySlots returns TimeSlot[] with correct shape", async () => {
    globalThis.fetch = async () =>
      ({
        ok: true,
        json: async () => ({
          facility_id: "goplay-club-1",
          facility_name: "GoPlay Club",
          date: "2025-03-15",
          slots: [
            {
              start_time: "10:00",
              available_courts: [
                {
                  court_id: "c1",
                  court_name: "Court 1",
                  court_position: 1,
                  duration_options: [60, 90, 120],
                },
              ],
            },
            {
              start_time: "14:30",
              available_courts: [
                {
                  court_id: "c1",
                  court_name: "Court 1",
                  court_position: 1,
                  duration_options: [60],
                },
                {
                  court_id: "c2",
                  court_name: "Court 2",
                  court_position: 2,
                  duration_options: [60, 90],
                },
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
