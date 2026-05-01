/**
 * virusScanner.js — Virus scanning for uploaded files
 * Integrates with ClamAV for malware detection
 */

import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";

const execFileAsync = promisify(execFile);

// Check if ClamAV is available
let clamAvailable = null;

async function checkClamAvailability() {
  if (clamAvailable !== null) return clamAvailable;
  
  try {
    await execFileAsync('clamscan', ['--version'], { timeout: 5000 });
    clamAvailable = true;
    console.log('[VirusScanner] ClamAV is available');
  } catch (err) {
    clamAvailable = false;
    console.log('[VirusScanner] ClamAV not available - virus scanning disabled');
  }
  
  return clamAvailable;
}

/**
 * Scan a file for viruses using ClamAV
 * @param {string} filePath - Path to file to scan
 * @returns {Promise<{clean: boolean, threat?: string, error?: string}>}
 */
export async function scanFile(filePath) {
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    return { clean: false, error: 'File not found' };
  }

  // Check if ClamAV is available
  const available = await checkClamAvailability();
  if (!available) {
    // If ClamAV is not installed, skip scanning (don't block uploads)
    // In production, you should either:
    // 1. Make ClamAV mandatory and reject uploads if not available
    // 2. Use a cloud-based scanning service as fallback
    console.warn('[VirusScanner] Skipping scan - ClamAV not available');
    return { clean: true, skipped: true };
  }

  try {
    // Run clamscan with options:
    // --no-summary: Don't print summary
    // --infected: Only print infected files
    // --stdout: Write to stdout instead of stderr
    const { stdout, stderr } = await execFileAsync('clamscan', [
      '--no-summary',
      '--infected',
      '--stdout',
      filePath
    ], { timeout: 60000 }); // 60 second timeout

    // If clamscan exits with code 0, file is clean
    return { clean: true };

  } catch (err) {
    // clamscan exits with code 1 if virus found
    if (err.code === 1) {
      // Parse output to get threat name
      const output = err.stdout || err.stderr || '';
      const match = output.match(/FOUND:\s*(.+)/i);
      const threat = match ? match[1].trim() : 'Unknown threat';
      
      console.warn(`[VirusScanner] Threat detected: ${threat}`);
      return { clean: false, threat };
    }

    // Other errors (timeout, clamscan error, etc.)
    console.error('[VirusScanner] Scan error:', err.message);
    return { clean: false, error: err.message };
  }
}

/**
 * Scan file with detailed result
 */
export async function scanFileDetailed(filePath) {
  const startTime = Date.now();
  const result = await scanFile(filePath);
  const scanTime = Date.now() - startTime;

  return {
    ...result,
    scanTime,
    filePath,
    fileSize: fs.existsSync(filePath) ? fs.statSync(filePath).size : 0,
  };
}

/**
 * Check ClamAV daemon status (for health checks)
 */
export async function checkClamDaemonStatus() {
  try {
    // Try to ping clamd daemon
    await execFileAsync('clamdscan', ['--ping'], { timeout: 5000 });
    return { available: true, daemon: true };
  } catch (err) {
    // Daemon not available, check if clamscan is available
    const available = await checkClamAvailability();
    return { available, daemon: false };
  }
}

/**
 * Get ClamAV version info
 */
export async function getClamVersion() {
  try {
    const { stdout } = await execFileAsync('clamscan', ['--version'], { timeout: 5000 });
    return stdout.trim();
  } catch (err) {
    return null;
  }
}

/**
 * Update virus definitions (should be run periodically)
 */
export async function updateDefinitions() {
  try {
    console.log('[VirusScanner] Updating virus definitions...');
    await execFileAsync('freshclam', [], { timeout: 300000 }); // 5 min timeout
    console.log('[VirusScanner] Definitions updated successfully');
    return { success: true };
  } catch (err) {
    console.error('[VirusScanner] Failed to update definitions:', err.message);
    return { success: false, error: err.message };
  }
}

// Initialize on module load
checkClamAvailability();
