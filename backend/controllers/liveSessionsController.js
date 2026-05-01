/**
 * Live Sessions Controller
 * HTTP request handlers for live session endpoints
 */

import * as liveSessionsService from "../services/liveSessions/liveSessionsService.js";

/**
 * GET /api/live-sessions - List all sessions
 */
export async function listSessions(req, res) {
  try {
    const { status } = req.query;
    const result = await liveSessionsService.listSessions(status);
    res.json(result);
  } catch (error) {
    console.error("[LiveSessions] List sessions error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/live-sessions/:id - Get session by ID
 */
export async function getSessionById(req, res) {
  try {
    const result = await liveSessionsService.getSessionById(req.params.id);
    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error("[LiveSessions] Get session by ID error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/live-sessions - Create a new session (admin/trainer)
 */
export async function createSession(req, res) {
  try {
    const { title, scheduledAt, description } = req.body;
    const createdBy = req.user.phone;
    
    const result = await liveSessionsService.createSession(title, scheduledAt, description, createdBy);
    res.status(201).json(result);
  } catch (error) {
    console.error("[LiveSessions] Create session error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/live-sessions/:id/start - Start a session (admin/trainer)
 */
export async function startSession(req, res) {
  try {
    const io = req.app.get("io");
    const result = await liveSessionsService.startSession(req.params.id, io);
    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error("[LiveSessions] Start session error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/live-sessions/:id/token - Generate LiveKit token
 */
export async function generateSessionToken(req, res) {
  try {
    const identity = req.user.phone;
    const name = req.user.name || identity;
    const isAdmin = req.user.role === "admin";
    
    const result = await liveSessionsService.generateSessionToken(
      req.params.id, 
      identity, 
      name, 
      isAdmin
    );
    
    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error("[LiveSessions] Generate token error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/live-sessions/:id/end - End a session (admin/trainer)
 */
export async function endSession(req, res) {
  try {
    const io = req.app.get("io");
    const result = await liveSessionsService.endSession(req.params.id, io);
    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error("[LiveSessions] End session error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * DELETE /api/live-sessions/:id - Cancel a scheduled session (admin/trainer)
 */
export async function cancelSession(req, res) {
  try {
    const result = await liveSessionsService.cancelSession(req.params.id);
    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error("[LiveSessions] Cancel session error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/live-sessions/:id/mute/:participantIdentity - Mute a participant (admin)
 */
export async function muteParticipant(req, res) {
  try {
    const result = await liveSessionsService.muteParticipant(
      req.params.id, 
      req.params.participantIdentity
    );
    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error("[LiveSessions] Mute participant error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/live-sessions/:id/remove/:participantIdentity - Remove a participant (admin)
 */
export async function removeParticipant(req, res) {
  try {
    const result = await liveSessionsService.removeParticipant(
      req.params.id, 
      req.params.participantIdentity
    );
    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error("[LiveSessions] Remove participant error:", error.message);
    res.status(500).json({ error: error.message });
  }
}
