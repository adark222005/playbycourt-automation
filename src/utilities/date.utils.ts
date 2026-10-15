import { ScanCourtSlotsOptions } from "@src/utilities/types.util";

export function formatDate(date: Date): string {
  const day: string = String(date.getDate()).padStart(2, "0");
  const month: string = String(date.getMonth() + 1).padStart(2, "0");
  const weekday: string = date.toLocaleString("en-US", { weekday: "long" });

  return `${day}/${month} ${weekday}`;
}

export function getCurrentDateTime(): string {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  };

  const formatted: string = now.toLocaleString("en-GB", options);
  const [datePart, timePart] = formatted.split(", ");
  const [dd, mm, yyyy] = datePart.split("/");
  return `${yyyy}-${mm}-${dd} ${timePart}`;
}

export function formatHourDecimalToTimeString(decimalHour: number): string {
  const hours = Math.floor(decimalHour);
  const minutes = Math.round((decimalHour - hours) * 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0",
  )}`;
}

export function parseHourStringToDecimal(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours + minutes / 60;
}

export function smartParseDate(
  dateStr: string,
  contextTimestamp: string,
): Date {
  const [day, month] = dateStr.split(" ")[0].split("/").map(Number);
  const contextDate: Date = new Date(contextTimestamp);
  let year: number = contextDate.getFullYear();

  let slotDate: Date = new Date(year, month - 1, day);

  const TWO_WEEKS_MS: number = 14 * 24 * 60 * 60 * 1000;

  // If slot date is more than 2 weeks in the past, it's probably for next year
  if (slotDate.getTime() < contextDate.getTime() - TWO_WEEKS_MS) {
    slotDate = new Date(year + 1, month - 1, day);
  }

  return slotDate;
}

export function prettyDateTime(dateTimeStr: string): string {
  // Input example: "2025-10-23 14:30"
  const [datePart, timePart] = dateTimeStr.split(" ");
  const [yyyy, mm, dd] = datePart.split("-");
  return `${dd}/${mm}/${yyyy} ${timePart}`;
}

export function reversePrettyDateTime(prettyDateTimeStr: string): string {
  // Input example: "23/10/2025 14:30"
  const [datePart, timePart] = prettyDateTimeStr.split(" ");
  const [dd, mm, yyyy] = datePart.split("/");
  return `${yyyy}-${mm}-${dd} ${timePart}`;
}

export function generateDateRange(
  start: Date,
  end: Date,
  options?: { skipWeekend?: boolean; skipWeekdays?: number[] },
): Date[] {
  const { skipWeekend = false, skipWeekdays = [] } = options ?? {};

  const skipSet: Set<number> = new Set<number>(skipWeekdays);
  if (skipWeekend) {
    skipSet.add(5);
    skipSet.add(6);
  }

  const dates: Date[] = [];
  const current: Date = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate(),
  );
  const last: Date = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  while (current <= last) {
    if (!skipSet.has(current.getDay())) {
      dates.push(new Date(current));
    }
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

export function dateToTimestamp(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

export function formatDateISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function resolveScanDates(params: ScanCourtSlotsOptions): Date[] {
  if (params.specificDates) {
    return params.specificDates;
  }
  return generateDateRange(params.startDate!, params.endDate!, {
    skipWeekend: params.skipWeekend,
    skipWeekdays: params.skipWeekdays,
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
