/**
 * Phone Number Utilities
 * Helper functions for phone number normalization and validation
 */

/**
 * Normalize phone number by removing country code
 * @param {string} phone - Phone number with or without country code
 * @returns {string} - Phone number without country code
 */
export function stripCountryCode(phone) {
  if (!phone) return "";
  return phone.replace(/^91/, "");
}

/**
 * Add country code to phone number if not present
 * @param {string} phone - Phone number
 * @returns {string} - Phone number with country code
 */
export function addCountryCode(phone) {
  if (!phone) return "";
  const stripped = stripCountryCode(phone);
  return `91${stripped}`;
}

/**
 * Get all possible phone number variations
 * @param {string} phone - Phone number
 * @returns {string[]} - Array of phone number variations
 */
export function getPhoneVariations(phone) {
  if (!phone) return [];
  const stripped = stripCountryCode(phone);
  return [phone, stripped, `91${stripped}`];
}

/**
 * Validate Indian phone number format
 * @param {string} phone - Phone number to validate
 * @returns {boolean} - True if valid
 */
export function isValidIndianPhone(phone) {
  if (!phone) return false;
  const stripped = stripCountryCode(phone);
  // Indian mobile numbers are 10 digits starting with 6-9
  return /^[6-9]\d{9}$/.test(stripped);
}

/**
 * Escape a string for safe use inside a MongoDB $regex query.
 * Prevents regex injection when phone numbers contain special characters.
 * @param {string} str - Raw string to escape
 * @returns {string} - Regex-safe string
 */
export function escapeRegex(str) {
  if (!str) return "";
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Format phone number for display
 * @param {string} phone - Phone number
 * @returns {string} - Formatted phone number (e.g., +91 98765 43210)
 */
export function formatPhoneForDisplay(phone) {
  if (!phone) return "";
  const stripped = stripCountryCode(phone);
  if (stripped.length === 10) {
    return `+91 ${stripped.slice(0, 5)} ${stripped.slice(5)}`;
  }
  return phone;
}
