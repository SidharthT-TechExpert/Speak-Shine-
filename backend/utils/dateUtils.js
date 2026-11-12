/**
 * Date Utilities
 * Helper functions for date manipulation and formatting
 */

/**
 * Normalize date to UTC midnight for consistent day boundaries
 * @param {string|Date} dateInput - Date string (YYYY-MM-DD) or Date object
 * @returns {Date} - Date normalized to UTC midnight
 */
export function normalizeToUTCMidnight(dateInput) {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export const IST_OFFSET_MS = 330 * 60 * 1000;

/**
 * Get IST wall-clock components safely regardless of OS/container timezone.
 * @param {Date|string|number} [date=new Date()]
 */
export function getISTParts(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const shifted = new Date(d.getTime() + IST_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth(); // 0-indexed
  const day = shifted.getUTCDate();
  const weekday = shifted.getUTCDay();
  const hours = shifted.getUTCHours();
  const minutes = shifted.getUTCMinutes();
  const seconds = shifted.getUTCSeconds();
  const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const timeStr = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  return { year, month, day, weekday, hours, minutes, seconds, dateStr, timeStr };
}

/**
 * Get IST "YYYY-MM-DD" date key safely regardless of OS timezone.
 * @param {Date|string|number} [date=new Date()]
 * @returns {string}
 */
export function getISTDateKey(date = new Date()) {
  return getISTParts(date).dateStr;
}

/**
 * Get start of day in IST timezone as a UTC Date.
 * @param {Date|string|number} [date=new Date()] - Date object
 * @returns {Date} - Start of day in IST
 */
export function getISTStartOfDay(date = new Date()) {
  const { dateStr } = getISTParts(date);
  return new Date(`${dateStr}T00:00:00.000+05:30`);
}

/**
 * Get end of day in IST timezone as a UTC Date.
 * @param {Date|string|number} [date=new Date()] - Date object
 * @returns {Date} - End of day in IST
 */
export function getISTEndOfDay(date = new Date()) {
  const { dateStr } = getISTParts(date);
  return new Date(`${dateStr}T23:59:59.999+05:30`);
}

/**
 * Get [start, endExclusive) bounds for an IST calendar day.
 * @param {Date|string|number} [date=new Date()]
 */
export function getISTDayBounds(date = new Date()) {
  const start = getISTStartOfDay(date);
  const endExclusive = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, endExclusive };
}

/**
 * Construct a Date at a specific IST wall-clock time on an IST date ("YYYY-MM-DD" and "HH:MM").
 * @param {string} dateStr - YYYY-MM-DD
 * @param {string} [timeStr="00:00"] - HH:MM
 * @returns {Date}
 */
export function parseISTDateTime(dateStr, timeStr = "00:00") {
  const cleanDate = String(dateStr || "").split("T")[0].trim();
  const cleanTime = String(timeStr || "00:00").trim();
  return new Date(`${cleanDate}T${cleanTime}:00+05:30`);
}

/**
 * Format date for display (DD/MM/YYYY)
 * @param {Date} date - Date object
 * @returns {string} - Formatted date string
 */
export function formatDateForDisplay(date) {
  if (!date) return "";
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Format date and time for display (DD/MM/YYYY HH:MM)
 * @param {Date} date - Date object
 * @returns {string} - Formatted date and time string
 */
export function formatDateTimeForDisplay(date) {
  if (!date) return "";
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

/**
 * Check if date is today
 * @param {Date} date - Date object
 * @returns {boolean} - True if date is today
 */
export function isToday(date) {
  const today = new Date();
  const d = new Date(date);
  return d.getDate() === today.getDate() &&
         d.getMonth() === today.getMonth() &&
         d.getFullYear() === today.getFullYear();
}

/**
 * Get date range for current week
 * @returns {Object} - { start: Date, end: Date }
 */
export function getCurrentWeekRange() {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const start = new Date(now);
  start.setDate(now.getDate() - dayOfWeek);
  start.setHours(0, 0, 0, 0);
  
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  
  return { start, end };
}

/**
 * Get date range for current month
 * @returns {Object} - { start: Date, end: Date }
 */
export function getCurrentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

/**
 * Add days to a date
 * @param {Date} date - Date object
 * @param {number} days - Number of days to add
 * @returns {Date} - New date
 */
export function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Validate date string format (YYYY-MM-DD)
 * @param {string} dateString - Date string
 * @returns {boolean} - True if valid
 */
export function isValidDateString(dateString) {
  if (!dateString) return false;
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) return false;
  const date = new Date(dateString);
  return !isNaN(date.getTime());
}
