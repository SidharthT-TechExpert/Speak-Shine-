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

/**
 * Get start of day in IST timezone
 * @param {Date} date - Date object
 * @returns {Date} - Start of day in IST
 */
export function getISTStartOfDay(date = new Date()) {
  const istDate = new Date(date.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  istDate.setHours(0, 0, 0, 0);
  return istDate;
}

/**
 * Get end of day in IST timezone
 * @param {Date} date - Date object
 * @returns {Date} - End of day in IST
 */
export function getISTEndOfDay(date = new Date()) {
  const istDate = new Date(date.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  istDate.setHours(23, 59, 59, 999);
  return istDate;
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
