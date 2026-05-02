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

// Admin/Trainer routes — viewer can read
router.get("/", authMiddleware, requireRole("admin", "trainer", "viewer"), questionsController.listQuestions);
router.get("/manual", authMiddleware, requireRole("admin", "trainer", "viewer"), questionsController.listManualQuestions);
router.get("/templates", authMiddleware, requireRole("admin", "trainer", "viewer"), questionsController.getQuestionTemplates);
router.post("/manual", authMiddleware, requireRole("admin", "trainer"), questionsController.setupManualQuestion);
router.delete("/manual/:id", authMiddleware, requireRole("admin", "trainer"), questionsController.deleteManualQuestion);

// Admin-only routes
router.post("/", authMiddleware, requireRole("admin"), questionsController.addQuestion);
router.delete("/:id", authMiddleware, requireRole("admin"), questionsController.deleteQuestion);
router.patch("/:id", authMiddleware, requireRole("admin"), questionsController.editQuestion);

export default router;
