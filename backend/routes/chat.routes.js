/**
 * Chat Routes
 * URL mapping for chat endpoints
 */

import express from "express";
import * as chatController from "../controllers/chatController.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";

const router = express.Router();

// Public authenticated routes (all roles)
router.get("/group", authMiddleware, chatController.getGroupChatHistory);
router.get("/trainers", authMiddleware, chatController.getAvailableTrainers);
router.get("/:peerPhone", authMiddleware, chatController.getChatHistory);

// Trainer/Admin routes
router.get("/users", authMiddleware, requireRole("trainer", "admin"), chatController.getAvailableUsers);

export default router;
