/**
 * Date utility functions for local time-zone aware operations.
 */

/**
 * Returns a YYYY-MM-DD date string formatted in the local time zone.
 */
export function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Returns a YYYY-MM-DD date string for N days ago in local time.
 */
export function getLocalDaysAgoString(days: number, fromDate: Date = new Date()): string {
  const d = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate() - days);
  return getLocalDateString(d);
}

/**
 * Returns a YYYY-MM-DD date string for N days ahead in local time.
 */
export function getLocalDaysAheadString(days: number, fromDate: Date = new Date()): string {
  const d = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate() + days);
  return getLocalDateString(d);
}
