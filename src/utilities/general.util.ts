import { formatHourDecimalToTimeString, sleep } from "./date.utils";
import { TimeSlot } from "./types.util";

/**
 * Run async tasks with a bounded concurrency and a jittered delay before each
 * task (after the first slot in each worker). Preserves input order in the
 * returned results array. Used to avoid synchronized request bursts against
 * provider APIs.
 */
export async function runThrottled<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
  delayMsFn: () => number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const current = nextIndex++;
      if (current >= tasks.length) return;
      if (current >= concurrency) {
        await sleep(delayMsFn());
      }
      results[current] = await tasks[current]();
    }
  }

  const workerCount = Math.min(concurrency, tasks.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}

function formatSlotLine(slot: TimeSlot): string {
  return `• Free court on ${slot.date} between ${formatHourDecimalToTimeString(
    slot.start,
  )} and ${formatHourDecimalToTimeString(slot.end)}`;
}

export function formatCourtMessage(
  clubName: string,
  newSlots: TimeSlot[],
  oldSlots: TimeSlot[],
): string {
  if (newSlots.length === 0 && oldSlots.length === 0) {
    return "No free court slots found.";
  }

  const sections: string[] = [`🏟️ ${clubName}`];

  if (newSlots.length > 0) {
    const lines = newSlots.map(formatSlotLine);
    sections.push(`🆕 New slots found:\n${lines.join("\n\n")}`);
  }

  if (oldSlots.length > 0) {
    const lines = oldSlots.map(formatSlotLine);
    sections.push(`📋 Previously found slots:\n${lines.join("\n\n")}`);
  }

  return sections.join("\n\n");
}
