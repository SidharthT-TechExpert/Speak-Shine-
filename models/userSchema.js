import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  userId: String,
  fine: { type: Number, default: 0 },
  completed: { type: Boolean, default: false },
});

export default mongoose.model("User", userSchema);