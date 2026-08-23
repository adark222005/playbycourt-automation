import { test, expect } from "@playwright/test";
import fc from "fast-check";
import { parseClubConfigs } from "@utils/clubConfig.util";

// Feature: goplay-facilities-api, Property 1: Club config parsing preserves valid entries
test("Property 1: Club config parsing preserves valid entries", () => {
  const nonEmptyAlphanumeric = fc
    .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789"), {
      minLength: 1,
      maxLength: 20,
    })
    .map((chars) => chars.join(""));

  const validGoPlayArb = fc
    .record({
      name: nonEmptyAlphanumeric,
      facilityId: nonEmptyAlphanumeric,
    })
    .map(({ name, facilityId }) => ({
      config: { name, provider: "goplay" as const, facilityId },
      isValid: true as const,
    }));

  const invalidArb = fc.oneof(
    nonEmptyAlphanumeric.map((name) => ({
      config: { name, provider: "goplay" as const },
      isValid: false as const,
    })),
    nonEmptyAlphanumeric.map((facilityId) => ({
      config: { provider: "goplay" as const, facilityId },
      isValid: false as const,
    })),
    nonEmptyAlphanumeric.map((facilityId) => ({
      config: { name: "", provider: "goplay" as const, facilityId },
      isValid: false as const,
    })),
    nonEmptyAlphanumeric.map((name) => ({
      config: { name, provider: "goplay" as const, facilityId: "" },
      isValid: false as const,
    })),
    nonEmptyAlphanumeric.map((name) => ({
      config: { name, provider: "unknown", facilityId: "abc123" },
      isValid: false as const,
    })),
  );

  const mixedConfigsArb = fc
    .tuple(
      fc.array(validGoPlayArb, { minLength: 1, maxLength: 4 }),
      fc.array(invalidArb, { minLength: 1, maxLength: 4 }),
    )
    .chain(([valids, invalids]) => {
      const all = [...valids, ...invalids];
      return fc.shuffledSubarray(all, {
        minLength: all.length,
        maxLength: all.length,
      });
    });

  fc.assert(
    fc.property(mixedConfigsArb, (taggedConfigs) => {
      const configs = taggedConfigs.map((t) => t.config);
      const expectedValidCount = taggedConfigs.filter((t) => t.isValid).length;
      const json = JSON.stringify(configs);
      const result = parseClubConfigs(json);
      const goplayResults = result.filter((c) => c.provider === "goplay");
      expect(goplayResults.length).toBe(expectedValidCount);
      expect(goplayResults.length).toBeGreaterThan(0);
    }),
    { numRuns: 100 },
  );
});

// Feature: goplay-facilities-api, Property 2: Hour range filter retains only in-range slots
test("Property 2: Hour range filter retains only in-range slots", () => {
  const { filterSlotsByHourRange } = require("@utils/goplaySlots.util");
  const { parseHourStringToDecimal } = require("@utils/date.utils");

  const timeStringArb = fc
    .record({
      hours: fc.integer({ min: 0, max: 23 }),
      minutes: fc.constantFrom(0, 15, 30, 45),
    })
    .map(
      ({ hours, minutes }) =>
        `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
    );

  const slotArb = fc.record({
    start_time: timeStringArb,
    duration_options: fc.constant([60]),
  });

  const slotsArb = fc.array(slotArb, { minLength: 0, maxLength: 10 });

  const hourRangeArb = fc
    .record({
      startHour: fc.integer({ min: 0, max: 22 }),
      span: fc.integer({ min: 1, max: 12 }),
    })
    .map(({ startHour, span }) => ({
      startHour,
      endHour: Math.min(startHour + span, 24),
    }));

  fc.assert(
    fc.property(slotsArb, hourRangeArb, (slots, { startHour, endHour }) => {
      const result = filterSlotsByHourRange(slots, startHour, endHour);

      for (const slot of result) {
        const decimal = parseHourStringToDecimal(slot.start_time);
        expect(decimal).toBeGreaterThanOrEqual(startHour);
        expect(decimal).toBeLessThan(endHour);
      }

      const expectedCount = slots.filter((s: any) => {
        const d = parseHourStringToDecimal(s.start_time);
        return d >= startHour && d < endHour;
      }).length;
      expect(result.length).toBe(expectedCount);
    }),
    { numRuns: 100 },
  );
});

// Feature: goplay-facilities-api, Property 3: Merge ranges produces non-overlapping sorted output
test("Property 3: Merge ranges produces non-overlapping sorted output", () => {
  const { mergeRanges } = require("@utils/goplaySlots.util");

  const rangeArb = fc
    .record({
      start: fc.double({ min: 6, max: 22, noNaN: true }),
      duration: fc.double({ min: 0.5, max: 3, noNaN: true }),
    })
    .map(({ start, duration }) => ({ start, end: start + duration }));

  const rangesArb = fc.array(rangeArb, { minLength: 0, maxLength: 10 });

  fc.assert(
    fc.property(rangesArb, (ranges) => {
      const merged = mergeRanges(ranges);

      for (let i = 1; i < merged.length; i++) {
        expect(merged[i].start).toBeGreaterThan(merged[i - 1].end);
      }

      for (const r of merged) {
        expect(r.end).toBeGreaterThan(r.start);
      }

      for (const input of ranges) {
        const covered = merged.some(
          (m) => m.start <= input.start && m.end >= input.end,
        );
        expect(covered).toBe(true);
      }
    }),
    { numRuns: 100 },
  );
});

// Feature: goplay-facilities-api, Property 4: buildReservationIntervals respects endHour
test("Property 4: buildReservationIntervals respects endHour", () => {
  const { buildReservationIntervals } = require("@utils/goplaySlots.util");

  const timeStringArb = fc
    .record({
      hours: fc.integer({ min: 6, max: 20 }),
      minutes: fc.constantFrom(0, 15, 30, 45),
    })
    .map(
      ({ hours, minutes }) =>
        `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
    );

  const slotArb = fc.record({
    start_time: timeStringArb,
    duration_options: fc.array(fc.constantFrom(60, 90, 120), {
      minLength: 1,
      maxLength: 3,
    }),
  });

  const slotsArb = fc.array(slotArb, { minLength: 1, maxLength: 8 });
  const endHourArb = fc.integer({ min: 8, max: 24 });

  fc.assert(
    fc.property(slotsArb, endHourArb, (slots, endHour) => {
      const intervals = buildReservationIntervals(slots, endHour);

      for (const r of intervals) {
        expect(r.end).toBeLessThanOrEqual(endHour + 0.001);
        expect(r.end).toBeGreaterThan(r.start);
      }
    }),
    { numRuns: 100 },
  );
});

