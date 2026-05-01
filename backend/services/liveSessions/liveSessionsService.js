/**
 * Live Sessions Service
 * Business logic for live video sessions with LiveKit
 */

import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import LiveSession from "../../../models/liveSessionSchema.js";

const LIVEKIT_URL = process.env.LIVEKIT_URL || "wss://your-project.livekit.cloud";
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;

if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
  console.warn("[LiveKit] WARNING: LIVEKIT_API_KEY or LIVEKIT_API_SECRET not set");
}

/**
 * Get LiveKit room service client
 */
function getRoomService() {
  const httpUrl = LIVEKIT_URL.replace("wss://", "https://").replace("ws://", "http://");
  return new RoomServiceClient(httpUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
}

/**
 * Check if LiveKit credentials are configured
 */
function checkLiveKitConfigured() {
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    const error = new Error("LiveKit credentials not configured");
    error.statusCode = 500;
    throw error;
  }
}

/**
 * List all sessions with optional status filter
 */
export async function listSessions(status) {
  const filter = {};
  if (status) filter.status = status;
  
  const sort = status === "scheduled" ? { scheduledAt: 1 } : { scheduledAt: -1 };
  const sessions = await LiveSession.find(filter).sort(sort);
  
  return sessions;
}

/**
 * Get session by ID
 */
export async function getSessionById(sessionId) {
  const session = await LiveSession.findById(sessionId);
  
  if (!session) {
    const error = new Error("Session not found");
    error.statusCode = 404;
    throw error;
  }
  
  return session;
}

/**
 * Create a new session (admin/trainer only)
 */
export async function createSession(title, scheduledAt, description, createdBy) {
  if (!title?.trim()) {
    throw new Error("Title is required");
  }
  
  if (!scheduledAt) {
    throw new Error("scheduledAt is required");
  }
  
  const session = await LiveSession.create({
    title: title.trim(),
    description: description || "",
    scheduledAt: new Date(scheduledAt),
    createdBy,
  });
  
  return session;
}

/**
 * Start a session (admin/trainer only)
 */
export async function startSession(sessionId, io) {
  const session = await LiveSession.findById(sessionId);
  
  if (!session) {
    const error = new Error("Session not found");
    error.statusCode = 404;
    throw error;
  }
  
  if (session.status !== "scheduled") {
    const error = new Error("Session is not in scheduled state");
    error.statusCode = 409;
    throw error;
  }
  
  const roomName = `session-${session._id}`;
  session.status = "live";
  session.startedAt = new Date();
  session.roomName = roomName;
  await session.save();
  
  // Emit socket event if io is available
  if (io) {
    io.emit("session:live", { 
      sessionId: session._id, 
      title: session.title, 
      roomName 
    });
  }
  
  return session;
}

/**
 * Generate LiveKit token for joining a session
 */
export async function generateSessionToken(sessionId, identity, name, isAdmin) {
  checkLiveKitConfigured();
  
  const session = await LiveSession.findById(sessionId);
  
  if (!session) {
    const error = new Error("Session not found");
    error.statusCode = 404;
    throw error;
  }
  
  if (session.status !== "live") {
    const error = new Error("Session is not live");
    error.statusCode = 409;
    throw error;
  }
  
  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, { 
    identity, 
    name, 
    ttl: "4h" 
  });
  
  at.addGrant({
    roomJoin: true,
    room: session.roomName,
    canPublish: true,
    canSubscribe: true,
    roomAdmin: isAdmin,
  });
  
  const token = await at.toJwt();
  
  // Add participant to session if not already present
  if (!session.participants.includes(identity)) {
    session.participants.push(identity);
    await session.save();
  }
  
  return { 
    token, 
    roomName: session.roomName, 
    livekitUrl: LIVEKIT_URL 
  };
}

/**
 * End a session (admin/trainer only)
 */
export async function endSession(sessionId, io) {
  const session = await LiveSession.findById(sessionId);
  
  if (!session) {
    const error = new Error("Session not found");
    error.statusCode = 404;
    throw error;
  }
  
  if (session.status !== "live") {
    const error = new Error("Session is not live");
    error.statusCode = 409;
    throw error;
  }
  
  session.status = "ended";
  session.endedAt = new Date();
  await session.save();
  
  // Try to delete the LiveKit room
  try {
    const svc = getRoomService();
    await svc.deleteRoom(session.roomName);
  } catch (e) {
    console.warn("[LiveKit] Could not delete room:", e.message);
  }
  
  // Emit socket event if io is available
  if (io) {
    io.emit("session:ended", { sessionId: session._id });
  }
  
  return session;
}

/**
 * Cancel a scheduled session (admin/trainer only)
 */
export async function cancelSession(sessionId) {
  const session = await LiveSession.findById(sessionId);
  
  if (!session) {
    const error = new Error("Session not found");
    error.statusCode = 404;
    throw error;
  }
  
  if (session.status === "live") {
    const error = new Error("Cannot cancel a live session. End it first.");
    error.statusCode = 409;
    throw error;
  }
  
  await LiveSession.deleteOne({ _id: sessionId });
  return { ok: true };
}

/**
 * Mute a participant (admin only)
 */
export async function muteParticipant(sessionId, participantIdentity) {
  const session = await LiveSession.findById(sessionId);
  
  if (!session) {
    const error = new Error("Session not found");
    error.statusCode = 404;
    throw error;
  }
  
  const svc = getRoomService();
  const participants = await svc.listParticipants(session.roomName);
  const target = participants.find(p => p.identity === participantIdentity);
  
  if (!target) {
    const error = new Error("Participant not found in room");
    error.statusCode = 404;
    throw error;
  }
  
  // Mute all audio tracks
  for (const track of target.tracks) {
    if (track.type === 0) { // Audio track
      await svc.mutePublishedTrack(session.roomName, target.identity, track.sid, true);
    }
  }
  
  return { ok: true };
}

/**
 * Remove a participant from session (admin only)
 */
export async function removeParticipant(sessionId, participantIdentity) {
  const session = await LiveSession.findById(sessionId);
  
  if (!session) {
    const error = new Error("Session not found");
    error.statusCode = 404;
    throw error;
  }
  
  const svc = getRoomService();
  await svc.removeParticipant(session.roomName, participantIdentity);
  
  return { ok: true };
}
