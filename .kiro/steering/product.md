---
inclusion: always
---

# Product Context

Court slot availability scanner for padel facilities. Polls booking provider APIs on a schedule, detects newly available time slots, and sends Telegram notifications. Designed to run as a cron job.

## Core Domain Concepts

- **TimeSlot**: A bookable window defined by `{ date, start, end }` where `start`/`end` are hours (integers).
- **Bookable block**: At least `minPlaytimeHours` worth of consecutive 30-minute API slots (configurable, default 1.5h = 3 slots).
- **Slot history**: Per-club Excel worksheet tracking when slots became available/unavailable. Used to avoid duplicate notifications and detect availability changes.
- **Club**: A facility configured with a provider type and ID. Multiple clubs are scanned per run.

## Supported Providers

| Provider       | ID field     | API module                  |
| -------------- | ------------ | --------------------------- |
| `playbypoint`  | `facilityId` | `playByPointSlots.util.ts`  |
| `matchpointer` | `venueId`    | `matchPointerSlots.util.ts` |
| `goplay`       | `facilityId` | `goplaySlots.util.ts`       |

Club configs are provided as a JSON array in the `CLUBS` env var and parsed/validated at runtime.

## Scan Modes

1. **Offset mode** (default): Scans a date range from `today + startOffset` to `today + endOffset`. Supports skipping weekends or specific weekdays.
2. **Specific dates mode**: Scans an explicit comma-separated list of dates. Cannot be combined with offset/skip params.

Both modes filter slots by an hour range (`SCAN_START_HOUR` to `SCAN_END_HOUR`).

## Notification Logic

1. Fetch available slots from provider API for each club.
2. Load that club's slot history from `data/slot_history_{clubName}.xlsx`.
3. Compare current slots to history — identify new slots (never seen or previously marked unavailable).
4. If new slots found → send Telegram message, update Excel.
5. If no new slots but some previously-available slots disappeared → update Excel (no notification).
6. Otherwise → no action.

## Concurrency

Slot history Excel read/write is protected by a file lock (`data/slot_history.lock`) to prevent corruption from parallel runs.

## Key Behavioral Rules

- A slot is "new" only if it has no matching history record or was previously marked unavailable.
- Past dates in specific-dates mode are silently skipped (logged, not scanned).
- Each club gets its own worksheet in the Excel file, keyed by club name.
- The scanner tolerates individual club failures gracefully — one club error does not stop the run.
