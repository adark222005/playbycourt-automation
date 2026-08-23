import { test, expect } from "@playwright/test";
import { findQualifyingBlocks } from "@utils/goplaySlots.util";
import { GoPlaySlot } from "@utils/types.util";

/**
 * Debug test — uses actual findQualifyingBlocks with mock data.
 * Run: npx playwright test src/tests/findQualifyingBlocks.debug.spec.ts --workers=1
 */

function buildSlot(
  startTime: string,
  durations: number[],
  isNextDay = false,
): GoPlaySlot {
  return {
    start_time: startTime,
    duration_options: durations,
    ...(isNextDay ? { is_next_day: true } : {}),
  };
}

function runAndLog(
  label: string,
  slots: GoPlaySlot[],
  endHour: number,
  minPlaytimeHours: number,
) {
  console.log(`\n=== ${label} ===`);
  console.log(
    `Config: endHour=${endHour}, minPlaytimeHours=${minPlaytimeHours}`,
  );
  console.log("Slots:");
  for (const slot of slots) {
    const nextDay = slot.is_next_day ? " (next day)" : "";
    console.log(
      `  ${slot.start_time}${nextDay} [${slot.duration_options.join(",")}min]`,
    );
  }

  const result = findQualifyingBlocks(slots, endHour, minPlaytimeHours);
  console.log(`Result: ${JSON.stringify(result)}\n`);
  return result;
}

test("Chain slots — 10:00[60,90] + 11:00[60,90] + 12:00[60], min 2h", () => {
  const slots = [
    buildSlot("10:00", [60, 90]),
    buildSlot("11:00", [60, 90]),
    buildSlot("12:00", [60]),
  ];

  const result = runAndLog("Chain 3 slots", slots, 14, 2);
  // 10→11→12→13 = 3h ✓
  expect(result).toEqual([{ start: 10, end: 13 }]);
});

test("No chain — 10:00[60] + 10:30[60], min 1.5h", () => {
  const slots = [buildSlot("10:00", [60]), buildSlot("10:30", [60])];

  const result = runAndLog(
    "No chain — no slot starts at 11 or 11.5",
    slots,
    14,
    1.5,
  );
  // 10→11 dead end (1h), 10.5→11.5 dead end (1h)
  expect(result).toEqual([]);
});

test("Simple chain — 10:00[60] + 11:00[60], min 2h", () => {
  const slots = [buildSlot("10:00", [60]), buildSlot("11:00", [60])];

  const result = runAndLog("Simple chain", slots, 14, 2);
  // 10→11→12 = 2h ✓
  expect(result).toEqual([{ start: 10, end: 12 }]);
});

test("Single slot long enough — 10:00[60,120], min 2h", () => {
  const slots = [buildSlot("10:00", [60, 120])];

  const result = runAndLog("Single slot with 120min option", slots, 14, 2);
  // 10→12 directly = 2h ✓
  expect(result).toEqual([{ start: 10, end: 12 }]);
});

test("Gap prevents chain — 10:00[60] + 12:00[60], min 2h", () => {
  const slots = [buildSlot("10:00", [60]), buildSlot("12:00", [60])];

  const result = runAndLog("Gap at 11:00", slots, 14, 2);
  expect(result).toEqual([]);
});

test("endHour clips — 10:00[60,120] endHour=11.5, min 2h", () => {
  const slots = [buildSlot("10:00", [60, 120])];

  const result = runAndLog("endHour clips 120min", slots, 11.5, 2);
  // 120min ends at 12 > 11.5, only 60min valid → 1h < 2h
  expect(result).toEqual([]);
});

test("Staggered slots with multiple durations — min 2h", () => {
  const slots = [
    buildSlot("09:00", [60]),
    buildSlot("09:30", [60, 90]),
    buildSlot("10:00", [60]),
    buildSlot("11:00", [60, 90]),
  ];

  const result = runAndLog("Staggered with branching", slots, 14, 2);
  // 9→10→11→12.5 = 3.5h, 9.5→11→12.5 = 3h, 10→11→12.5 = 2.5h
  expect(result).toEqual([{ start: 9, end: 12.5 }]);
});

test("Full day — many consecutive slots", () => {
  const slots = [
    buildSlot("08:00", [60, 90]),
    buildSlot("08:30", [60, 90]),
    buildSlot("09:00", [60, 90]),
    buildSlot("09:30", [60]),
    buildSlot("10:00", [60]),
    buildSlot("10:30", [60]),
    buildSlot("11:00", [60, 90, 120]),
    buildSlot("11:30", [60, 90]),
    buildSlot("12:00", [60]),
  ];

  const result = runAndLog("Full day", slots, 14, 2);
  // Chain from 8 all the way to 13 via various paths
  expect(result).toEqual([{ start: 8, end: 13 }]);
});

test("Disconnected islands — morning + afternoon", () => {
  const slots = [
    buildSlot("08:00", [60]),
    buildSlot("09:00", [60]),
    buildSlot("14:00", [90]),
    buildSlot("15:30", [60]),
  ];

  const result = runAndLog("Two islands", slots, 17, 1.5);
  // Morning: 8→9→10 = 2h ✓
  // Afternoon: 14→15.5→16.5 = 2.5h ✓
  expect(result).toEqual([
    { start: 8, end: 10 },
    { start: 14, end: 16.5 },
  ]);
});

test("Branching — shorter duration enables longer chain", () => {
  const slots = [
    buildSlot("10:00", [60, 90]),
    buildSlot("11:00", [60]),
    buildSlot("11:30", [60]),
    buildSlot("12:00", [60]),
  ];

  const result = runAndLog("Branching paths", slots, 14, 2);
  // Via 60min: 10→11→12→13 = 3h
  // Via 90min: 10→11.5→12.5 = 2.5h
  // Best = 13
  expect(result).toEqual([{ start: 10, end: 13 }]);
});

test("Nearly qualifying — falls short by 30min", () => {
  const slots = [
    buildSlot("10:00", [60]),
    buildSlot("11:00", [60]),
    buildSlot("12:00", [30]),
  ];

  const result = runAndLog("Falls short", slots, 14, 3);
  // 10→11→12→12.5 = 2.5h < 3h
  expect(result).toEqual([]);
});

test("Multiple durations same slot — max reach", () => {
  const slots = [
    buildSlot("10:00", [60, 90, 120]),
    buildSlot("11:00", [60]),
    buildSlot("12:00", [60]),
  ];

  const result = runAndLog("Multiple durations", slots, 14, 2);
  // 10→12 (120min) then 12→13 = 3h
  // Also 10→11→12→13 via 60min hops = 3h
  expect(result).toEqual([{ start: 10, end: 13 }]);
});

test("is_next_day slots are ignored", () => {
  const slots = [
    buildSlot("23:00", [60, 90, 120]),
    buildSlot("23:30", [60, 90]),
    buildSlot("00:00", [60], true), // is_next_day — should be excluded
  ];

  const result = runAndLog("Late night, next-day excluded", slots, 24, 2);
  // 23:00 [120min] → 23→25 but endHour=24 clips it. Only 60min valid: 23→24 (1h)
  // 23:00 [90min] → 23→24.5 clipped. Not valid.
  // 23:30 [60min] → 23.5→24.5 clipped. Not valid.
  // 23:30 [90min] → 23.5→25 clipped. Not valid.
  // Only 23:00 [60min] → 23→24.  Span 1h < 2h.
  // The 00:00 next_day slot is filtered out entirely.
  expect(result).toEqual([]);
});
