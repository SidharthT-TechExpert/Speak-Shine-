import HelpTicket from "../../models/helpTicketSchema.js";
import { getSharedSocket } from "../hooks/useSocket.js";

/**
 * POST /api/help-tickets/raise
 * Student raises a problem, grammar doubt, or technical issue.
 */
export async function raiseTicket(req, res) {
  try {
    const { category = "grammar", issueText } = req.body;
    if (!issueText || !issueText.trim()) {
      return res.status(400).json({ error: "Please provide a description of your question or problem." });
    }

    const ticket = await HelpTicket.create({
      userId: req.user?._id || req.user?.id || null,
      userName: req.user?.name || "Student",
      userPhone: req.user?.phone || "Unknown",
      userRole: req.user?.role || "user",
      category: ["grammar", "speaking", "task_help", "technical", "general"].includes(category) ? category : "grammar",
      issueText: issueText.trim(),
      status: "pending",
    });

    // Broadcast socket event to staff
    try {
      const socket = getSharedSocket();
      if (socket) {
        socket.emit("help_ticket:raised", ticket);
      }
    } catch {}

    res.status(201).json({ success: true, ticket });
  } catch (error) {
    console.error("[HelpTicket] Raise ticket error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/help-tickets/my-tickets
 * Student fetches their submitted tickets & responses.
 */
export async function getMyTickets(req, res) {
  try {
    const phone = req.user?.phone;
    if (!phone) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const tickets = await HelpTicket.find({ userPhone: phone })
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, tickets });
  } catch (error) {
    console.error("[HelpTicket] Get my tickets error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/help-tickets/admin/tickets
 * Admin & Trainer fetch incoming student help requests.
 */
export async function getAdminTickets(req, res) {
  try {
    const { status } = req.query;
    const filter = {};
    if (status && ["pending", "in_progress", "resolved"].includes(status)) {
      filter.status = status;
    }

    const tickets = await HelpTicket.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    const pendingCount = await HelpTicket.countDocuments({ status: "pending" });
    const resolvedCount = await HelpTicket.countDocuments({ status: "resolved" });

    res.json({
      success: true,
      tickets,
      counts: {
        pending: pendingCount,
        resolved: resolvedCount,
        total: tickets.length,
      },
    });
  } catch (error) {
    console.error("[HelpTicket] Get admin tickets error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/help-tickets/admin/respond/:id
 * Admin / Trainer submits a response & marks the ticket resolved.
 */
export async function respondTicket(req, res) {
  try {
    const { id } = req.params;
    const { response } = req.body;

    if (!response || !response.trim()) {
      return res.status(400).json({ error: "Please write a solution or response for the student." });
    }

    const ticket = await HelpTicket.findById(id);
    if (!ticket) {
      return res.status(404).json({ error: "Help request not found." });
    }

    ticket.response = response.trim();
    ticket.respondedBy = req.user?.name || req.user?.phone || "Staff";
    ticket.respondedByRole = req.user?.role || "trainer";
    ticket.respondedAt = new Date();
    ticket.status = "resolved";

    await ticket.save();

    // Broadcast socket event to student
    try {
      const socket = getSharedSocket();
      if (socket) {
        socket.emit("help_ticket:resolved", ticket);
      }
    } catch {}

    res.json({ success: true, ticket });
  } catch (error) {
    console.error("[HelpTicket] Respond ticket error:", error.message);
    res.status(500).json({ error: error.message });
  }
}
