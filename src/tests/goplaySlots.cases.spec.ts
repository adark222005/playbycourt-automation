import { test, expect } from "@playwright/test";
import { getGoPlaySlots } from "@utils/goplaySlots.util";

function mockFetch(slots: any[]) {
  globalThis.fetch = async () =>
    ({
      ok: true,
      json: async () => ({
        facility_id: "test-facility",
        facility_name: "Test",
        date: "2025-03-15",
        slots,
      }),
      text: async () => "",
    }) as Response;
}

const dates = [new Date(2025, 2, 15)];
const startHour = 6;
const endHour = 24;
const minPlaytime = 1.5; // 90 minutes

test.describe("GoPlay slot filtering - minPlaytime 1.5h", () => {
  let originalFetch: typeof globalThis.fetch;
  test.beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  test.afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("Case 1: Single 60-min slot, merged span < minPlaytime - no result", async () => {
    mockFetch([
      {
        start_time: "18:00",
        available_courts: [
          {
            court_id: "a",
            court_name: "A",
            court_position: 1,
            duration_options: [60],
          },
        ],
      },
    ]);

    const result = await getGoPlaySlots(
      "test-facility",
      dates,
      startHour,
      endHour,
      minPlaytime,
    );
    expect(result).toEqual([]);
  });

  test("Case 2: One court offers 90 min - qualifies on its own", async () => {
    mockFetch([
      {
        start_time: "18:00",
        available_courts: [
          {
            court_id: "a",
            court_name: "A",
            court_position: 1,
            duration_options: [60],
          },
          {
            court_id: "b",
            court_name: "B",
            court_position: 2,
            duration_options: [60, 90],
          },
        ],
      },
    ]);

    const result = await getGoPlaySlots(
      "test-facility",
      dates,
      startHour,
      endHour,
      minPlaytime,
    );
    expect(result).toEqual([
      { date: expect.any(String), start: 18, end: 19.5 },
    ]);
  });

  test("Case 3: Longest duration is used", async () => {
    mockFetch([
      {
        start_time: "15:00",
        available_courts: [
          {
            court_id: "a",
            court_name: "A",
            court_position: 1,
            duration_options: [60, 90, 120],
          },
        ],
      },
    ]);

    const result = await getGoPlaySlots(
      "test-facility",
      dates,
      startHour,
      endHour,
      minPlaytime,
    );
    expect(result).toEqual([{ date: expect.any(String), start: 15, end: 17 }]);
  });

  test("Case 4: Two qualifying slots, no overlap - two results", async () => {
    mockFetch([
      {
        start_time: "10:00",
        available_courts: [
          {
            court_id: "a",
            court_name: "A",
            court_position: 1,
            duration_options: [90],
          },
        ],
      },
      {
        start_time: "15:00",
        available_courts: [
          {
            court_id: "b",
            court_name: "B",
            court_position: 2,
            duration_options: [60, 120],
          },
        ],
      },
    ]);

    const result = await getGoPlaySlots(
      "test-facility",
      dates,
      startHour,
      endHour,
      minPlaytime,
    );
    expect(result.length).toBe(2);
    expect(result[0]).toEqual({
      date: expect.any(String),
      start: 10,
      end: 11.5,
    });
    expect(result[1]).toEqual({ date: expect.any(String), start: 15, end: 17 });
  });

  test("Case 5: Two qualifying slots, overlapping - merged into one", async () => {
    mockFetch([
      {
        start_time: "13:00",
        available_courts: [
          {
            court_id: "a",
            court_name: "A",
            court_position: 1,
            duration_options: [120],
          },
        ],
      },
      {
        start_time: "14:00",
        available_courts: [
          {
            court_id: "b",
            court_name: "B",
            court_position: 2,
            duration_options: [90],
          },
        ],
      },
    ]);

    const result = await getGoPlaySlots(
      "test-facility",
      dates,
      startHour,
      endHour,
      minPlaytime,
    );
    expect(result).toEqual([
      { date: expect.any(String), start: 13, end: 15.5 },
    ]);
  });

  test("Case 6: All slots contribute to merge, span passes minPlaytime", async () => {
    mockFetch([
      {
        start_time: "13:00",
        available_courts: [
          {
            court_id: "a",
            court_name: "A",
            court_position: 1,
            duration_options: [120],
          },
        ],
      },
      {
        start_time: "14:00",
        available_courts: [
          {
            court_id: "b",
            court_name: "B",
            court_position: 2,
            duration_options: [60],
          },
        ],
      },
      {
        start_time: "15:00",
        available_courts: [
          {
            court_id: "a",
            court_name: "A",
            court_position: 1,
            duration_options: [90],
          },
        ],
      },
    ]);

    // 13:00-15:00, 14:00-15:00, 15:00-16:30 all merge into 13:00-16:30
    const result = await getGoPlaySlots(
      "test-facility",
      dates,
      startHour,
      endHour,
      minPlaytime,
    );
    expect(result).toEqual([
      { date: expect.any(String), start: 13, end: 16.5 },
    ]);
  });

  test("Case 7: Two adjacent 60-min slots on different courts - merged span 2h passes", async () => {
    mockFetch([
      {
        start_time: "19:00",
        available_courts: [
          {
            court_id: "a",
            court_name: "A",
            court_position: 1,
            duration_options: [60],
          },
        ],
      },
      {
        start_time: "20:00",
        available_courts: [
          {
            court_id: "b",
            court_name: "B",
            court_position: 2,
            duration_options: [60],
          },
        ],
      },
    ]);

    // 19:00-20:00 + 20:00-21:00 merge into 19:00-21:00 (2h >= 1.5h)
    const result = await getGoPlaySlots(
      "test-facility",
      dates,
      startHour,
      endHour,
      minPlaytime,
    );
    expect(result).toEqual([{ date: expect.any(String), start: 19, end: 21 }]);
  });

  test("Case 8: endHour clips duration - single slot span < minPlaytime", async () => {
    mockFetch([
      {
        start_time: "21:30",
        available_courts: [
          {
            court_id: "a",
            court_name: "A",
            court_position: 1,
            duration_options: [60, 90, 120],
          },
        ],
      },
    ]);

    // endHour=22: only 30 min fits (21:30-22:00). Span 0.5h < 1.5h
    const result = await getGoPlaySlots(
      "test-facility",
      dates,
      startHour,
      22,
      minPlaytime,
    );
    expect(result).toEqual([]);
  });

  test("Case 9: Multiple courts, best duration wins for the range", async () => {
    mockFetch([
      {
        start_time: "16:00",
        available_courts: [
          {
            court_id: "a",
            court_name: "A",
            court_position: 1,
            duration_options: [60],
          },
          {
            court_id: "b",
            court_name: "B",
            court_position: 2,
            duration_options: [90],
          },
          {
            court_id: "c",
            court_name: "C",
            court_position: 3,
            duration_options: [120],
          },
        ],
      },
    ]);

    const result = await getGoPlaySlots(
      "test-facility",
      dates,
      startHour,
      endHour,
      minPlaytime,
    );
    expect(result).toEqual([{ date: expect.any(String), start: 16, end: 18 }]);
  });
});
