/**
 * Questions Routes
 * URL mapping for question endpoints
 */

import express from "express";
import * as questionsController from "../controllers/questionsController.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";

const router = express.Router();

// Public authenticated routes (all roles)
router.get("/random", authMiddleware, questionsController.getRandomQuestion);

// Admin/Trainer routes
router.get("/", authMiddleware, requireRole("admin", "trainer"), questionsController.listQuestions);

// Admin-only routes
router.post("/", authMiddleware, requireRole("admin"), questionsController.addQuestion);
router.delete("/:id", authMiddleware, requireRole("admin"), questionsController.deleteQuestion);
router.patch("/:id", authMiddleware, requireRole("admin"), questionsController.editQuestion);

export default router;
