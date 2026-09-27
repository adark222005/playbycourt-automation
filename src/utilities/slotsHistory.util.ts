import * as XLSX from "xlsx";
import fs from "fs";
import path from "path";
import { SlotHistoryRecord, TimeSlot } from "./types.util";
import {
  formatHourDecimalToTimeString,
  getCurrentDateTime,
  parseHourStringToDecimal,
  prettyDateTime,
  reversePrettyDateTime,
  smartParseDate,
} from "./date.utils";
import { TELEGRAM_CHAT_ID } from "env-variables";
import { logWithTimestamp } from "./logger.utils";

function getHistoryFilePath(): string {
  return path.resolve(
    __dirname,
    `../../data/slot_history_${TELEGRAM_CHAT_ID}.xlsx`,
  );
}

const sheetName: string = "Slot History";

function slotKey(row: TimeSlot): string {
  return `${row.date}-${row.start}-${row.end}`;
}

export function loadSlotHistory(worksheetName?: string): SlotHistoryRecord[] {
  const filePath = getHistoryFilePath();
  if (!fs.existsSync(filePath)) {
    logWithTimestamp(
      `History file not found at "${filePath}" — treating as empty history. ` +
        `If this happens on every CI run, the file isn't being persisted between runs.`,
    );
    return [];
  }

  const targetSheet = worksheetName || sheetName;
  const workbook: XLSX.WorkBook = XLSX.readFile(filePath);
  const sheet: XLSX.WorkSheet = workbook.Sheets[targetSheet];

  // If the requested sheet doesn't exist, return empty (first time for this club)
  if (!sheet) {
    logWithTimestamp(
      `Worksheet "${targetSheet}" not found in "${filePath}" (available sheets: ${workbook.SheetNames.join(", ")}) — treating as empty history.`,
    );
    return [];
  }

  const flatRows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet);

  const records: SlotHistoryRecord[] = flatRows.map(
    (row: Record<string, any>): SlotHistoryRecord => ({
      TimeSlot: {
        date: row.date,
        start: parseHourStringToDecimal(row.start),
        end: parseHourStringToDecimal(row.end),
      },
      becameAvailableAt: reversePrettyDateTime(row.becameAvailableAt),
      becameUnavailableAt: row.becameUnavailableAt
        ? reversePrettyDateTime(row.becameUnavailableAt)
        : undefined,
    }),
  );

  return records;
}

export function markUnavailableSlots(
  records: SlotHistoryRecord[],
  currentSlotKeys: Set<string>,
  scannedDates?: Set<string>,
  hourRange?: { startHour: number; endHour: number },
): void {
  const now: string = getCurrentDateTime();

  for (const record of records) {
    // Only mark slots whose date was actually scanned
    if (scannedDates && !scannedDates.has(record.TimeSlot.date)) {
      continue;
    }

    // Only mark slots whose start hour falls within the scanned hour range
    if (
      hourRange &&
      (record.TimeSlot.start < hourRange.startHour ||
        record.TimeSlot.start >= hourRange.endHour)
    ) {
      continue;
    }

    const key: string = slotKey(record.TimeSlot);
    const isCurrentlyAvailable: boolean = currentSlotKeys.has(key);

    if (!isCurrentlyAvailable && !record.becameUnavailableAt) {
      record.becameUnavailableAt = now;
    }
  }
}

function addNewSlots(
  records: SlotHistoryRecord[],
  currentSlots: TimeSlot[],
): void {
  const now: string = getCurrentDateTime();
  const activeKeys = new Set(
    records
      .filter((r) => !r.becameUnavailableAt)
      .map((r) => slotKey(r.TimeSlot)),
  );

  for (const slot of currentSlots) {
    const key = slotKey(slot);
    if (!activeKeys.has(key)) {
      records.push({
        TimeSlot: slot,
        becameAvailableAt: now,
      });
    }
  }
}

function sortSlotHistoryRecords(records: SlotHistoryRecord[]): void {
  records.sort((a, b) => {
    const dateA: Date = smartParseDate(a.TimeSlot.date, a.becameAvailableAt);
    const dateB: Date = smartParseDate(b.TimeSlot.date, b.becameAvailableAt);

    const timeCompare: number = dateB.getTime() - dateA.getTime();
    if (timeCompare !== 0) return timeCompare;

    return b.TimeSlot.start - a.TimeSlot.start;
  });
}

function writeSlotHistory(
  records: SlotHistoryRecord[],
  worksheetName?: string,
): void {
  sortSlotHistoryRecords(records);

  const flatRows: Record<string, string | number>[] = records.map(
    (r: SlotHistoryRecord) => ({
      date: r.TimeSlot.date,
      start: formatHourDecimalToTimeString(r.TimeSlot.start),
      end: formatHourDecimalToTimeString(r.TimeSlot.end),
      becameAvailableAt: prettyDateTime(r.becameAvailableAt),
      becameUnavailableAt: r.becameUnavailableAt
        ? prettyDateTime(r.becameUnavailableAt)
        : "",
    }),
  );

  const worksheet: XLSX.WorkSheet = XLSX.utils.json_to_sheet(flatRows, {
    header: [
      "date",
      "start",
      "end",
      "becameAvailableAt",
      "becameUnavailableAt",
    ],
  });

  const filePath = getHistoryFilePath();
  const targetSheet = worksheetName || sheetName;

  if (worksheetName) {
    // Per-club mode: read existing workbook, add/replace just this sheet
    let workbook: XLSX.WorkBook;
    if (fs.existsSync(filePath)) {
      workbook = XLSX.readFile(filePath);
    } else {
      workbook = XLSX.utils.book_new();
    }

    // Remove existing sheet with same name if it exists
    const sheetIdx = workbook.SheetNames.indexOf(targetSheet);
    if (sheetIdx !== -1) {
      workbook.SheetNames.splice(sheetIdx, 1);
      delete workbook.Sheets[targetSheet];
    }

    // Add the new sheet
    XLSX.utils.book_append_sheet(workbook, worksheet, targetSheet);
    XLSX.writeFile(workbook, filePath);
  } else {
    // Default mode: create fresh workbook (backward compatible)
    const workbook: XLSX.WorkBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, targetSheet);
    XLSX.writeFile(workbook, filePath);
  }
}

