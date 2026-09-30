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
    components: {
      schemas: {},
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "Enter your JWT_SECRET or MCP_SECRET_KEY as the Bearer Token"
        }
      }
    },
    security: [
      {
        BearerAuth: []
      }
    ],
    paths: {
      "/api/dashboard/today-question": {
        get: {
          operationId: "getTodayPublishedQuestion",
          summary: "Get today's active speaking challenge question and topic",
          responses: {
            "200": { description: "Active speaking prompt data" }
          }
        },
        patch: {
          operationId: "setTodayQuestion",
          summary: "Manually set or update today's active speaking challenge question before sending to group",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    topic: { type: "string", description: "Topic title for today's challenge" },
                    question: { type: "string", description: "Detailed speaking question/task text" },
                    category: { type: "string", description: "Category e.g. Daily Life, Opinion, Personal Experience, Fun Topic" }
                  },
                  required: ["topic", "question"]
                }
              }
            }
          },
          responses: {
            "200": { description: "Updated question details" }
          }
        }
      },
      "/api/whatsapp/send-poster": {
        post: {
          operationId: "sendTodayQuestionToGroup",
          summary: "Dispatch the current active question poster to the WhatsApp group after user approval",
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    topic: { type: "string", description: "Optional topic override" },
                    question: { type: "string", description: "Optional question override" },
                    category: { type: "string", description: "Optional category override" }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "WhatsApp dispatch status" }
          }
        }
      },
      "/api/whatsapp/status": {
        get: {
          operationId: "getWhatsAppStatus",
          summary: "Check WhatsApp bot connection status, QR code, user phone, target group, and delivery log",
          responses: {
            "200": { description: "WhatsApp bot connection details and QR code if disconnected" }
          }
        }
      },
      "/api/whatsapp/reconnect": {
        post: {
          operationId: "reconnectWhatsApp",
          summary: "Reconnect WhatsApp bot or force session reset to generate a fresh QR code",
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    force: { type: "boolean", description: "Set true to wipe session and generate fresh QR code" }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "Reconnection status message" }
          }
        }
      },
      "/api/dashboard/settings": {
        get: {
          operationId: "getBotSettings",
          summary: "Get bot schedule settings (poster send time, story days, picture description days)",
          responses: {
            "200": { description: "Bot schedule settings" }
          }
        },
        patch: {
          operationId: "updateBotSettings",
          summary: "Update bot schedule settings (posterSendTime, storyDays, pictureDescriptionDays)",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    posterSendTime: { type: "string", description: "Daily schedule time e.g. 08:00" },
                    storyDays: { type: "array", items: { type: "integer" }, description: "Days for story summary (e.g. [6] for Saturday)" },
                    pictureDescriptionDays: { type: "array", items: { type: "integer" }, description: "Days for picture description (e.g. [4] for Thursday)" }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "Updated settings" }
          }
        }
      },
      "/api/questions/generate-now": {
        post: {
          operationId: "generateQuestionsNow",
          summary: "AI-generate a batch of 14 new speaking questions for the question bank",
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    count: { type: "integer", default: 14, description: "Number of questions to generate (7 to 28)" }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "Generation result summary" }
          }
        }
      },
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
      "/api/dashboard/publish-and-send-today-question": {
        post: {
          operationId: "publishAndSendTodayQuestion",
          summary: "Publish today's speaking challenge question and dispatch poster to WhatsApp group",
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    force: { type: "boolean", description: "Set true to force publish a new question even if already published today" }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "Status of question publishing and WhatsApp dispatch" }
          }
        }
      },
      "/api/dashboard/trigger-ai-deploy": {
        post: {
          operationId: "triggerAICodeDeployment",
          summary: "Request an automated code modification and production deployment build from ChatGPT",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    prompt: { type: "string", description: "Description of the feature, code edit, or fix to deploy" },
                    commitMessage: { type: "string", description: "Optional custom git commit message" }
                  },
                  required: ["prompt"]
                }
              }
            }
          },
          responses: {
            "200": { description: "Status of the AI code deployment workflow dispatch" }
          }
        }
      },
      "/api/users": {
        get: {
          operationId: "getAllStudentsAndStats",
          summary: "Get all student profiles, streaks, freeze counts, and scores",
          parameters: [
            {
              name: "compact",
              in: "query",
              required: false,
              schema: { type: "string", default: "true" },
              description: "Returns compact student data to prevent payload size limits"
            }
          ],
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
