// Club configuration types (discriminated union)

export interface BaseClubConfig {
  name: string;
  provider: "playbypoint" | "matchpointer" | "goplay";
}

export interface PlayByPointClubConfig extends BaseClubConfig {
  provider: "playbypoint";
  facilityId: string;
}

export interface MatchPointerClubConfig extends BaseClubConfig {
  provider: "matchpointer";
  venueId: string;
}

export interface GoPlayClubConfig extends BaseClubConfig {
  provider: "goplay";
  facilityId: string;
}

export type ClubConfig =
  | PlayByPointClubConfig
  | MatchPointerClubConfig
  | GoPlayClubConfig;

// GoPlay API response types

export interface GoPlayCourtAvailability {
  court_id: string;
  court_name: string;
  court_position: number;
  duration_options: number[]; // minutes, e.g. [60, 90, 120]
}

export interface GoPlayAvailableSlot {
  start_time: string; // "HH:MM" format
  available_courts: GoPlayCourtAvailability[];
}

export interface GoPlayFacilityResponse {
  facility_id: string;
  facility_name: string;
  date: string;
  slots: GoPlayAvailableSlot[];
}

// MatchPointer API data structures

export interface MatchPointerVenue {
  id: number;
  name: string;
  opening_hours: MatchPointerOpeningHours;
}

export interface MatchPointerOpeningHours {
  timeRanges: DayTimeRange[];
}

export interface DayTimeRange {
  day: number; // 0=Sunday, 1=Monday, ..., 6=Saturday
  isOpen: boolean;
  ranges: TimeRange[];
}

export interface TimeRange {
  start: string; // "HH:MM" format
  end: string; // "HH:MM" format
}

export interface MatchPointerCourt {
  id: number;
  name: string;
  venue_id: number;
  is_active: boolean;
}

export interface MatchPointerReservationSlot {
  id: number;
  court_id: number;
  date: string; // "YYYY-MM-DD"
  start_time: string; // "HH:MM"
  end_time: string; // "HH:MM"
  status: string;
}

// Existing types

export interface TimeSlot {
  date: string;
  start: number;
  end: number;
}

export interface ApiSlot {
  facility_schedule_id: number;
  schedule: string; // e.g. "6-6:30am"
  shift: string;
  available: boolean;
  seconds_from_midnight: number;
  in_waitlist: boolean;
  group: number;
}

export interface SlotHistoryRecord {
  TimeSlot: TimeSlot;
  becameAvailableAt: string;
  becameUnavailableAt?: string;
}

interface BaseScanOptions {
  startHour: number;
  endHour: number;
  minPlaytimeHours: number;
}

interface OffsetModeScanOptions extends BaseScanOptions {
  startDate: Date;
  endDate: Date;
  skipWeekend?: boolean;
  skipWeekdays?: number[];
  specificDates?: never;
}

interface SpecificDatesModeScanOptions extends BaseScanOptions {
  specificDates: Date[];
  startDate?: never;
  endDate?: never;
  skipWeekend?: never;
  skipWeekdays?: never;
}

export type ScanCourtSlotsOptions =
  | OffsetModeScanOptions
  | SpecificDatesModeScanOptions;
