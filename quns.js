import mongoose from "mongoose";
import dotenv from "dotenv";
import Question from "./models/questionSchema.js";

dotenv.config();

// 🔗 Connect DB
await mongoose.connect(process.env.MONGO_URI);
console.log("✅ DB Connected");

// 📌 Questions
const questions = [
  {
    quote: "Life is really simple, but we insist on making it complicated.",
    question: "What does this quote mean to you? Do you agree?",
  },
  {
    quote: "Success is not final, failure is not fatal.",
    question: "How do you handle success and failure in your life?",
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

// 🚀 Insert
const pushQuestions = async () => {
  try {
    await Question.insertMany(questions);
    console.log("🎉 Questions inserted successfully!");
  } catch (err) {
    console.log("❌ Error:", err);
  } finally {
    mongoose.connection.close();
  }
};

pushQuestions();