// Feature: goplay-facilities-api, Property 5: Response validation rejects missing slots field
test("Property 5: Response validation rejects missing facilities field", async () => {
  const { fetchGoPlayFacilityAvailability } = require("@utils/goplayApi.util");

  const invalidResponseArb = fc.oneof(
    fc.record({ data: fc.anything() }),
    fc.record({
      facilities: fc.oneof(
        fc.constant(null),
        fc.constant(undefined),
        fc.string(),
        fc.integer(),
      ),
    }),
    fc.constant({}),
  );

  const originalFetch = globalThis.fetch;
  try {
    await fc.assert(
      fc.asyncProperty(invalidResponseArb, async (invalidBody) => {
        globalThis.fetch = async () =>
          ({
            ok: true,
            json: async () => invalidBody,
            text: async () => "",
          }) as Response;

        await expect(
          fetchGoPlayFacilityAvailability(["test-id"], "2025-01-01"),
        ).rejects.toThrow("Invalid GoPlay response: missing facilities array");
      }),
      { numRuns: 100 },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// Feature: goplay-facilities-api, Property 6: Slot parsing skips malformed slots
test("Property 6: Slot parsing skips malformed slots", () => {
  const { filterMalformedSlots } = require("@utils/goplaySlots.util");

  const timeStringArb = fc
    .record({
      hours: fc.integer({ min: 0, max: 23 }),
      minutes: fc.constantFrom(0, 15, 30, 45),
    })
    .map(
      ({ hours, minutes }) =>
        `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
    );

  const validSlotArb = fc
    .record({
      start_time: timeStringArb,
      duration_options: fc.constant([60]),
    })
    .map((slot) => ({ slot, isValid: true as const }));

  const malformedSlotArb = fc.oneof(
    fc.constant({ slot: { duration_options: [] }, isValid: false as const }),
    timeStringArb.map((start_time) => ({
      slot: { start_time },
      isValid: false as const,
    })),
    fc.constant({ slot: {}, isValid: false as const }),
  );

  const mixedSlotsArb = fc
    .tuple(
      fc.array(validSlotArb, { minLength: 1, maxLength: 4 }),
      fc.array(malformedSlotArb, { minLength: 1, maxLength: 4 }),
    )
    .chain(([valids, invalids]) => {
      const all = [...valids, ...invalids];
      return fc.shuffledSubarray(all, {
        minLength: all.length,
        maxLength: all.length,
      });
    });

  fc.assert(
    fc.property(mixedSlotsArb, (taggedSlots) => {
      const allSlots = taggedSlots.map((t) => t.slot);
      const expectedValidCount = taggedSlots.filter((t) => t.isValid).length;
      const result = filterMalformedSlots(allSlots, "test-facility-123");
      expect(result.length).toBe(expectedValidCount);
    }),
    { numRuns: 100 },
  );
});

// Feature: goplay-facilities-api, Property 7: Full pipeline produces valid qualifying TimeSlots
test("Property 7: Full pipeline produces valid merged TimeSlots", () => {
  const {
    filterSlotsByHourRange,
    findQualifyingBlocks,
  } = require("@utils/goplaySlots.util");

  const timeStringArb = fc
    .record({
      hours: fc.integer({ min: 8, max: 18 }),
      minutes: fc.constantFrom(0, 30),
    })
    .map(
      ({ hours, minutes }) =>
        `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
    );

  const slotArb = fc.record({
    start_time: timeStringArb,
    duration_options: fc.array(fc.constantFrom(60, 90, 120), {
      minLength: 1,
      maxLength: 3,
    }),
  });

  const slotsArb = fc.array(slotArb, { minLength: 1, maxLength: 10 });

  fc.assert(
    fc.property(slotsArb, (slots) => {
      const startHour = 8;
      const endHour = 22;
      const minPlaytimeHours = 1;

      const inRange = filterSlotsByHourRange(slots, startHour, endHour);
      const qualifying = findQualifyingBlocks(
        inRange,
        endHour,
        minPlaytimeHours,
      );

      for (const r of qualifying) {
        expect(r.end - r.start).toBeGreaterThanOrEqual(minPlaytimeHours);
        expect(r.end).toBeLessThanOrEqual(endHour + 0.001);
      }

      // Non-overlapping and sorted
      for (let i = 1; i < qualifying.length; i++) {
        expect(qualifying[i].start).toBeGreaterThan(qualifying[i - 1].end);
      }
    }),
    { numRuns: 100 },
  );
});
