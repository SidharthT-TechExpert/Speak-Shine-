import express from "express";

const router = express.Router();

/**
 * GET /api/openapi.json
 * Returns OpenAPI 3.0 specification for ChatGPT Custom Actions
 */
router.get("/openapi.json", (req, res) => {
  const host = req.get("host") || "speak-shine.sidhartht.online";
  const protocol = req.protocol === "https" || req.headers["x-forwarded-proto"] === "https" ? "https" : "https";
  const baseUrl = `${protocol}://${host}`;

  const schema = {
    openapi: "3.1.0",
    info: {
      title: "Speak & Shine AI Assistant API",
      version: "1.0.0",
      description: "Custom Action API for querying student streaks, doubts, published questions, and stats."
    },
    servers: [
      {
        url: baseUrl,
        description: "Speak & Shine Backend API Server"
      }
    ],
    paths: {
      "/api/help-tickets/admin/tickets": {
        get: {
          operationId: "getStudentDoubts",
          summary: "Fetch student help tickets, doubts, or grammar questions",
          parameters: [
            {
              name: "status",
              in: "query",
              required: false,
              schema: { type: "string", default: "pending" },
              description: "Filter by status: pending, resolved, or all"
            }
          ],
          responses: {
            "200": { description: "Returns list of student doubt tickets" }
          }
        }
      },
      "/api/help-tickets/admin/respond/{ticketId}": {
        post: {
          operationId: "resolveStudentDoubt",
          summary: "Send a solution or grammar tip to resolve a student doubt",
          parameters: [
            {
              name: "ticketId",
              in: "path",
              required: true,
              schema: { type: "string" },
              description: "The ID of the ticket to resolve"
            }
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    response: { type: "string", description: "The grammar correction or advice text" }
                  },
                  required: ["response"]
                }
              }
            }
          },
          responses: {
            "200": { description: "Doubt marked as resolved" }
          }
        }
      },
      "/api/dashboard/today-question": {
        get: {
          operationId: "getTodayPublishedQuestion",
          summary: "Get today's active speaking challenge question and topic",
          responses: {
            "200": { description: "Active speaking prompt data" }
          }
        }
      },
      "/api/users": {
        get: {
          operationId: "getAllStudentsAndStats",
          summary: "Get all student profiles, streaks, freeze counts, and scores",
          responses: {
            "200": { description: "List of enrolled students" }
          }
        }
      }
    }
  };

  res.json(schema);
});

export default router;
