import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import Notification from "../../models/notificationSchema.js";

const router = express.Router();
router.use(authMiddleware);

// GET /api/notifications — fetch unread notifications for logged-in user
router.get("/", async (req, res) => {
  try {
    const notifications = await Notification.find({
      recipientPhone: req.user.phone,
    })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

// PATCH /api/notifications/read — mark all as read
router.patch("/read", async (req, res) => {
  try {
    await Notification.updateMany(
      { recipientPhone: req.user.phone, read: false },
      { $set: { read: true } }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to mark as read" });
  }
});

// PATCH /api/notifications/:id/read — mark one as read
router.patch("/:id/read", async (req, res) => {
  try {
    await Notification.findOneAndUpdate(
      { _id: req.params.id, recipientPhone: req.user.phone },
      { $set: { read: true } }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to mark as read" });
  }
});

export default router;