// Main function to update slot history
export function updateSlotHistoryExcel(
  currentSlots: TimeSlot[],
  scannedDates?: Set<string>,
  hourRange?: { startHour: number; endHour: number },
  worksheetName?: string,
): void {
  const currentSlotKeys: Set<string> = new Set(currentSlots.map(slotKey));
  const records: SlotHistoryRecord[] = loadSlotHistory(worksheetName);
  markUnavailableSlots(records, currentSlotKeys, scannedDates, hourRange);
  addNewSlots(records, currentSlots);
  writeSlotHistory(records, worksheetName);
}

/**
 * Returns only the slots that are newly available compared to the history records.
 */
export function findNewSlots(
  currentSlots: TimeSlot[],
  historyRecords: SlotHistoryRecord[],
): TimeSlot[] {
  const activeSlotKeys: Set<string> = new Set(
    historyRecords
      .filter((r) => !r.becameUnavailableAt)
      .map((r) => slotKey(r.TimeSlot)),
  );

  const newSlots: TimeSlot[] = currentSlots.filter(
    (slot) => !activeSlotKeys.has(slotKey(slot)),
  );

  return newSlots;
}

export function hasAnySlotBecomeUnavailable(
  currentSlots: TimeSlot[],
  previousRecords: SlotHistoryRecord[],
  scannedDates?: Set<string>,
  hourRange?: { startHour: number; endHour: number },
): boolean {
  const currentSlotKeys = new Set(currentSlots.map(slotKey));

  return previousRecords.some((record) => {
    // Only consider records whose date was actually scanned
    if (scannedDates && !scannedDates.has(record.TimeSlot.date)) {
      return false;
    }
    // Only consider records whose start hour falls within the scanned range
    if (
      hourRange &&
      (record.TimeSlot.start < hourRange.startHour ||
        record.TimeSlot.start >= hourRange.endHour)
    ) {
      return false;
    }

    const key = slotKey(record.TimeSlot);
    return !record.becameUnavailableAt && !currentSlotKeys.has(key);
  });
}

// --- File Lock Utilities ---

interface FileLockOptions {
  timeoutMs?: number;
  retryDelayMs?: number;
  staleLockMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Acquires an exclusive file lock by atomically creating a lock file.
 * Uses `fs.openSync(lockPath, 'wx')` which fails if the file already exists.
 * Implements polling with configurable retry delay, timeout, and stale lock detection.
 */
export async function acquireFileLock(
  lockPath: string,
  options: FileLockOptions = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 30000;
  const retryDelayMs = options.retryDelayMs ?? 150;
  const staleLockMs = options.staleLockMs ?? 60000;

  const startTime = Date.now();

  while (true) {
    try {
      const fd = fs.openSync(lockPath, "wx");
      fs.closeSync(fd);
      return; // Lock acquired successfully
    } catch (err: any) {
      if (err.code !== "EEXIST") {
        throw err; // Unexpected error, rethrow
      }

      // Lock file exists — check if it's stale
      try {
        const stat = fs.statSync(lockPath);
        const lockAge = Date.now() - stat.mtimeMs;
        if (lockAge > staleLockMs) {
          // Stale lock detected, remove and retry
          logWithTimestamp(
            `Stale lock detected at "${lockPath}" (age ${lockAge}ms > ${staleLockMs}ms). Removing and retrying. ` +
              `This may indicate a previous run crashed without releasing the lock.`,
          );
          fs.unlinkSync(lockPath);
          continue;
        }
      } catch (statErr: any) {
        // Lock file was removed between our open attempt and stat — retry
        if (statErr.code === "ENOENT") {
          continue;
        }
        throw statErr;
      }

      // Check timeout
      if (Date.now() - startTime >= timeoutMs) {
        throw new Error(
          `Failed to acquire file lock at "${lockPath}" within ${timeoutMs}ms`,
        );
      }

      // Wait before retrying
      await sleep(retryDelayMs);
    }
  }
}

/**
 * Releases a file lock by deleting the lock file.
 * Handles the case where the file doesn't exist gracefully (no-op).
 */
export function releaseFileLock(lockPath: string): void {
  try {
    fs.unlinkSync(lockPath);
  } catch (err: any) {
    if (err.code !== "ENOENT") {
      throw err; // Unexpected error, rethrow
    }
    // File doesn't exist — no-op
  }
}

/**
 * Wraps a callback in a file lock, ensuring exclusive access to the slot history file.
 * The lock is acquired before the callback executes and released in a finally block.
 */
export async function withSlotHistoryLock<T>(
  callback: () => Promise<T>,
): Promise<T> {
  const historyFilePath = getHistoryFilePath();
  const dir = path.dirname(historyFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const lockPath = path.resolve(dir, `slot_history_${TELEGRAM_CHAT_ID}.lock`);

  await acquireFileLock(lockPath);
  try {
    return await callback();
  } finally {
    releaseFileLock(lockPath);
  }
}
