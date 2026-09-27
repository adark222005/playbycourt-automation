import { formatCourtMessage } from "@src/utilities/general.util";
import {
  logScanParameters,
  logWithTimestamp,
} from "@src/utilities/logger.utils";
import { getPlayByPointSlots } from "@src/utilities/playByPointSlots.util";
import { getMatchPointerSlots } from "@src/utilities/matchPointerSlots.util";
import { getGoPlaySlots } from "@src/utilities/goplaySlots.util";
import {
  findNewSlots,
  hasAnySlotBecomeUnavailable,
  loadSlotHistory,
  updateSlotHistoryExcel,
  withSlotHistoryLock,
} from "@src/utilities/slotsHistory.util";
import {
  ClubConfig,
  ScanCourtSlotsOptions,
  SlotHistoryRecord,
  TimeSlot,
} from "@src/utilities/types.util";
import { sendTelegramMessage } from "@src/utilities/telegramSender.util";
import { formatDate, resolveScanDates } from "@src/utilities/date.utils";

export async function checkCourtAvailability(
  params: ScanCourtSlotsOptions,
  clubs: ClubConfig[],
): Promise<void> {
  logScanParameters(params);

  const dates = resolveScanDates(params);
  const scannedDates: Set<string> = new Set(dates.map(formatDate));
  const hourRange = { startHour: params.startHour, endHour: params.endHour };
  logWithTimestamp(
    `Scanning ${scannedDates.size} date(s) [${[...scannedDates].join(", ")}] ` +
      `within hour range ${hourRange.startHour}-${hourRange.endHour}`,
  );

  for (const club of clubs) {
    try {
      console.log(`\n--- Scanning club: ${club.name} (${club.provider}) ---`);
      const slots = await fetchSlotsForClub(club, dates, params);
      logWithTimestamp(
        `[${club.name}] Raw API returned ${slots.length} slot(s): ${JSON.stringify(slots)}`,
      );
      await processClubResults(club, slots, scannedDates, hourRange);
    } catch (err) {
      console.error(`Error scanning club "${club.name}":`, err);
    }
  }
}

async function fetchSlotsForClub(
  club: ClubConfig,
  dates: Date[],
  params: ScanCourtSlotsOptions,
): Promise<TimeSlot[]> {
  switch (club.provider) {
    case "playbypoint":
      return getPlayByPointSlots(
        club.facilityId,
        dates,
        params.startHour,
        params.endHour,
        params.minPlaytimeHours,
      );
    case "matchpointer":
      return getMatchPointerSlots(
        club.venueId,
        dates,
        params.startHour,
        params.endHour,
        params.minPlaytimeHours,
      );
    case "goplay":
      return getGoPlaySlots(
        club.facilityId,
        dates,
        params.startHour,
        params.endHour,
        params.minPlaytimeHours,
      );
  }
}

async function processClubResults(
  club: ClubConfig,
  availableTimeSlots: TimeSlot[],
  scannedDates: Set<string>,
  hourRange: { startHour: number; endHour: number },
): Promise<void> {
  await withSlotHistoryLock(async () => {
    const fullSlotsHistory: SlotHistoryRecord[] = loadSlotHistory(club.name);
    logWithTimestamp(
      `[${club.name}] Loaded ${fullSlotsHistory.length} history record(s) ` +
        `(${fullSlotsHistory.filter((r) => !r.becameUnavailableAt).length} currently active)`,
    );

    const newSlots: TimeSlot[] = findNewSlots(
      availableTimeSlots,
      fullSlotsHistory,
    );

    const knownSlots: TimeSlot[] = availableTimeSlots.filter(
      (slot) => !newSlots.includes(slot),
    );

    logWithTimestamp(
      `[${club.name}] Comparison result: ${newSlots.length} new, ${knownSlots.length} already known. ` +
        `New: ${JSON.stringify(newSlots)}`,
    );

    const message = formatCourtMessage(club.name, newSlots, knownSlots);
    console.log(message);

    if (newSlots.length > 0) {
      logWithTimestamp(
        `[${club.name}] Sending Telegram notification for ${newSlots.length} new slot(s).`,
      );
      await sendTelegramMessage(message);
      updateSlotHistoryExcel(
        availableTimeSlots,
        scannedDates,
        hourRange,
        club.name,
      );
    } else {
      const hasUnavailable = hasAnySlotBecomeUnavailable(
        availableTimeSlots,
        fullSlotsHistory,
        scannedDates,
        hourRange,
      );

      if (hasUnavailable) {
        updateSlotHistoryExcel(
          availableTimeSlots,
          scannedDates,
          hourRange,
          club.name,
        );
        console.log(
          `[${club.name}] Some slots became unavailable. Excel updated.`,
        );
      } else {
        console.log(
          `[${club.name}] No slot availability changes. Excel not updated.`,
        );
      }
    }
  });
}
