import { test, expect } from "@playwright/test";
import { findQualifyingBlocks } from "@utils/goplaySlots.util";
import { GoPlayAvailableSlot } from "@utils/types.util";

/**
 * Debug test — uses actual findQualifyingBlocks with mock data.
 * Logs input/output so you can track behavior.
 * Run: npx playwright test src/tests/findQualifyingBlocks.debug.spec.ts
 */

function buildSlot(
  startTime: string,
  courts: { id: string; durations: number[] }[],
): GoPlayAvailableSlot {
  return {
    start_time: startTime,
    available_courts: courts.map((c) => ({
      court_id: c.id,
      court_name: c.id,
      court_position: 0,
      duration_options: c.durations,
    })),
  };
}

function runAndLog(
  label: string,
  slots: GoPlayAvailableSlot[],
  endHour: number,
  minPlaytimeHours: number,
) {
  console.log(`\n=== ${label} ===`);
  console.log(
    `Config: endHour=${endHour}, minPlaytimeHours=${minPlaytimeHours}`,
  );
  console.log("Slots:");
  for (const slot of slots) {
    const courts = slot.available_courts
      .map((c) => `${c.court_id}[${c.duration_options.join(",")}min]`)
      .join(", ");
    console.log(`  ${slot.start_time} → ${courts}`);
  }

  const result = findQualifyingBlocks(slots, endHour, minPlaytimeHours);
  console.log(`\nFinal result: ${JSON.stringify(result)}\n`);
  return result;
}

test("Chain across courts — A(10,60+90) B(10,60) B(11,60+90) A(12,60), min 2h", () => {
  const slots = [
    buildSlot("10:00", [
      { id: "CourtA", durations: [60, 90] },
      { id: "CourtB", durations: [60] },
    ]),
    buildSlot("11:00", [{ id: "CourtB", durations: [60, 90] }]),
    buildSlot("12:00", [{ id: "CourtA", durations: [60] }]),
  ];

  const result = runAndLog("Chain across courts", slots, 14, 2);
  // A:10-11 → B:11-12 → A:12-13 = 3h chain
  expect(result).toEqual([{ start: 10, end: 13 }]);
});

test("No chain — A(10,60) B(10:30,60), min 1.5h", () => {
  const slots = [
    buildSlot("10:00", [{ id: "CourtA", durations: [60] }]),
    buildSlot("10:30", [{ id: "CourtB", durations: [60] }]),
  ];

  const result = runAndLog(
    "No chain — overlap but no connection",
    slots,
    14,
    1.5,
  );
  // A ends at 11, B ends at 11.5 — but nothing starts at 11 or 11.5
  expect(result).toEqual([]);
});

test("Simple chain — A(10,60) B(11,60), min 2h", () => {
  const slots = [
    buildSlot("10:00", [{ id: "CourtA", durations: [60] }]),
    buildSlot("11:00", [{ id: "CourtB", durations: [60] }]),
  ];

  const result = runAndLog("Simple chain A→B", slots, 14, 2);
  // A:10-11 → B:11-12 = 2h
  expect(result).toEqual([{ start: 10, end: 12 }]);
});

test("Single court long enough — A(10,120), min 2h", () => {
  const slots = [buildSlot("10:00", [{ id: "CourtA", durations: [60, 120] }])];

  const result = runAndLog("Single court covers it", slots, 14, 2);
  expect(result).toEqual([{ start: 10, end: 12 }]);
});

test("Gap prevents chain — A(10,60) B(12,60), min 2h", () => {
  const slots = [
    buildSlot("10:00", [{ id: "CourtA", durations: [60] }]),
    buildSlot("12:00", [{ id: "CourtB", durations: [60] }]),
  ];

  const result = runAndLog("Gap between courts", slots, 14, 2);
  // 11-12 has no court → can't chain
  expect(result).toEqual([]);
});

test("endHour clips — A(10,60+120) endHour=11.5, min 2h", () => {
  const slots = [buildSlot("10:00", [{ id: "CourtA", durations: [60, 120] }])];

  const result = runAndLog("endHour clips 120min option", slots, 11.5, 2);
  // 120min would end at 12 > endHour 11.5, so only 60min valid → span 1h < 2h
  expect(result).toEqual([]);
});

