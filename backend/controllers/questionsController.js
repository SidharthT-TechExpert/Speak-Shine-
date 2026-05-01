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
 * POST /api/questions/manual - Setup manual question for specific date/type (admin/trainer)
 */
export async function setupManualQuestion(req, res) {
  try {
    const { setupType, scheduledFor, category, topic, question } = req.body;
    const createdBy = req.user.phone;
    
    const result = await questionsService.setupManualQuestion(
      setupType, 
      scheduledFor, 
      category, 
      topic, 
      question, 
      createdBy
    );
    res.status(201).json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error("[Questions] Setup manual question error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/questions/manual - List manual questions (admin/trainer)
 */
export async function listManualQuestions(req, res) {
  try {
    const { setupType, upcoming } = req.query;
    const result = await questionsService.listManualQuestions(setupType, upcoming === 'true');
    res.json(result);
  } catch (error) {
    console.error("[Questions] List manual questions error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * DELETE /api/questions/manual/:id - Delete manual question (admin/trainer)
 */
export async function deleteManualQuestion(req, res) {
  try {
    const result = await questionsService.deleteManualQuestion(req.params.id, req.user.phone);
    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error("[Questions] Delete manual question error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/questions/templates - Get question templates for manual setup (admin/trainer)
 */
export async function getQuestionTemplates(req, res) {
  try {
    const result = await questionsService.getQuestionTemplates();
    res.json(result);
  } catch (error) {
    console.error("[Questions] Get question templates error:", error.message);
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
