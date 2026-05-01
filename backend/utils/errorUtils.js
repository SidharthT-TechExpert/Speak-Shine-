/**
 * Error Utilities
 * Helper functions for error handling and custom errors
 */

/**
 * Create a custom error with status code
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code
 * @returns {Error} - Error object with statusCode property
 */
export function createError(message, statusCode = 500) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

/**
 * Create a 400 Bad Request error
 * @param {string} message - Error message
 * @returns {Error} - Error object
 */
export function badRequest(message) {
  return createError(message, 400);
}

/**
 * Create a 401 Unauthorized error
 * @param {string} message - Error message
 * @returns {Error} - Error object
 */
export function unauthorized(message = "Unauthorized") {
  return createError(message, 401);
}

/**
 * Create a 403 Forbidden error
 * @param {string} message - Error message
 * @returns {Error} - Error object
 */
export function forbidden(message = "Forbidden") {
  return createError(message, 403);
}

/**
 * Create a 404 Not Found error
 * @param {string} message - Error message
 * @returns {Error} - Error object
 */
export function notFound(message = "Not found") {
  return createError(message, 404);
}

/**
 * Create a 409 Conflict error
 * @param {string} message - Error message
 * @returns {Error} - Error object
 */
export function conflict(message) {
  return createError(message, 409);
}

/**
 * Create a 422 Unprocessable Entity error
 * @param {string} message - Error message
 * @returns {Error} - Error object
 */
export function unprocessableEntity(message) {
  return createError(message, 422);
}

/**
 * Create a 500 Internal Server Error
 * @param {string} message - Error message
 * @returns {Error} - Error object
 */
export function internalServerError(message = "Internal server error") {
  return createError(message, 500);
}

/**
 * Create a 503 Service Unavailable error
 * @param {string} message - Error message
 * @returns {Error} - Error object
 */
export function serviceUnavailable(message = "Service unavailable") {
  return createError(message, 503);
}

/**
 * Check if error has status code
 * @param {Error} error - Error object
 * @returns {boolean} - True if error has statusCode property
 */
export function hasStatusCode(error) {
  return error && typeof error.statusCode === "number";
}

/**
 * Get status code from error or default
 * @param {Error} error - Error object
 * @param {number} defaultCode - Default status code
 * @returns {number} - Status code
 */
export function getStatusCode(error, defaultCode = 500) {
  return hasStatusCode(error) ? error.statusCode : defaultCode;
}

/**
 * Format error for API response
 * @param {Error} error - Error object
 * @param {boolean} includeStack - Include stack trace (dev only)
 * @returns {Object} - Formatted error object
 */
export function formatErrorResponse(error, includeStack = false) {
  const response = {
    error: error.message || "An error occurred",
  };
  
  if (includeStack && error.stack) {
    response.stack = error.stack;
  }
  
  return response;
}
