/**
 * Validation Utilities
 * Helper functions for input validation
 */

/**
 * Validate email format
 * @param {string} email - Email address
 * @returns {boolean} - True if valid
 */
export function isValidEmail(email) {
  if (!email) return false;
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

/**
 * Validate password strength
 * Requirements: 8+ chars, uppercase, lowercase, number, special character
 * @param {string} password - Password
 * @returns {Object} - { valid: boolean, errors: string[] }
 */
export function validatePassword(password) {
  const errors = [];
  
  if (!password) {
    errors.push("Password is required");
    return { valid: false, errors };
  }
  
  if (password.length < 8) {
    errors.push("Password must be at least 8 characters");
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }
  
  if (!/[0-9]/.test(password)) {
    errors.push("Password must contain at least one number");
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password)) {
    errors.push("Password must contain at least one special character (!@#$%^&* etc.)");
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate time format (HH:MM)
 * @param {string} time - Time string
 * @returns {boolean} - True if valid
 */
export function isValidTimeFormat(time) {
  if (!time) return false;
  const regex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  return regex.test(time);
}

/**
 * Validate URL format
 * @param {string} url - URL string
 * @returns {boolean} - True if valid
 */
export function isValidUrl(url) {
  if (!url) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate video MIME type
 * @param {string} mimeType - MIME type
 * @returns {boolean} - True if valid video type
 */
export function isValidVideoMimeType(mimeType) {
  const allowedTypes = [
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/x-msvideo',
    'video/mpeg',
    'video/x-matroska',
    'video/x-ms-wmv'
  ];
  return allowedTypes.includes(mimeType);
}

/**
 * Validate file size
 * @param {number} size - File size in bytes
 * @param {number} maxSize - Maximum size in bytes
 * @returns {boolean} - True if valid
 */
export function isValidFileSize(size, maxSize) {
  return size > 0 && size <= maxSize;
}

/**
 * Sanitize string input (remove HTML tags)
 * @param {string} input - Input string
 * @returns {string} - Sanitized string
 */
export function sanitizeString(input) {
  if (!input) return "";
  return input.replace(/<[^>]*>/g, "").trim();
}

/**
 * Validate required fields
 * @param {Object} data - Data object
 * @param {string[]} requiredFields - Array of required field names
 * @returns {Object} - { valid: boolean, missing: string[] }
 */
export function validateRequiredFields(data, requiredFields) {
  const missing = [];
  
  for (const field of requiredFields) {
    if (!data[field]) {
      missing.push(field);
    }
  }
  
  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Validate enum value
 * @param {any} value - Value to validate
 * @param {any[]} allowedValues - Array of allowed values
 * @returns {boolean} - True if valid
 */
export function isValidEnum(value, allowedValues) {
  return allowedValues.includes(value);
}

/**
 * Validate number range
 * @param {number} value - Number to validate
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {boolean} - True if valid
 */
export function isInRange(value, min, max) {
  return typeof value === "number" && value >= min && value <= max;
}

/**
 * Validate MongoDB ObjectId format
 * @param {string} id - ID string
 * @returns {boolean} - True if valid ObjectId
 */
export function isValidObjectId(id) {
  if (!id) return false;
  return /^[0-9a-fA-F]{24}$/.test(id);
}
