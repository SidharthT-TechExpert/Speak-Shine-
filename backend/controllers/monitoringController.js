/**
 * Monitoring Controller
 * HTTP handlers for system monitoring endpoints
 */

import { getMonitoringData } from "../services/monitoring/monitoringService.js";

/**
 * GET /api/monitoring
 * Get real-time system monitoring data
 * Admin only
 */
export async function getMonitoring(req, res) {
  try {
    const data = await getMonitoringData();
    res.json(data);
  } catch (error) {
    console.error("[MonitoringController] Get monitoring error:", error);
    res.status(500).json({ error: error.message });
  }
}

