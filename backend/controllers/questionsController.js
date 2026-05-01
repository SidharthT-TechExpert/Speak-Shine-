/**
 * Questions Controller
 * HTTP request handlers for question endpoints
 */

import * as questionsService from "../services/questions/questionsService.js";

/**
 * GET /api/questions/random - Get a random question for practice
 */
export async function getRandomQuestion(req, res) {
  try {
    const { category } = req.query;
    const result = await questionsService.getRandomQuestion(category);
    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error("[Questions] Get random question error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/questions - List all questions (admin/trainer)
 */
export async function listQuestions(req, res) {
  try {
    const { category, limit = 50, page = 1 } = req.query;
    const result = await questionsService.listQuestions(category, limit, page);
    res.json(result);
  } catch (error) {
    console.error("[Questions] List questions error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/questions - Add a new question (admin)
 */
export async function addQuestion(req, res) {
  try {
    const { category, topic, question } = req.body;
    const result = await questionsService.addQuestion(category, topic, question);
    res.status(201).json(result);
  } catch (error) {
    console.error("[Questions] Add question error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * DELETE /api/questions/:id - Delete a question (admin)
 */
export async function deleteQuestion(req, res) {
  try {
    const result = await questionsService.deleteQuestion(req.params.id);
    res.json(result);
  } catch (error) {
    console.error("[Questions] Delete question error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * PATCH /api/questions/:id - Edit a question (admin)
 */
export async function editQuestion(req, res) {
  try {
    const { category, topic, question } = req.body;
    const result = await questionsService.editQuestion(req.params.id, category, topic, question);
    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error("[Questions] Edit question error:", error.message);
    res.status(500).json({ error: error.message });
  }
}
