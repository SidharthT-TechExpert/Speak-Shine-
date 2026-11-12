/**
 * Normalize Indian phone numbers for DB lookups and socket routing.
 * Auth JWT, User.phone, and VideoReport.phone may use different formats.
 */

/**
 * Normalize an Indian phone number to its 10-digit form when possible without
 * corrupting valid 10-digit numbers that legitimately start with "91".
 */
export function normalizeIndianPhone(phone) {
  if (typeof phone !== "string") return "";
  const raw = phone.trim();
  const digits = raw.replace(/\D/g, "");
  if (digits.length > 10 && digits.startsWith("91")) {
    return digits.slice(2);
  }
  return digits || raw;
}

export function phoneVariants(phone) {
  if (!phone) return [];
  const raw = String(phone).trim();
  const digits = raw.replace(/\D/g, "");
  const normalized = digits.length > 10 && digits.startsWith("91") ? digits.slice(2) : digits;
  const variants = new Set();
  if (raw) variants.add(raw);
  if (digits) variants.add(digits);
  if (normalized) {
    variants.add(normalized);
    variants.add(`91${normalized}`);
    variants.add(`+91${normalized}`);
  }
  return [...variants];
}

/** MongoDB query filter: { recipientPhone: { $in: variants } } */
export function phoneInQuery(phone) {
  const variants = phoneVariants(phone);
  return variants.length ? { $in: variants } : phone;
}

/**
 * Find socket id for a user across phone format variants.
 * @param {Map<string, string>} onlineUsers
 */
export function resolveOnlineSocketId(onlineUsers, phone) {
  if (!onlineUsers || !phone) return null;
  for (const variant of phoneVariants(phone)) {
    const socketId = onlineUsers.get(variant);
    if (socketId) return socketId;
  }
  return null;
}
