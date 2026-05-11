/**
 * Live Sessions Routes
 * URL mapping for live session endpoints
 */

import express from "express";
import * as liveSessionsController from "../controllers/liveSessionsController.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";

const router = express.Router();

// Public authenticated routes (all roles)
router.get("/", authMiddleware, liveSessionsController.listSessions);
router.get("/:id", authMiddleware, liveSessionsController.getSessionById);
router.post("/:id/token", authMiddleware, liveSessionsController.generateSessionToken);

// Admin/Trainer routes
router.post("/", authMiddleware, requireRole("admin", "trainer"), liveSessionsController.createSession);
router.post("/:id/start", authMiddleware, requireRole("admin", "trainer"), liveSessionsController.startSession);
router.post("/:id/end", authMiddleware, requireRole("admin", "trainer"), liveSessionsController.endSession);
router.delete("/:id", authMiddleware, requireRole("admin", "trainer"), liveSessionsController.cancelSession);

// Admin/Trainer moderation routes
router.post("/:id/mute/:participantIdentity",          authMiddleware, requireRole("admin", "trainer"), liveSessionsController.muteParticipant);
router.post("/:id/disable-video/:participantIdentity", authMiddleware, requireRole("admin", "trainer"), liveSessionsController.disableParticipantVideo);
router.post("/:id/kick/:participantIdentity",          authMiddleware, requireRole("admin", "trainer"), liveSessionsController.kickParticipant);
router.post("/:id/approve/:participantIdentity",       authMiddleware, requireRole("admin", "trainer"), liveSessionsController.approveParticipant);
router.post("/:id/remove/:participantIdentity",        authMiddleware, requireRole("admin", "trainer"), liveSessionsController.removeParticipant);

export default router;
