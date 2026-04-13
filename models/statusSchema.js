import mongoose from "mongoose";

const statusSchema = new mongoose.Schema({
  questionSentToday: {
    type: Boolean,
    default: false,
  },
  notifiedEmpty: {
    type: Boolean,
    default: false,
  },
  notifiedLast: {
    type: Boolean,
    default: false,
  },
});

export default mongoose.model("Status", statusSchema);