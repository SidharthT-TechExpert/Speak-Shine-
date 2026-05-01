/**
 * Chat Controller
 * HTTP request handlers for chat endpoints
 */

import * as chatService from "../services/chat/chatService.js";

/**
 * GET /api/chat/group - Load group chat history
 */
export async function getGroupChatHistory(req, res) {
  try {
    const result = await chatService.getGroupChatHistory();
    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error("[Chat] Get group chat history error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/chat/trainers - List available trainers to DM (user)
 */
export async function getAvailableTrainers(req, res) {
  try {
    const result = await chatService.getAvailableTrainers();
    res.json(result);
  } catch (error) {
    console.error("[Chat] Get available trainers error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/chat/users - List users (trainer/admin)
 */
export async function getAvailableUsers(req, res) {
  try {
    const result = await chatService.getAvailableUsers();
    res.json(result);
  } catch (error) {
    console.error("[Chat] Get available users error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/chat/:peerPhone - Load message history with a peer
 */
export async function getChatHistory(req, res) {
  try {
    const myPhone = req.user.phone;
    const peerPhone = req.params.peerPhone;
    
    const result = await chatService.getChatHistory(myPhone, peerPhone);
    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error("[Chat] Get chat history error:", error.message);
    res.status(500).json({ error: error.message });
  }
}
