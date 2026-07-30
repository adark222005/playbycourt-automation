import { fetchGoPlayFacilityAvailability } from "./goplayApi.util";
import {
  formatDate,
  formatDateISO,
  parseHourStringToDecimal,
} from "./date.utils";
import { logWithTimestamp } from "./logger.utils";
import { GoPlayAvailableSlot, TimeSlot } from "./types.util";

/**
 * Filter out malformed slots missing start_time or available_courts.
 */
export function filterMalformedSlots(
  slots: unknown[],
  facilityId: string,
): GoPlayAvailableSlot[] {
  return slots.filter((slot: any) => {
    if (
      !slot ||
      typeof slot !== "object" ||
      !slot.start_time ||
      !Array.isArray(slot.available_courts)
    ) {
      logWithTimestamp(
        `Warning: Skipping malformed slot in facility ${facilityId} - missing start_time or available_courts`,
      );
      return false;
    }
    return true;
  }) as GoPlayAvailableSlot[];
}

/**
 * Get all duration options across all courts for a slot (deduplicated).
 */
export function getSlotDurationOptions(slot: GoPlayAvailableSlot): number[] {
  const allDurations = new Set<number>();
  for (const court of slot.available_courts) {
    if (Array.isArray(court.duration_options)) {
      for (const d of court.duration_options) {
        allDurations.add(d);
      }
    }
  }
  return [...allDurations];
}

/**
 * Convert each slot to a time range {start, end} using the longest duration
 * across all courts, clipped to endHour.
 */
export function slotsToTimeRanges(
  slots: GoPlayAvailableSlot[],
  endHour: number,
): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];

  for (const slot of slots) {
    const start = parseHourStringToDecimal(slot.start_time);
    const durations = getSlotDurationOptions(slot);
    const validDurations = durations.filter((d) => start + d / 60 <= endHour);

    if (validDurations.length === 0) continue;

    const longest = Math.max(...validDurations);
    ranges.push({ start, end: start + longest / 60 });
  }

  return ranges;
}

/**
 * Merge overlapping or adjacent time ranges into continuous blocks.
 */
export function mergeRanges(
  ranges: { start: number; end: number }[],
): { start: number; end: number }[] {
  if (ranges.length === 0) return [];

  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const curr = sorted[i];

    if (curr.start <= last.end) {
      last.end = Math.max(last.end, curr.end);
    } else {
      merged.push({ ...curr });
    }
  }

  return merged;
}

/**
 * Filter slots whose start_time falls within [startHour, endHour).
 */
export function filterSlotsByHourRange(
  slots: GoPlayAvailableSlot[],
  startHour: number,
  endHour: number,
): GoPlayAvailableSlot[] {
  return slots.filter((slot) => {
    const decimal = parseHourStringToDecimal(slot.start_time);
    return decimal >= startHour && decimal < endHour;
  });
}

/**
 * Orchestrator: fetches availability for all dates in parallel,
 * converts slots to ranges, merges them, filters by minPlaytime,
 * and returns TimeSlot[] representing continuous available windows.
 */
export async function getGoPlaySlots(
  facilityId: string,
  dates: Date[],
  startHour: number,
  endHour: number,
  minPlaytimeHours: number,
): Promise<TimeSlot[]> {
  const requests = dates.map(async (date) => {
    const dateISO = formatDateISO(date);
    const response = await fetchGoPlayFacilityAvailability(facilityId, dateISO);

    const validSlots = filterMalformedSlots(
      response.slots as unknown[],
      facilityId,
    );

    // Filter to configured hour range
    const inRange = filterSlotsByHourRange(validSlots, startHour, endHour);

    // Convert each slot to a time range using longest duration per slot
    const ranges = slotsToTimeRanges(inRange, endHour);

    // Merge overlapping/adjacent ranges into continuous blocks
    const merged = mergeRanges(ranges);

    // Filter by minimum playtime (block duration >= minPlaytimeHours)
    const qualifying = merged.filter(
      (r) => r.end - r.start >= minPlaytimeHours,
    );

    // Convert to TimeSlots
    const formattedDate = formatDate(date);
    return qualifying.map((r) => ({
      date: formattedDate,
      start: r.start,
      end: r.end,
    }));
  });

  const results = await Promise.all(requests);
  return results.flat();
}
