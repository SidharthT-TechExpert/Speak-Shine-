import mongoose from "mongoose";

const questionSchema = new mongoose.Schema(
  {
    category: String,
    topic: String,
    question: String,
  },
  { timestamps: true },
);

export default mongoose.model("Question", questionSchema);
