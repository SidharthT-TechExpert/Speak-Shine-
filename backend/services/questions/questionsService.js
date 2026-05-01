/**
 * Questions Service
 * Business logic for question management
 */

import Question from "../../../models/questionSchema.js";

/**
 * Get a random question for practice
 */
export async function getRandomQuestion(category) {
  const filter = category ? { category } : {};
  const count = await Question.countDocuments(filter);
  
  if (count === 0) {
    const error = new Error("No questions available");
    error.statusCode = 404;
    throw error;
  }
  
  const skip = Math.floor(Math.random() * count);
  const question = await Question.findOne(filter).skip(skip).lean();
  
  return question;
}

/**
 * List all questions with pagination (admin/trainer)
 */
export async function listQuestions(category, limit = 50, page = 1) {
  const filter = category ? { category } : {};
  
  const questions = await Question.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit))
    .lean();
  
  const total = await Question.countDocuments(filter);
  
  return {
    questions,
    total,
    page: Number(page),
  };
}

/**
 * Add a new question (admin only)
 */
export async function addQuestion(category, topic, question) {
  if (!category || !topic || !question) {
    throw new Error("category, topic and question are required");
  }
  
  const newQuestion = await Question.create({ category, topic, question });
  return newQuestion;
}

/**
 * Delete a question (admin only)
 */
export async function deleteQuestion(questionId) {
  await Question.findByIdAndDelete(questionId);
  return { success: true };
}

/**
 * Edit a question (admin only)
 */
export async function editQuestion(questionId, category, topic, question) {
  const updatedQuestion = await Question.findByIdAndUpdate(
    questionId,
    { category, topic, question },
    { new: true }
  );
  
  if (!updatedQuestion) {
    const error = new Error("Question not found");
    error.statusCode = 404;
    throw error;
  }
  
  return updatedQuestion;
}
