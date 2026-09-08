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
router.get("/", authMiddleware, requireRole("admin", "admins", "trainer", "viewer"), questionsController.listQuestions);
router.get("/manual", authMiddleware, requireRole("admin", "admins", "trainer", "viewer"), questionsController.listManualQuestions);
router.get("/templates", authMiddleware, requireRole("admin", "admins", "trainer", "viewer"), questionsController.getQuestionTemplates);
router.post("/manual", authMiddleware, requireRole("admin", "admins", "trainer"), questionsController.setupManualQuestion);
router.post("/manual/:id/publish-now", authMiddleware, requireRole("admin", "admins", "trainer"), questionsController.publishManualQuestionNow);
router.patch("/manual/:id", authMiddleware, requireRole("admin", "admins", "trainer"), questionsController.updateManualQuestion);
router.delete("/manual/:id", authMiddleware, requireRole("admin", "admins", "trainer"), questionsController.deleteManualQuestion);

// Admin-only routes
router.post("/generate-now",   authMiddleware, requireRole("admin", "admins"), questionsController.generateQuestionsNow);
router.post("/generate-story", authMiddleware, requireRole("admin", "admins", "trainer"), questionsController.generateStoryNow);
router.post("/generate-story-audio", authMiddleware, requireRole("admin", "admins", "trainer"), questionsController.generateStoryAudio);
router.post("/analyze-story-voice", authMiddleware, requireRole("admin", "admins", "trainer"), questionsController.analyzeStoryVoiceController);
router.get("/story-voices", authMiddleware, requireRole("admin", "admins", "trainer", "viewer"), questionsController.getStoryVoices);
router.post("/generate-picture", authMiddleware, requireRole("admin", "admins", "trainer"), questionsController.generatePictureNow);
router.post("/clean-generic",  authMiddleware, requireRole("admin", "admins"), questionsController.cleanGenericQuestions);
router.post("/",               authMiddleware, requireRole("admin", "admins"), questionsController.addQuestion);
router.delete("/:id",          authMiddleware, requireRole("admin", "admins"), questionsController.deleteQuestion);
router.patch("/:id",           authMiddleware, requireRole("admin", "admins"), questionsController.editQuestion);

export default router;
