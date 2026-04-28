import express from "express";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import LiveSession from "../../models/liveSessionSchema.js";
import { authMiddleware as auth } from "../middleware/auth.js";

const router = express.Router();

const LIVEKIT_URL        = process.env.LIVEKIT_URL    || "wss://your-project.livekit.cloud";
const LIVEKIT_API_KEY    = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;

if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
  console.warn("[LiveKit] WARNING: LIVEKIT_API_KEY or LIVEKIT_API_SECRET not set");
}

function getRoomService() {
  const httpUrl = LIVEKIT_URL.replace("wss://", "https://").replace("ws://", "http://");
  return new RoomServiceClient(httpUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
}

// GET /api/live-sessions
router.get("/", auth, async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    const sort = req.query.status === "scheduled" ? { scheduledAt: 1 } : { scheduledAt: -1 };
    const sessions = await LiveSession.find(filter).sort(sort);
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/live-sessions/:id
router.get("/:id", auth, async (req, res) => {
  try {
    const session = await LiveSession.findById(req.params.id);
    if (!session) return res.status(404).json({ error: "Session not found" });
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/live-sessions
router.post("/", auth, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admin only" });
  const { title, scheduledAt, description } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: "Title is required" });
  if (!scheduledAt)   return res.status(400).json({ error: "scheduledAt is required" });
  try {
    const session = await LiveSession.create({
      title: title.trim(),
      description: description || "",
      scheduledAt: new Date(scheduledAt),
      createdBy: req.user.phone,
    });
    res.status(201).json(session);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/live-sessions/:id/start
router.post("/:id/start", auth, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admin only" });
  try {
    const session = await LiveSession.findById(req.params.id);
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.status !== "scheduled") return res.status(409).json({ error: "Session is not in scheduled state" });

    const roomName = `session-${session._id}`;
    session.status    = "live";
    session.startedAt = new Date();
    session.roomName  = roomName;
    await session.save();

    const io = req.app.get("io");
    if (io) io.emit("session:live", { sessionId: session._id, title: session.title, roomName });

    res.json(session);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/live-sessions/:id/token
router.post("/:id/token", auth, async (req, res) => {
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return res.status(500).json({ error: "LiveKit credentials not configured" });
  }
  try {
    const session = await LiveSession.findById(req.params.id);
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.status !== "live") return res.status(409).json({ error: "Session is not live" });

    const identity = req.user.phone;
    const name     = req.user.name || identity;
    const isAdmin  = req.user.role === "admin";

    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, { identity, name, ttl: "4h" });
    at.addGrant({
      roomJoin:     true,
      room:         session.roomName,
      canPublish:   true,
      canSubscribe: true,
      roomAdmin:    isAdmin,
    });

    const token = await at.toJwt();

    if (!session.participants.includes(identity)) {
      session.participants.push(identity);
      await session.save();
    }

    res.json({ token, roomName: session.roomName, livekitUrl: LIVEKIT_URL });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/live-sessions/:id/end
router.post("/:id/end", auth, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admin only" });
  try {
    const session = await LiveSession.findById(req.params.id);
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.status !== "live") return res.status(409).json({ error: "Session is not live" });

    session.status  = "ended";
    session.endedAt = new Date();
    await session.save();

    try {
      const svc = getRoomService();
      await svc.deleteRoom(session.roomName);
    } catch (e) {
      console.warn("[LiveKit] Could not delete room:", e.message);
    }

    const io = req.app.get("io");
    if (io) io.emit("session:ended", { sessionId: session._id });

    res.json(session);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/live-sessions/:id/mute/:participantIdentity
router.post("/:id/mute/:participantIdentity", auth, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admin only" });
  try {
    const session = await LiveSession.findById(req.params.id);
    if (!session) return res.status(404).json({ error: "Session not found" });
    const svc = getRoomService();
    const participants = await svc.listParticipants(session.roomName);
    const target = participants.find(p => p.identity === req.params.participantIdentity);
    if (!target) return res.status(404).json({ error: "Participant not found in room" });
    for (const track of target.tracks) {
      if (track.type === 0) {
        await svc.mutePublishedTrack(session.roomName, target.identity, track.sid, true);
      }
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/live-sessions/:id/remove/:participantIdentity
router.post("/:id/remove/:participantIdentity", auth, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admin only" });
  try {
    const session = await LiveSession.findById(req.params.id);
    if (!session) return res.status(404).json({ error: "Session not found" });
    const svc = getRoomService();
    await svc.removeParticipant(session.roomName, req.params.participantIdentity);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
