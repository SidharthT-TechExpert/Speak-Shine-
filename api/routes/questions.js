import express from "express";
import Question from "../../models/questionSchema.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";

const router = express.Router();

// GET /api/questions/random — any authenticated user: get a random question for practice
router.get("/random", authMiddleware, async (req, res) => {
  try {
    const { category } = req.query;
    const filter = category ? { category } : {};
    const count = await Question.countDocuments(filter);
    if (count === 0) return res.status(404).json({ error: "No questions available" });
    const skip = Math.floor(Math.random() * count);
    const q = await Question.findOne(filter).skip(skip).lean();
    res.json(q);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/questions — admin/trainer: list all questions
router.get("/", authMiddleware, requireRole("admin", "trainer"), async (req, res) => {
  try {
    const { category, limit = 50, page = 1 } = req.query;
    const filter = category ? { category } : {};
    const questions = await Question.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();
    const total = await Question.countDocuments(filter);
    res.json({ questions, total, page: Number(page) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/questions — admin: add question
router.post("/", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const { category, topic, question } = req.body;
    if (!category || !topic || !question)
      return res.status(400).json({ error: "category, topic and question are required" });
    const q = await Question.create({ category, topic, question });
    res.status(201).json(q);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/questions/:id — admin: delete question
router.delete("/:id", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    await Question.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/questions/:id — admin: edit question
router.patch("/:id", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const { category, topic, question } = req.body;
    const q = await Question.findByIdAndUpdate(
      req.params.id,
      { category, topic, question },
      { new: true }
    );
    if (!q) return res.status(404).json({ error: "Not found" });
    res.json(q);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
