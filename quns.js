import mongoose from "mongoose";
import dotenv from "dotenv";
import Question from "./models/questionSchema.js";

dotenv.config();

// 🔗 Connect DB
await mongoose.connect(process.env.MONGO_URI);
console.log("✅ DB Connected");

// 📌 Updated Questions (REMOVED one)
const questions = [
  { category: "Daily Life", topic: "Describe your daily routine and how you manage your time.", question: "What part of your day is most productive and why?" },
  { category: "Opinion", topic: "Is social media more helpful or harmful?", question: "Explain your opinion with examples." },
  { category: "Personal Experience", topic: "Talk about a mistake that taught you an important lesson.", question: "What did you learn from that experience?" },
  { category: "English Growth", topic: "What is the best way to improve spoken English?", question: "Share methods that worked for you or others." },
  { category: "Future Goals", topic: "Where do you see yourself in the next five years?", question: "What steps are you taking to reach that goal?" },
  { category: "Fun Topic", topic: "If you became rich today, what would you do first?", question: "How would your life change?" },
  { category: "Free Talk", topic: "Talk about any topic you like for one minute.", question: "Choose something interesting and express yourself freely." },
];

// 🚀 Delete old + Insert new
const pushQuestions = async () => {
  try {
    // ❌ REMOVE ALL OLD QUESTIONS
    await Question.deleteMany();
    console.log("🗑 Old questions deleted");

    // ✅ INSERT NEW QUESTIONS
    await Question.insertMany(questions);
    console.log("🎉 New questions inserted successfully!");
  } catch (err) {
    console.log("❌ Error:", err);
  } finally {
    mongoose.connection.close();
  }
};

//pushQuestions();

const getCount = async () => {
  try {
    const count = await Question.countDocuments();
    console.log("Total Questions:", count);
  } catch (err) {
    console.log("❌ Error:", err);
  } finally {
    mongoose.connection.close();
  }
};

getCount();