test("4 courts, staggered slots — only path through B and D qualifies for 2h", () => {
  // A: 09:00 [60]       → 9-10
  // B: 09:30 [60, 90]   → 9.5-10.5 or 9.5-11
  // C: 10:00 [60]       → 10-11
  // D: 11:00 [60, 90]   → 11-12 or 11-12.5
  // Chains:
  //   B(90): 9.5-11 → D(60): 11-12 = 2.5h ✓
  //   B(90): 9.5-11 → D(90): 11-12.5 = 3h ✓
  //   A(60): 9-10 → C(60): 10-11 → D(60): 11-12 = 3h ✓
  const slots = [
    buildSlot("09:00", [{ id: "CourtA", durations: [60] }]),
    buildSlot("09:30", [{ id: "CourtB", durations: [60, 90] }]),
    buildSlot("10:00", [{ id: "CourtC", durations: [60] }]),
    buildSlot("11:00", [{ id: "CourtD", durations: [60, 90] }]),
  ];

  const result = runAndLog("4 courts staggered", slots, 14, 2);
  // Farthest from 9 = 12.5 (9→10 via A, 10→11 via C, 11→12.5 via D)
  // Farthest from 9.5 = 12.5 (9.5→11 via B 90min, 11→12.5 via D)
  // Merged: {9, 12.5}
  expect(result).toEqual([{ start: 9, end: 12.5 }]);
});

test("3 courts with multiple slots each — full day scenario", () => {
  // Simulating a realistic day: 3 courts, slots every 30min from 8:00 to 12:00
  // Court A: available 8:00-10:00 (durations 60, 90)
  // Court B: available 9:30-12:00 (durations 60)
  // Court C: available 11:00-13:00 (durations 60, 90, 120)
  const slots = [
    buildSlot("08:00", [{ id: "CourtA", durations: [60, 90] }]),
    buildSlot("08:30", [{ id: "CourtA", durations: [60, 90] }]),
    buildSlot("09:00", [{ id: "CourtA", durations: [60, 90] }]),
    buildSlot("09:30", [
      { id: "CourtA", durations: [60] },
      { id: "CourtB", durations: [60] },
    ]),
    buildSlot("10:00", [{ id: "CourtB", durations: [60] }]),
    buildSlot("10:30", [{ id: "CourtB", durations: [60] }]),
    buildSlot("11:00", [
      { id: "CourtB", durations: [60] },
      { id: "CourtC", durations: [60, 90, 120] },
    ]),
    buildSlot("11:30", [{ id: "CourtC", durations: [60, 90] }]),
    buildSlot("12:00", [{ id: "CourtC", durations: [60] }]),
  ];

  const result = runAndLog("Full day 3 courts", slots, 14, 2);
  // Many chains possible. Farthest from 8:
  //   A(8,90)→9.5→A/B(9.5,60)→10.5→B(10.5,60)→11.5→C(11.5,90)→13
  //   That's 8→13 = 5h
  // All start points from 8 through 11 should chain to 13.
  // startPoints: 8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12
  // Farthest from 12: C(12,60)→13. Span 1h < 2h.
  // Farthest from 11.5: C(11.5,90)→13. Span 1.5h < 2h.
  // Farthest from 11: multiple, best reaches 13. Span 2h ✓.
  // So qualifying starts: 8, 8.5, 9, 9.5, 10, 10.5, 11 → all merge into one block
  expect(result).toEqual([{ start: 8, end: 13 }]);
});

test("Disconnected islands — two separate 1.5h blocks, min 1.5h", () => {
  // Morning: A(8,60) B(9,60) → chain 8-10 = 2h
  // Gap: nothing at 10, 10:30
  // Afternoon: C(14,90) D(15:30,60) → chain 14-16.5 = 2.5h
  const slots = [
    buildSlot("08:00", [{ id: "CourtA", durations: [60] }]),
    buildSlot("09:00", [{ id: "CourtB", durations: [60] }]),
    buildSlot("14:00", [{ id: "CourtC", durations: [90] }]),
    buildSlot("15:30", [{ id: "CourtD", durations: [60] }]),
  ];

  const result = runAndLog("Two disconnected islands", slots, 17, 1.5);
  // Morning: 8→9→10 = 2h ✓
  // Afternoon: 14→15.5→16.5 = 2.5h ✓
  expect(result).toEqual([
    { start: 8, end: 10 },
    { start: 14, end: 16.5 },
  ]);
});

