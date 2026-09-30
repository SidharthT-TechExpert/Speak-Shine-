import express from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createSpeakShineMCPServer } from "../mcp/mcpServer.js";

const router = express.Router();

// Transport map to store active SSE connections: sessionId -> transport
const transports = new Map();

/**
 * Security middleware for MCP endpoints
 */
const mcpAuth = (req, res, next) => {
  const secretKey = process.env.MCP_SECRET_KEY || process.env.JWT_SECRET;
  const providedKey = req.headers["x-mcp-key"] || req.query.apiKey;

  if (secretKey && providedKey !== secretKey) {
    return res.status(401).json({ error: "Unauthorized: Invalid MCP API Key" });
  }
  next();
};

/**
 * GET /api/mcp/sse
 * Connects AI Client via SSE transport
 */
router.get("/sse", mcpAuth, async (req, res) => {
  try {
    const transport = new SSEServerTransport("/api/mcp/message", res);
    const mcpServer = createSpeakShineMCPServer();

    const sessionId = transport.sessionId;
    transports.set(sessionId, transport);

    req.on("close", () => {
      transports.delete(sessionId);
    });

    await mcpServer.connect(transport);
    console.log(`[MCP] SSE connection established. Session: ${sessionId}`);
  } catch (err) {
    console.error("[MCP] SSE connection error:", err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

/**
 * POST /api/mcp/message
 * Receives JSON-RPC messages from AI Client
 */
router.post("/message", mcpAuth, async (req, res) => {
  try {
    const sessionId = req.query.sessionId;
    const transport = transports.get(sessionId);

    if (!transport) {
      return res.status(404).json({ error: "MCP Session not found or expired" });
    }

    await transport.handlePostMessage(req, res);
  } catch (err) {
    console.error("[MCP] POST message error:", err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

export default router;
