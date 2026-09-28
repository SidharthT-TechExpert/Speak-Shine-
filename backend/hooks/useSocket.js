let sharedSocket = null;

/**
 * Set the shared socket instance (typically called during server initialization)
 * @param {Socket} socket - The Socket.io instance
 */
export function setSharedSocket(socket) {
  sharedSocket = socket;
}

/**
 * Get the shared socket instance for broadcasting events
 * @returns {Socket|null} - The Socket.io instance or null if not initialized
 */
export function getSharedSocket() {
  return sharedSocket;
}

/**
 * Clear the shared socket instance
 */
export function clearSharedSocket() {
  sharedSocket = null;
}
