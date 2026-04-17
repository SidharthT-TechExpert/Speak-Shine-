import mongoose from "mongoose";
import dotenv from "dotenv";
import Question from "./models/questionSchema.js";

dotenv.config();

// 🔗 Connect DB
await mongoose.connect(process.env.MONGO_URI);
console.log("✅ DB Connected");

// 📌 Updated Questions (REMOVED one)
const questions = [
  {
    quote: "Life is really simple, but we insist on making it complicated.",
    question: "What does this quote mean to you? Do you agree?",
  },
  {
    quote: "The only way to do great work is to love what you do.",
    question: "Do you think passion is important for success? Why?",
  },
  {
    quote: "Do what you can, with what you have, where you are.",
    question: "How can people make the best use of their current situation?",
  },
  {
    quote: "Happiness depends upon ourselves.",
    question: "What makes you happy? Do you think happiness is in our control?",
  },
  {
    quote: "In the middle of difficulty lies opportunity.",
    question:
      "Can you share a situation where a problem became an opportunity?",
  },
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
