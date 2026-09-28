import mongoose from "mongoose";

/**
 * HelpTicket Schema
 * Stores student-raised doubts, grammar questions, platform issues, and trainer/admin responses.
 */
const helpTicketSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    userName: {
      type: String,
      required: true,
      trim: true,
    },
    userPhone: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    userRole: {
      type: String,
      default: "user",
    },
    category: {
      type: String,
      enum: ["grammar", "speaking", "task_help", "technical", "general"],
      default: "grammar",
      index: true,
    },
    issueText: {
      type: String,
      required: true,
      maxlength: 2500,
      trim: true,
    },
    status: {
      type: String,
      enum: ["pending", "in_progress", "resolved"],
      default: "pending",
      index: true,
    },
    response: {
      type: String,
      default: "",
      maxlength: 3000,
      trim: true,
    },
    respondedBy: {
      type: String,
      default: "",
    },
    respondedByRole: {
      type: String,
      default: "",
    },
    respondedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

// Indexes for fast queue queries
helpTicketSchema.index({ status: 1, createdAt: -1 });
helpTicketSchema.index({ userPhone: 1, createdAt: -1 });

export default mongoose.models.HelpTicket || mongoose.model("HelpTicket", helpTicketSchema);
