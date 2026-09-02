import { fetchGoPlayFacilityAvailability } from "./goplayApi.util";
import {
  formatDate,
  formatDateISO,
  parseHourStringToDecimal,
} from "./date.utils";
import { logWithTimestamp } from "./logger.utils";
import { GoPlaySlot, TimeSlot } from "./types.util";

/**
 * Filter out malformed slots missing start_time or duration_options.
 */
export function filterMalformedSlots(
  slots: unknown[],
  facilityId: string,
): GoPlaySlot[] {
  return slots.filter((slot: any) => {
    if (
      !slot ||
      typeof slot !== "object" ||
      !slot.start_time ||
      !Array.isArray(slot.duration_options)
    ) {
      logWithTimestamp(
        `Warning: Skipping malformed slot in facility ${facilityId} - missing start_time or duration_options`,
      );
      return false;
    }
    return true;
  }) as GoPlaySlot[];
}

/**
 * Build all possible reservation intervals from slots.
 * Each interval represents one bookable reservation: a start time
 * for one of its duration options, clipped to endHour.
 */
export function buildReservationIntervals(
  slots: GoPlaySlot[],
  endHour: number,
): { start: number; end: number }[] {
  const intervals: { start: number; end: number }[] = [];

  for (const slot of slots) {
    const start = parseHourStringToDecimal(slot.start_time);

    if (!Array.isArray(slot.duration_options)) continue;

    for (const duration of slot.duration_options) {
      const end = start + duration / 60;
      if (end <= endHour) {
        intervals.push({ start, end });
      }
    }
  }

  return intervals;
}

/**
 * Build a reachability map from intervals.
 * Key = start time, Value = set of end times reachable with one reservation.
 */
export function buildReachabilityMap(
  intervals: { start: number; end: number }[],
): Map<number, Set<number>> {
  const reachableEnds = new Map<number, Set<number>>();

  for (const { start, end } of intervals) {
    const ends = reachableEnds.get(start) ?? new Set<number>();
    ends.add(end);
    reachableEnds.set(start, ends);
  }

  return reachableEnds;
}

/**
 * Compute the farthest reachable time from each start point by chaining
 * back-to-back reservations. Uses memoization.
 */
export function computeFarthestReach(
  reachableEnds: Map<number, Set<number>>,
): Map<number, number> {
  const farthestFrom = new Map<number, number>();

  function getFarthest(time: number): number {
    if (farthestFrom.has(time)) return farthestFrom.get(time)!;

    const ends = reachableEnds.get(time);
    if (!ends) {
      farthestFrom.set(time, time);
      return time;
    }

    let best = time;
    for (const end of ends) {
      const chainedEnd = getFarthest(end);
      if (chainedEnd > best) best = chainedEnd;
    }
    farthestFrom.set(time, best);
    return best;
  }

  for (const start of reachableEnds.keys()) {
    getFarthest(start);
  }

  return farthestFrom;
}

/**
 * Find qualifying time blocks where the user can play >= minPlaytimeHours
 * by chaining reservations across courts.
 *
 * A reservation is a single booking on one court starting at a slot's start_time
 * and lasting for one of that court's duration_options. Two reservations chain
 * if one ends exactly when the next begins (possibly on a different court).
 */
export function findQualifyingBlocks(
  slots: GoPlaySlot[],
  endHour: number,
  minPlaytimeHours: number,
): { start: number; end: number }[] {
  const intervals = buildReservationIntervals(slots, endHour);
  if (intervals.length === 0) return [];

  const reachableEnds = buildReachabilityMap(intervals);
  const farthestFrom = computeFarthestReach(reachableEnds);

  const startPoints = [...reachableEnds.keys()].sort((a, b) => a - b);
  const qualifying: { start: number; end: number }[] = [];

  for (const start of startPoints) {
    const farthest = farthestFrom.get(start) ?? start;
    if (farthest - start >= minPlaytimeHours) {
      qualifying.push({ start, end: farthest });
    }
  }

  return mergeRanges(qualifying);
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
 * Slots with is_next_day are excluded (they represent times beyond midnight).
 */
export function filterSlotsByHourRange(
  slots: GoPlaySlot[],
  startHour: number,
  endHour: number,
): GoPlaySlot[] {
  return slots.filter((slot) => {
    if (slot.is_next_day) return false;
    const decimal = parseHourStringToDecimal(slot.start_time);
    return decimal >= startHour && decimal < endHour;
  });
}

/**
 * Orchestrator: fetches availability for all dates in parallel,
 * finds qualifying blocks by chaining reservations, returns TimeSlots.
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
    const response = await fetchGoPlayFacilityAvailability(
      [facilityId],
      dateISO,
    );

    const facility = response.facilities.find(
      (f) => f.facility_id === facilityId,
    );
    if (!facility) return [];

    const validSlots = filterMalformedSlots(
      facility.available_slots as unknown[],
      facilityId,
    );

    // Filter to configured hour range
    const inRange = filterSlotsByHourRange(validSlots, startHour, endHour);

    // Find blocks where chained reservations cover >= minPlaytime
    const qualifying = findQualifyingBlocks(inRange, endHour, minPlaytimeHours);

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
