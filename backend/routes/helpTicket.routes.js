import express from "express";
import * as helpTicketController from "../controllers/helpTicketController.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";

const router = express.Router();

// Student endpoints
router.post("/raise", authMiddleware, helpTicketController.raiseTicket);
router.get("/my-tickets", authMiddleware, helpTicketController.getMyTickets);

// Staff endpoints (Admin & Trainer)
router.get(
  "/admin/tickets",
  authMiddleware,
  requireRole("admin", "admins", "trainer", "viewer"),
  helpTicketController.getAdminTickets
);

router.post(
  "/admin/respond/:id",
  authMiddleware,
  requireRole("admin", "admins", "trainer"),
  helpTicketController.respondTicket
);

export default router;
