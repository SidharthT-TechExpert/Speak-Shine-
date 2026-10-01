import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import User from "../../models/userSchema.js";
import Question from "../../models/questionSchema.js";
import HelpTicket from "../../models/helpTicketSchema.js";
import DailyReport from "../../models/dailyReportSchema.js";

/**
 * Creates and initializes the Speak & Shine MCP Server instance
 */
export function createSpeakShineMCPServer() {
  const mcpServer = new Server(
    {
      name: "speak-shine-mcp-server",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // 1. List Available Tools for ChatGPT / Claude / AI Assistants
  mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "get_student_details",
          description: "Fetch student profile, streak, streak freeze count, score, and submission status by phone or name.",
          inputSchema: {
            type: "object",
            properties: {
              phoneOrName: { type: "string", description: "Student mobile phone number or full name" },
            },
            required: ["phoneOrName"],
          },
        },
        {
          name: "get_today_published_question",
          description: "Get today's active published speaking challenge question, topic, category, and audio url.",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "get_unresolved_student_doubts",
          description: "Fetch pending student doubts, grammar questions, or help tickets for review.",
          inputSchema: {
            type: "object",
            properties: {
              category: { type: "string", description: "Optional category: grammar, speaking, task_help, technical, general" },
            },
          },
        },
        {
          name: "resolve_student_doubt",
          description: "Provide a grammar tip or solution to resolve a student doubt ticket.",
          inputSchema: {
            type: "object",
            properties: {
              ticketId: { type: "string", description: "The ID of the help ticket to resolve" },
              response: { type: "string", description: "The grammar correction, advice, or solution text" },
              staffName: { type: "string", description: "Name of the trainer/staff responding" },
            },
            required: ["ticketId", "response"],
          },
        },
        {
          name: "get_daily_class_stats",
          description: "Get today's overall class completion rate, pending student list, and top streak leaderboard.",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "publish_and_send_today_question",
          description: "Publish today's speaking challenge question and dispatch the poster to the WhatsApp group. Use when scheduler is delayed/down or manual publishing is requested.",
          inputSchema: {
            type: "object",
            properties: {
              force: { type: "boolean", description: "Set true to force generating a new question even if today's question was already published." },
            },
          },
        },
        {
          name: "get_whatsapp_status",
          description: "Check WhatsApp bot connection status (connected/connecting/disconnected), user phone, target group, delivery log, and QR code.",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "reconnect_whatsapp",
          description: "Reconnect WhatsApp bot or force session reset to generate a fresh QR code for scanning.",
          inputSchema: {
            type: "object",
            properties: {
              force: { type: "boolean", description: "Set true to clear saved session credentials and generate a fresh QR code." },
            },
          },
        },
        {
          name: "get_bot_settings",
          description: "Get current bot schedule settings (posterSendTime, storyDays, pictureDescriptionDays).",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "update_bot_settings",
          description: "Update bot schedule settings (posterSendTime, storyDays, pictureDescriptionDays).",
          inputSchema: {
            type: "object",
            properties: {
              posterSendTime: { type: "string", description: "Daily schedule time e.g. '08:00'" },
              storyDays: { type: "array", items: { type: "integer" }, description: "Days for story summary e.g. [6] for Saturday" },
              pictureDescriptionDays: { type: "array", items: { type: "integer" }, description: "Days for picture description e.g. [4] for Thursday" },
            },
          },
        },
        {
          name: "set_today_question",
          description: "Manually set or update today's active speaking challenge question (topic, question text, category) based on user instructions before asking for approval to send to WhatsApp group.",
          inputSchema: {
            type: "object",
            properties: {
              topic: { type: "string", description: "Topic title for today's challenge" },
              question: { type: "string", description: "Detailed question or speaking prompt" },
              category: { type: "string", description: "Category e.g. Daily Life, Opinion, Personal Experience, Fun Topic" },
            },
            required: ["topic", "question"],
          },
        },
        {
          name: "send_today_question_to_group",
          description: "Dispatch the current active question poster to the WhatsApp group. Call this ONLY after user approves/allows sending in chat.",
          inputSchema: {
            type: "object",
            properties: {
              topic: { type: "string", description: "Optional topic override" },
              question: { type: "string", description: "Optional question override" },
              category: { type: "string", description: "Optional category override" },
            },
          },
        },
        {
          name: "trigger_ai_code_deployment",
          description: "Request an automated code modification and production deployment build directly from ChatGPT.",
          inputSchema: {
            type: "object",
            properties: {
              prompt: { type: "string", description: "Description of the code change, feature, or bugfix to build and deploy" },
              filePath: { type: "string", description: "Relative file path to create or update (e.g. frontend/src/pages/VideoAnalysis.jsx)" },
              codeContent: { type: "string", description: "Full code content string to write to the file" },
              commitMessage: { type: "string", description: "Optional custom git commit message" },
            },
          },
        },
        {
          name: "block_or_unblock_student",
          description: "Block (deactivate) or unblock (activate) a student account by phone number.",
          inputSchema: {
            type: "object",
            properties: {
              phone: { type: "string", description: "Student mobile phone number" },
            },
            required: ["phone"],
          },
        },
        {
          name: "delete_student",
          description: "Permanently delete a student account by phone number.",
          inputSchema: {
            type: "object",
            properties: {
              phone: { type: "string", description: "Student mobile phone number to delete" },
            },
            required: ["phone"],
          },
        },
        {
          name: "adjust_student_points",
          description: "Add, set, or remove monthly score points for a student.",
          inputSchema: {
            type: "object",
            properties: {
              phone: { type: "string", description: "Student mobile phone number" },
              amount: { type: "number", description: "Points amount" },
              mode: { type: "string", enum: ["add", "set", "remove"], description: "Mode: add (default), set, or remove" },
              reason: { type: "string", description: "Optional reason for point adjustment" },
            },
            required: ["phone", "amount"],
          },
        },
        {
          name: "adjust_student_streak",
          description: "Update or set a student's daily speaking streak count.",
          inputSchema: {
            type: "object",
            properties: {
              phone: { type: "string", description: "Student mobile phone number" },
              amount: { type: "number", description: "Streak count or adjustment amount" },
              mode: { type: "string", enum: ["add", "set", "remove", "reset"], description: "Mode: add (default), set, remove, or reset" },
            },
            required: ["phone", "amount"],
          },
        },
        {
          name: "adjust_student_streak_freeze",
          description: "Add, set, or remove streak freeze shields for a student.",
          inputSchema: {
            type: "object",
            properties: {
              phone: { type: "string", description: "Student mobile phone number" },
              amount: { type: "number", description: "Number of freeze shields" },
              mode: { type: "string", enum: ["add", "set", "remove"], description: "Mode: add (default), set, or remove" },
            },
            required: ["phone", "amount"],
          },
        },
        {
          name: "adjust_student_wallet",
          description: "Credit or debit a student's wallet balance in INR.",
          inputSchema: {
            type: "object",
            properties: {
              phone: { type: "string", description: "Student mobile phone number" },
              amount: { type: "number", description: "Wallet amount in INR" },
              type: { type: "string", enum: ["credit", "debit"], description: "Credit (+ balance) or Debit (- balance)" },
              reason: { type: "string", description: "Reason for credit/debit transaction" },
            },
            required: ["phone", "amount"],
          },
        },
        {
          name: "reset_student_login_attempts",
          description: "Reset failed login attempts and unlock a student account.",
          inputSchema: {
            type: "object",
            properties: {
              phone: { type: "string", description: "Student mobile phone number" },
            },
            required: ["phone"],
          },
        },
        {
          name: "update_student_submitted_status",
          description: "Toggle or set today's submission completion status (completed: true/false) for a student.",
          inputSchema: {
            type: "object",
            properties: {
              phone: { type: "string", description: "Student mobile phone number" },
            },
            required: ["phone"],
          },
        },
        {
          name: "update_student_paid_status",
          description: "Update student subscription paid status (paid: true/false).",
          inputSchema: {
            type: "object",
            properties: {
              phone: { type: "string", description: "Student mobile phone number" },
              paid: { type: "boolean", description: "Paid status (true = active paid subscriber, false = unpaid)" },
            },
            required: ["phone"],
          },
        },
        {
          name: "reset_weekly_submissions",
          description: "Reset weekly submission counts for all students.",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "get_student_wallet_details",
          description: "Get full wallet balance, transaction history (credits/debits), and referral earnings for a student.",
          inputSchema: {
            type: "object",
            properties: {
              phone: { type: "string", description: "Student mobile phone number" },
            },
            required: ["phone"],
          },
        },
        {
          name: "send_custom_whatsapp_group_message",
          description: "Generate and send any custom text, poster image, or audio voice note message directly to the Speak & Shine WhatsApp group. Supports text, imageUrl (HTTP/HTTPS, Base64 data URI, or local file path), audioUrl, or setting asPoster=true to automatically render the message text as a high-definition poster image.",
          inputSchema: {
            type: "object",
            properties: {
              messageText: { type: "string", description: "Text message or poster caption (required if no imageUrl or audioUrl)" },
              imageUrl: { type: "string", description: "Optional image URL, Base64 data URI, or local file path to broadcast an image" },
              audioUrl: { type: "string", description: "Optional audio URL, Base64 data URI, or local file path to broadcast a voice note / audio" },
              asPoster: { type: "boolean", description: "Set true to automatically render the messageText into a visually stunning Speak & Shine poster image before broadcasting to the group." },
              targetGroup: { type: "string", description: "Optional target group JID override" },
            },
          },
        },
      ],
    };
  });

  // 2. Handle Tool Execution Requests
  mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      if (name === "get_student_details") {
        const query = args.phoneOrName.trim();
        const user = await User.findOne({
          $or: [
            { phone: query },
            { name: { $regex: query, $options: "i" } },
            { registeredName: { $regex: query, $options: "i" } },
          ],
        }).select("-passwordHash -otp");

        if (!user) {
          return {
            content: [{ type: "text", text: `No student found matching query: "${query}"` }],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  id: user._id,
                  name: user.registeredName || user.name,
                  phone: user.phone,
                  avatarUrl: user.avatarUrl || null,
                  streak: user.streak || 0,
                  streakFreeze: user.streakFreeze || 0,
                  monthlyScore: user.monthlyScore || 0,
                  completedToday: !!user.completed,
                  paidMember: !!user.paid,
                  role: user.role,
                  joinedAt: user.createdAt,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      if (name === "get_today_published_question") {
        const todayDate = new Date().toISOString().split("T")[0];
        const question = await Question.findOne({ isUsed: true }).sort({ scheduledFor: -1 });

        if (!question) {
          return {
            content: [{ type: "text", text: "No question published for today yet." }],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  id: question._id,
                  topic: question.topic,
                  question: question.question,
                  category: question.category,
                  scheduledFor: question.scheduledFor,
                  audioUrl: question.audioUrl || null,
                  imageUrl: question.imageUrl || null,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      if (name === "get_unresolved_student_doubts") {
        const filter = { status: "pending" };
        if (args?.category) filter.category = args.category;

        const tickets = await HelpTicket.find(filter).sort({ createdAt: -1 }).limit(20);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  count: tickets.length,
                  tickets: tickets.map((t) => ({
                    id: t._id,
                    studentName: t.userName,
                    phone: t.userPhone,
                    category: t.category,
                    issueText: t.issueText,
                    submittedAt: t.createdAt,
                  })),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      if (name === "resolve_student_doubt") {
        const { ticketId, response, staffName = "AI Trainer" } = args;
        const ticket = await HelpTicket.findById(ticketId);

        if (!ticket) {
          return {
            content: [{ type: "text", text: `Help ticket with ID ${ticketId} not found.` }],
          };
        }

        ticket.status = "resolved";
        ticket.response = response;
        ticket.respondedBy = staffName;
        ticket.respondedByRole = "Trainer";
        ticket.respondedAt = new Date();
        await ticket.save();

        return {
          content: [
            {
              type: "text",
              text: `✅ Ticket resolved successfully for student ${ticket.userName} (${ticket.userPhone}). Response sent.`,
            },
          ],
        };
      }

      if (name === "get_daily_class_stats") {
        const totalUsers = await User.countDocuments();
        const submittedUsers = await User.countDocuments({ completed: true });
        const pendingUsers = await User.find({ completed: false }).select("name registeredName phone streak").limit(30);
        const topStreak = await User.find().sort({ streak: -1 }).limit(10).select("name registeredName streak monthlyScore");

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  totalStudents: totalUsers,
                  submittedToday: submittedUsers,
                  pendingCount: totalUsers - submittedUsers,
                  completionRate: totalUsers > 0 ? `${Math.round((submittedUsers / totalUsers) * 100)}%` : "0%",
                  topStreakLeaderboard: topStreak.map((u) => ({
                    name: u.registeredName || u.name,
                    streak: u.streak,
                    score: u.monthlyScore,
                  })),
                  pendingStudents: pendingUsers.map((u) => ({
                    name: u.registeredName || u.name,
                    phone: u.phone,
                    streak: u.streak,
                  })),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      if (name === "publish_and_send_today_question") {
        const { publishDailyQuestion } = await import("../services/scheduler/questionSchedulerService.js");
        const { sendDailyPosterToGroup } = await import("../services/whatsapp/whatsappService.js");
        const Status = (await import("../../models/statusSchema.js")).default;
        const dashboardService = await import("../services/dashboard/dashboardService.js");

        if (args?.force) {
          await Status.updateOne({}, { $set: { questionSentToday: false } });
        }

        const result = await publishDailyQuestion();

        if (result?.alreadyPublished) {
          const overview = await dashboardService.getTodayOverview();
          const today = overview?.today || {};

          const whatsappRes = await sendDailyPosterToGroup({
            topic: today.topic,
            question: today.question,
            category: today.category,
          });

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: true,
                    alreadyPublished: true,
                    whatsappSent: whatsappRes?.success ?? true,
                    topic: today.topic,
                    question: today.question,
                    category: today.category,
                    message: "Today's question was already published. Re-dispatched poster to WhatsApp group successfully!",
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  published: true,
                  whatsappSent: true,
                  type: result.type,
                  topic: result.topic,
                  category: result.category,
                  message: "Successfully published today's question and dispatched poster to WhatsApp group!",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      if (name === "get_whatsapp_status") {
        const { getStatus } = await import("../services/whatsapp/whatsappService.js");
        const status = getStatus();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  isConnected: status.isConnected,
                  isConnecting: status.isConnecting,
                  userPhone: status.userPhone || "Not connected",
                  targetGroup: status.targetGroup || "Not configured",
                  hasSavedSession: status.hasSavedCredentials,
                  qrCodeAvailable: !!status.qrCodeDataUrl,
                  qrCodeDataUrl: status.qrCodeDataUrl || null,
                  instructions: status.isConnected
                    ? "WhatsApp is connected and online."
                    : status.qrCodeDataUrl
                    ? "WhatsApp is disconnected. Scan the QR code data URL with WhatsApp (Linked Devices > Link a Device)."
                    : "WhatsApp is connecting/reconnecting. Use reconnect_whatsapp tool with force:true to force a fresh QR code if needed.",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      if (name === "reconnect_whatsapp") {
        const { restartWhatsAppBot } = await import("../services/whatsapp/whatsappService.js");
        const force = !!args?.force;
        await restartWhatsAppBot(force);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: force
                    ? "Session reset triggered. Generating fresh QR code... Check get_whatsapp_status in a few seconds."
                    : "Reconnection attempt initiated. Check get_whatsapp_status in a few seconds.",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      if (name === "get_bot_settings") {
        const dashboardService = await import("../services/dashboard/dashboardService.js");
        const settings = await dashboardService.getSettings();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(settings, null, 2),
            },
          ],
        };
      }

      if (name === "set_today_question") {
        const dashboardService = await import("../services/dashboard/dashboardService.js");
        const { topic, question, category = "General" } = args;
        const result = await dashboardService.setTodayQuestion(topic, question, category);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  updatedTodayQuestion: {
                    topic,
                    question,
                    category,
                  },
                  message: `Today's question has been updated to: "${topic}". Ask the user for confirmation in chat before sending to WhatsApp group!`,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      if (name === "send_today_question_to_group") {
        const { sendDailyPosterToGroup } = await import("../services/whatsapp/whatsappService.js");
        const { topic, question, category } = args || {};
        const dispatchRes = await sendDailyPosterToGroup({ topic, question, category });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  whatsappSent: dispatchRes?.success ?? true,
                  targetGroup: dispatchRes?.targetGroup,
                  topic: dispatchRes?.topic,
                  message: "Poster dispatched to WhatsApp group successfully!",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      if (name === "trigger_ai_code_deployment") {
        const dashboardController = await import("../controllers/dashboardController.js");
        const req = { body: args, user: { name: "ChatGPT Assistant", role: "admin" } };
        let resData = null;
        const res = {
          json: (data) => { resData = data; return data; },
          status: () => res,
        };

        await dashboardController.triggerAIDeployment(req, res);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(resData || { success: true, message: "Deployment triggered" }, null, 2),
            },
          ],
        };
      }

      if (name === "block_or_unblock_student") {
        const userService = await import("../services/user/userService.js");
        const result = await userService.toggleUserStatus(args.phone);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      if (name === "delete_student") {
        const userService = await import("../services/user/userService.js");
        const result = await userService.deleteUser(args.phone, "mcp_admin");

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      if (name === "adjust_student_points") {
        const userService = await import("../services/user/userService.js");
        const result = await userService.adjustUserPoints(args.phone, {
          amount: args.amount,
          mode: args.mode || "add",
          reason: args.reason || "",
        });

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      if (name === "adjust_student_streak") {
        const userService = await import("../services/user/userService.js");
        const result = await userService.adjustUserStreak(args.phone, {
          amount: args.amount,
          mode: args.mode || "add",
        });

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      if (name === "adjust_student_streak_freeze") {
        const userService = await import("../services/user/userService.js");
        const result = await userService.adjustUserFreeze(args.phone, {
          amount: args.amount,
          mode: args.mode || "add",
        });

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      if (name === "adjust_student_wallet") {
        const userService = await import("../services/user/userService.js");
        const result = await userService.adjustUserWallet(args.phone, {
          amount: args.amount,
          type: args.type || "credit",
          reason: args.reason || "MCP admin adjustment",
        });

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      if (name === "reset_student_login_attempts") {
        const userService = await import("../services/user/userService.js");
        const result = await userService.resetStudentLoginAttempts(args.phone);

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      if (name === "update_student_submitted_status") {
        const userService = await import("../services/user/userService.js");
        const result = await userService.toggleSubmissionStatus(args.phone);

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      if (name === "update_student_paid_status") {
        const userService = await import("../services/user/userService.js");
        const isPaid = args.paid !== undefined ? Boolean(args.paid) : true;
        const result = await userService.updateStudentPaidStatus(args.phone, isPaid);

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      if (name === "reset_weekly_submissions") {
        const userService = await import("../services/user/userService.js");
        const result = await userService.resetWeeklySubmissions();

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      if (name === "get_student_wallet_details") {
        const userService = await import("../services/user/userService.js");
        const result = await userService.getStudentWalletDetails(args.phone);

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      if (name === "send_custom_whatsapp_group_message") {
        const whatsappService = await import("../services/whatsapp/whatsappService.js");
        const result = await whatsappService.sendCustomGroupMessage(args.messageText, {
          imageUrl: args.imageUrl,
          audioUrl: args.audioUrl,
          asPoster: args.asPoster,
          targetGroup: args.targetGroup,
        });

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      throw new Error(`Tool not found: ${name}`);
    } catch (err) {
      return {
        isError: true,
        content: [{ type: "text", text: `Error executing ${name}: ${err.message}` }],
      };
    }
  });

  return mcpServer;
}
