import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  userId: { type: String, unique: true },
  name: { type: String, default: null }, // WhatsApp push name
  fine: { type: Number, default: 0 },
  completed: { type: Boolean, default: false },
  streak: { type: Number, default: 0 }, // consecutive days submitted
});

export default mongoose.model("User", userSchema);