import { formatInTimeZone, toZonedTime, fromZonedTime } from "date-fns-tz";
import { startOfDay, endOfDay, subDays } from "date-fns";

export type DateRangeType = "today" | "yesterday" | "7d" | "30d" | "all";

export interface DateWindow {
  startTs: string; // ISO timestamp
  endTs: string; // ISO timestamp
  label: string;
  timezone: string;
}

const DEFAULT_TIMEZONE = "America/New_York";

/**
 * Get the user's timezone or fall back to default
 */
export function getUserTimezone(profileTimezone?: string | null): string {
  return profileTimezone || DEFAULT_TIMEZONE;
}

/**
 * Calculate date window boundaries based on the user's timezone.
 * "Today" is midnight→midnight in the selected timezone.
 * 
 * @param range - The date range type (today, yesterday, 7d, 30d, all)
 * @param timezone - IANA timezone string (e.g., "America/New_York")
 * @returns DateWindow with ISO timestamps for startTs and endTs
 */
export function getDateWindow(
  range: DateRangeType,
  timezone: string = DEFAULT_TIMEZONE
): DateWindow {
  // Get current time in the user's timezone
  const now = new Date();
  const nowInTz = toZonedTime(now, timezone);
  
  let startDate: Date;
  let endDate: Date;
  let label: string;
  
  switch (range) {
    case "today": {
      // Start of today in user's timezone
      const todayStart = startOfDay(nowInTz);
      const todayEnd = endOfDay(nowInTz);
      
      // Convert back to UTC for database queries
      startDate = fromZonedTime(todayStart, timezone);
      endDate = fromZonedTime(todayEnd, timezone);
      label = "Today";
      break;
    }
    
    case "yesterday": {
      const yesterdayInTz = subDays(nowInTz, 1);
      const yesterdayStart = startOfDay(yesterdayInTz);
      const yesterdayEnd = endOfDay(yesterdayInTz);
      
      startDate = fromZonedTime(yesterdayStart, timezone);
      endDate = fromZonedTime(yesterdayEnd, timezone);
      label = "Yesterday";
      break;
    }
    
    case "7d": {
      const weekAgoInTz = subDays(nowInTz, 7);
      const weekStart = startOfDay(weekAgoInTz);
      const todayEnd = endOfDay(nowInTz);
      
      startDate = fromZonedTime(weekStart, timezone);
      endDate = fromZonedTime(todayEnd, timezone);
      label = "Last 7 Days";
      break;
    }
    
    case "30d": {
      const monthAgoInTz = subDays(nowInTz, 30);
      const monthStart = startOfDay(monthAgoInTz);
      const todayEnd = endOfDay(nowInTz);
      
      startDate = fromZonedTime(monthStart, timezone);
      endDate = fromZonedTime(todayEnd, timezone);
      label = "Last 30 Days";
      break;
    }
    
    case "all":
    default: {
      // For "all time", use a very old start date and far future end
      startDate = new Date("2020-01-01T00:00:00Z");
      endDate = new Date("2099-12-31T23:59:59Z");
      label = "All Time";
      break;
    }
  }
  
  return {
    startTs: startDate.toISOString(),
    endTs: endDate.toISOString(),
    label,
    timezone,
  };
}

/**
 * Format a date for display in the user's timezone
 */
export function formatDateInUserTimezone(
  date: Date | string,
  format: string,
  timezone: string = DEFAULT_TIMEZONE
): string {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  return formatInTimeZone(dateObj, timezone, format);
}

/**
 * Get the current date string in user's timezone (YYYY-MM-DD)
 */
export function getTodayDateString(timezone: string = DEFAULT_TIMEZONE): string {
  return formatInTimeZone(new Date(), timezone, "yyyy-MM-dd");
}

/**
 * Check if a timestamp falls within today in the user's timezone
 */
export function isToday(
  timestamp: string | Date,
  timezone: string = DEFAULT_TIMEZONE
): boolean {
  const window = getDateWindow("today", timezone);
  const ts = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
  return ts >= new Date(window.startTs) && ts <= new Date(window.endTs);
}

/**
 * Common timezone options for dropdown
 */
export const TIMEZONE_OPTIONS = [
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Phoenix", label: "Arizona (MST)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "America/Anchorage", label: "Alaska Time (AKT)" },
  { value: "Pacific/Honolulu", label: "Hawaii Time (HT)" },
  { value: "UTC", label: "UTC" },
] as const;

/**
 * Get display label for a timezone
 */
export function getTimezoneLabel(timezone: string): string {
  const option = TIMEZONE_OPTIONS.find((tz) => tz.value === timezone);
  return option?.label || timezone;
}