test("5 courts but only one viable path — min 2h", () => {
  // Courts A-E all at 10:00, but with short durations (30min).
  // Only court C has slots at 10:00, 10:30, 11:00, 11:30 — chaining four 30min blocks.
  const slots = [
    buildSlot("10:00", [
      { id: "CourtA", durations: [30] },
      { id: "CourtB", durations: [30] },
      { id: "CourtC", durations: [30] },
      { id: "CourtD", durations: [30] },
      { id: "CourtE", durations: [30] },
    ]),
    buildSlot("10:30", [{ id: "CourtC", durations: [30] }]),
    buildSlot("11:00", [{ id: "CourtC", durations: [30] }]),
    buildSlot("11:30", [{ id: "CourtC", durations: [30] }]),
  ];

  const result = runAndLog("5 courts, only C chains", slots, 14, 2);
  // From 10: all courts give 10→10.5. Then only C continues: 10.5→11→11.5→12.
  // Farthest from 10 = 12, span 2h ✓
  expect(result).toEqual([{ start: 10, end: 12 }]);
});

test("Branching paths — shorter duration allows longer chain", () => {
  // Court A at 10:00 with durations [60, 90]
  // Court B at 11:00 with durations [60]  → only reachable via A's 60min
  // Court C at 11:30 with durations [60]  → only reachable via A's 90min
  // Court D at 12:00 with durations [60]  → reachable from B
  //
  // Path via A(60): 10→11→12→13 (A 60min + B 60min + D 60min = 3h)
  // Path via A(90): 10→11.5→12.5 (A 90min + C 60min = 2.5h)
  // Best: 3h via shorter initial duration
  const slots = [
    buildSlot("10:00", [{ id: "CourtA", durations: [60, 90] }]),
    buildSlot("11:00", [{ id: "CourtB", durations: [60] }]),
    buildSlot("11:30", [{ id: "CourtC", durations: [60] }]),
    buildSlot("12:00", [{ id: "CourtD", durations: [60] }]),
  ];

  const result = runAndLog(
    "Shorter duration enables longer chain",
    slots,
    14,
    2,
  );
  // Farthest from 10: max(getFarthest(11), getFarthest(11.5))
  //   getFarthest(11) → reaches 12 → reaches 13. = 13
  //   getFarthest(11.5) → reaches 12.5. = 12.5
  // Best = 13, span = 3h
  expect(result).toEqual([{ start: 10, end: 13 }]);
});

test("Nearly qualifying — falls short by 30min", () => {
  // A: 10:00 [60], B: 11:00 [60], C: 12:00 [30]
  // Chain: 10→11→12→12.5 = 2.5h
  // Looking for 3h → should NOT qualify
  const slots = [
    buildSlot("10:00", [{ id: "CourtA", durations: [60] }]),
    buildSlot("11:00", [{ id: "CourtB", durations: [60] }]),
    buildSlot("12:00", [{ id: "CourtC", durations: [30] }]),
  ];

  const result = runAndLog("Falls short by 30min", slots, 14, 3);
  expect(result).toEqual([]);
});

test("Multiple courts same slot with different durations — max reach", () => {
  // At 10:00: A[60], B[90], C[120]
  // At 11:00: D[60]
  // At 12:00: E[60]
  //
  // From 10: C gives 10→12, then E gives 12→13. Total 3h.
  // Also: A gives 10→11, D gives 11→12, E gives 12→13. Total 3h.
  // Also: B gives 10→11.5, nothing at 11.5 → dead end at 11.5.
  // Best = 13 via either path.
  const slots = [
    buildSlot("10:00", [
      { id: "CourtA", durations: [60] },
      { id: "CourtB", durations: [90] },
      { id: "CourtC", durations: [120] },
    ]),
    buildSlot("11:00", [{ id: "CourtD", durations: [60] }]),
    buildSlot("12:00", [{ id: "CourtE", durations: [60] }]),
  ];

  const result = runAndLog(
    "Multiple courts same slot, different durations",
    slots,
    14,
    2,
  );
  expect(result).toEqual([{ start: 10, end: 13 }]);
});
