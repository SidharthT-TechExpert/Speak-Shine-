import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  userId: { type: String, unique: true },
  name: { type: String, default: null }, // WhatsApp push name
  fine: { type: Number, default: 0 },
  completed: { type: Boolean, default: false },
  streak: { type: Number, default: 0 }, // consecutive days submitted
  weeklySubmissions: { type: Number, default: 0 }, // resets every Sunday
  weeklyFine: { type: Number, default: 0 }, // fines collected this week, resets every Sunday
});

export default mongoose.model("User", userSchema);