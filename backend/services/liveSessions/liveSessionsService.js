/**
 * Live Sessions Service
 * Business logic for live video sessions with LiveKit
 */

import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import LiveSession from "../../../models/liveSessionSchema.js";
import { expireLiveSessionChat } from "../chat/chatService.js";

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
export async function createSession(title, scheduledAt, description, createdBy, maxParticipants = 20) {
  if (!title?.trim()) {
    throw new Error("Title is required");
  }
  if (!scheduledAt) {
    throw new Error("scheduledAt is required");
  }

  const safeMax = Math.min(Math.max(parseInt(maxParticipants) || 20, 2), 100);

  const session = await LiveSession.create({
    title: title.trim(),
    description: description || "",
    scheduledAt: new Date(scheduledAt),
    maxParticipants: safeMax,
    createdBy,
  });

  return session;
}

/**
 * Start a session (admin/trainer only)
 * Pre-creates the LiveKit room with maxParticipants limit.
 */
export async function startSession(sessionId, io) {
  checkLiveKitConfigured();

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

  // Pre-create the LiveKit room with participant limit
  try {
    const svc = getRoomService();
    await svc.createRoom({
      name: roomName,
      maxParticipants: session.maxParticipants || 20,
      emptyTimeout: 300,      // auto-delete after 5 min if empty
      departureTimeout: 20,   // 20s grace period for reconnects
    });
    console.log(`[LiveKit] Room created: ${roomName} (max ${session.maxParticipants} participants)`);
  } catch (e) {
    // Non-fatal — LiveKit auto-creates the room on first join, just without the limit
    console.warn("[LiveKit] Room pre-create failed (will auto-create without limit):", e.message);
  }

  session.status = "live";
  session.startedAt = new Date();
  session.roomName = roomName;
  await session.save();

  if (io) {
    io.emit("session:live", {
      sessionId: session._id,
      title: session.title,
      roomName,
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

  // Check if user is banned from this session
  if (!isAdmin && session.bannedParticipants?.includes(identity)) {
    const error = new Error("You have been removed from this session by the host.");
    error.statusCode = 403;
    error.code = "SESSION_BANNED";
    throw error;
  }

  // Check participant limit (admins/trainers bypass the limit)
  if (!isAdmin) {
    const currentCount = session.participants.length;
    const maxAllowed = session.maxParticipants || 20;
    if (!session.participants.includes(identity) && currentCount >= maxAllowed) {
      const error = new Error(
        `Session is full (${currentCount}/${maxAllowed} participants). Please try again later.`
      );
      error.statusCode = 409;
      throw error;
    }
  }

  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity,
    name,
    ttl: "4h",
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
    livekitUrl: LIVEKIT_URL,
    maxParticipants: session.maxParticipants || 20,
    currentParticipants: session.participants.length,
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

  // Delete session chat messages immediately when session ends
  await expireLiveSessionChat(session._id.toString(), true);
  
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
 * Mute a participant's microphone (admin/trainer)
 */
export async function muteParticipant(sessionId, participantIdentity) {
  const session = await LiveSession.findById(sessionId);
  if (!session) { const e = new Error("Session not found"); e.statusCode = 404; throw e; }

  const svc = getRoomService();
  const participants = await svc.listParticipants(session.roomName);
  const target = participants.find(p => p.identity === participantIdentity);

  if (!target) { const e = new Error("Participant not found in room"); e.statusCode = 404; throw e; }

  for (const track of target.tracks) {
    if (track.type === 0) { // Audio track
      await svc.mutePublishedTrack(session.roomName, target.identity, track.sid, true);
    }
  }
  return { ok: true, action: "muted" };
}

/**
 * Disable a participant's camera (admin/trainer)
 */
export async function disableParticipantVideo(sessionId, participantIdentity) {
  const session = await LiveSession.findById(sessionId);
  if (!session) { const e = new Error("Session not found"); e.statusCode = 404; throw e; }

  const svc = getRoomService();
  const participants = await svc.listParticipants(session.roomName);
  const target = participants.find(p => p.identity === participantIdentity);

  if (!target) { const e = new Error("Participant not found in room"); e.statusCode = 404; throw e; }

  for (const track of target.tracks) {
    if (track.type === 1) { // Video track
      await svc.mutePublishedTrack(session.roomName, target.identity, track.sid, true);
    }
  }
  return { ok: true, action: "video_disabled" };
}

/**
 * Kick a participant from the session and ban them from rejoining (admin/trainer)
 * They will need admin/trainer approval to rejoin.
 */
export async function kickParticipant(sessionId, participantIdentity, io) {
  const session = await LiveSession.findById(sessionId);
  if (!session) { const e = new Error("Session not found"); e.statusCode = 404; throw e; }

  // Add to banned list
  if (!session.bannedParticipants.includes(participantIdentity)) {
    session.bannedParticipants.push(participantIdentity);
    await session.save();
  }

  // Remove from LiveKit room
  try {
    const svc = getRoomService();
    await svc.removeParticipant(session.roomName, participantIdentity);
  } catch (e) {
    console.warn("[LiveKit] Could not remove participant:", e.message);
  }

  // Notify the kicked user via socket
  if (io) {
    io.emit("session:kicked", {
      sessionId: session._id,
      identity: participantIdentity,
      message: "You have been removed from this session by the host.",
    });
  }

  return { ok: true, action: "kicked", banned: true };
}

/**
 * Approve a banned participant to rejoin (admin/trainer)
 */
export async function approveParticipant(sessionId, participantIdentity) {
  const session = await LiveSession.findById(sessionId);
  if (!session) { const e = new Error("Session not found"); e.statusCode = 404; throw e; }

  // Remove from banned list
  session.bannedParticipants = session.bannedParticipants.filter(p => p !== participantIdentity);
  await session.save();

  return { ok: true, action: "approved" };
}

/**
 * Remove a participant from session without banning (admin/trainer)
 * @deprecated Use kickParticipant for kick+ban behavior
 */
export async function removeParticipant(sessionId, participantIdentity) {
  return kickParticipant(sessionId, participantIdentity, null);
}
