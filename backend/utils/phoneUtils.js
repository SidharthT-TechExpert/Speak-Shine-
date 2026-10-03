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
 * Get all possible phone number variations used across the app.
 * Covers 10-digit, +91, 91, and space-formatted values.
 * @param {string} phone - Phone number
 * @returns {string[]} - Array of normalized phone variants
 */
export function getPhoneVariations(phone) {
  if (!phone) return [];
  const raw = String(phone).trim();
  const digits = raw.replace(/\D/g, "");
  const normalized = digits.replace(/^91/, "");

  const candidates = new Set();
  for (const value of [raw, digits, normalized, `91${normalized}`, `+91${normalized}`]) {
    if (!value) continue;
    candidates.add(String(value).trim());
  }
  if (normalized.length === 10) {
    candidates.add(normalized);
    candidates.add(`91${normalized}`);
    candidates.add(`+91${normalized}`);
  }
  return [...candidates];
}

/**
 * Canonical wallet lookup variants to resolve a user from any stored formatting.
 * @param {string} phone - Raw phone value from request or DB
 * @returns {string[]} - Unique variants to try in order
 */
export function getPhoneLookupVariants(phone) {
  const variants = getPhoneVariations(phone);
  const ordered = [];
  const seen = new Set();

  for (const variant of variants) {
    const clean = String(variant).trim();
    if (!clean || seen.has(clean)) continue;
    ordered.push(clean);
    seen.add(clean);
  }

  const bareDigits = String(phone || "").replace(/\D/g, "");
  if (bareDigits.length === 10) {
    const bare = bareDigits;
    const with91 = `91${bare}`;
    const withPlus91 = `+91${bare}`;
    for (const variant of [bare, with91, withPlus91]) {
      if (!seen.has(variant)) {
        ordered.push(variant);
        seen.add(variant);
      }
    }
  }

  return ordered;
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

import User from "../../models/userSchema.js";

/**
 * Find User document by phone using all canonical format variations,
 * matching phone field, userId prefix, case-insensitive regex, and bare 10-digit number.
 * @param {string} phone - Raw phone number or contact string
 * @returns {Promise<Document|null>} - User document or null
 */
export async function findUserByPhone(phone) {
  if (!phone) return null;
  const candidates = [...new Set(getPhoneLookupVariants(phone))];

  for (const candidate of candidates) {
    let user = await User.findOne({ phone: candidate });
    if (user) return user;

    user = await User.findOne({
      userId: { $regex: `^${escapeRegex(candidate)}(@|:)` },
    });
    if (user) return user;
  }

  for (const candidate of candidates) {
    const user = await User.findOne({ phone: { $regex: new RegExp(`^${escapeRegex(candidate)}$`, "i") } });
    if (user) return user;
  }

  const bare = String(phone).replace(/\D/g, "").replace(/^91/, "").slice(-10);
  if (bare.length === 10) {
    const user = await User.findOne({ userId: { $regex: `^(91)?${escapeRegex(bare)}(@|:)` } });
    if (user) return user;
  }

  return null;
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
