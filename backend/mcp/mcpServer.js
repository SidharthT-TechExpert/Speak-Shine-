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
