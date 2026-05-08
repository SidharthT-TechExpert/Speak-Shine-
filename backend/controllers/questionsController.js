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

/**
 * POST /api/questions/generate-now - Manually trigger AI question generation (admin)
 */
export async function generateQuestionsNow(req, res) {
  try {
    const { count = 14 } = req.body;
    const safeCount = Math.min(Math.max(parseInt(count) || 14, 7), 28);

    // Run async — respond immediately so the request doesn't time out
    const { generateAndInsertQuestions } = await import("../services/ai/questionGenerator.js");

    // Fire and forget — client polls the question list to see new ones
    generateAndInsertQuestions(safeCount)
      .then(({ inserted, totalInDb }) =>
        console.log(`[Questions] Manual generate: +${inserted.length} questions. Bank total: ${totalInDb}`)
      )
      .catch(err =>
        console.error("[Questions] Manual generate failed:", err.message)
      );

    res.json({
      success: true,
      message: `Generating ${safeCount} questions in the background. Refresh the question bank in ~30 seconds.`,
    });
  } catch (error) {
    console.error("[Questions] Generate now error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/questions/clean-generic - Remove generic/shallow questions from DB (admin)
 * Scans all questions and deletes ones that are too generic.
 */
export async function cleanGenericQuestions(req, res) {
  try {
    const Question = (await import("../../models/questionSchema.js")).default;
    const all = await Question.find({ isManualSetup: { $ne: true } }).lean();

    const GENERIC_TOPICS = [
      "hobbies", "food", "weekend", "weekend plans", "favorite foods",
      "music", "movies", "sports", "travel", "family", "friends",
      "work", "school", "daily life", "morning routine", "free time",
      "technology", "social media", "health", "exercise", "sleep",
      "money", "shopping", "weather", "pets", "books",
      "hidden talents", "secret talent", "binge-worthy shows", "dream job",
      "guilty pleasures", "morning coffee", "daily commute", "study spots",
      "weeknight dinners", "childhood memories", "favorite game",
      "best gift", "biggest mistake", "dream vacation",
      "book formats", "language exchange", "vocabulary building",
      "english media", "language learning tips", "personal challenges",
    ];

    const GENERIC_PATTERNS = [
      /^what (is|are) your (favorite|hobby|hobbies|dream|go-to|quickest)/i,
      /^do you (like|enjoy|love|have|watch|read|listen|use)/i,
      /^how (was|is) your (day|week|weekend)/i,
      /^tell me about yourself/i,
      /^what do you (do|think) (for fun|in your free time|to relax|usually)/i,
      /^what are you doing (this|next) (weekend|week)/i,
      /^(do|did) you (watch|read|listen|ever)/i,
      /^what('s| is) your (name|job|age|go-to|dream job|quickest|favorite)/i,
      /^how (do|did|often|long) you (usually|learn|get|watch|practice|study)/i,
      /^are (audiobooks|beach|city|ebooks|e-books)/i,
      /^(are|is) .{0,30} better than/i,
      /^what('s| is) (the best|your best|your favorite|a secret|the biggest|the best gift)/i,
      /^what('s| is) (your|the) (biggest|best|worst|most) (mistake|gift|memory|fear|challenge)/i,
      /^what show (have|did) you/i,
      /^what('s| is) (your|a) (guilty pleasure|secret talent|dream job|go-to)/i,
      /^have you ever had a language/i,
      /^what('s| is) your (favorite way|quickest|go-to|usual)/i,
      /^where do you usually/i,
      /^how do you usually get to/i,
    ];

    const toDelete = all.filter(q => {
      const topicLower = (q.topic || "").toLowerCase().trim();
      const questionLower = (q.question || "").toLowerCase().trim();

      if (GENERIC_TOPICS.some(t => topicLower === t || topicLower.includes(t))) return true;
      if (GENERIC_PATTERNS.some(p => p.test(questionLower))) return true;
      if (q.question.trim().length < 40) return true;
      // Short yes/no questions
      if (/^(are|is|do|did|have|can|would|could)\s/i.test(questionLower) && q.question.trim().length < 80) return true;
      return false;
    });

    if (toDelete.length === 0) {
      return res.json({ success: true, deleted: 0, message: "No generic questions found — bank is clean!" });
    }

    const ids = toDelete.map(q => q._id);
    await Question.deleteMany({ _id: { $in: ids } });

    console.log(`[Questions] Cleaned ${toDelete.length} generic questions`);
    res.json({
      success: true,
      deleted: toDelete.length,
      removed: toDelete.map(q => ({ topic: q.topic, question: q.question })),
      message: `Removed ${toDelete.length} generic question${toDelete.length !== 1 ? "s" : ""}`,
    });
  } catch (error) {
    console.error("[Questions] Clean generic error:", error.message);
    res.status(500).json({ error: error.message });
  }
}
