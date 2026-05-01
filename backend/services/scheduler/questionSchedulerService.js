/**
 * Question Scheduler Service
 * Business logic for daily question publishing
 */

import Status from "../../../models/statusSchema.js";
import Question from "../../../models/questionSchema.js";
import { generateAndInsertQuestions } from "../ai/questionGenerator.js";

// Monthly reflection questions — shown on the last day of every month
export const MONTHLY_REFLECTION_QUESTIONS = [
  "How many reviews did you attend this month?",
  "How many reviews passed and how many failed? Why did you fail?",
  "How many extensions did you take this month?",
  "What is your current growth and progress in the program?",
  "What did you do this month to improve your communication skill?",
  "What is your communication skill level now compared to last month?",
];
export const MONTHLY_REFLECTION_TOPIC = "Monthly Reflection";
export const MONTHLY_REFLECTION_CATEGORY = "Monthly Reflection";

// Monthly goal-setting questions — shown on the 1st of every month
export const MONTHLY_GOALS_QUESTIONS = [
  "What is your main goal for this month in the program?",
  "What is your dream or target you are working toward right now?",
  "What specific steps will you take this month to improve your communication?",
  "What was your biggest challenge last month and how will you overcome it this month?",
  "How many reviews are you planning to attend this month?",
  "What will you do differently this month to grow faster?",
];
export const MONTHLY_GOALS_TOPIC = "Monthly Goal Setting";
export const MONTHLY_GOALS_CATEGORY = "Monthly Goals";

// Weekly reflection questions — shown every Sunday
export const WEEKLY_REFLECTION_QUESTIONS = [
  "Did you attend your review this week? If yes, did you pass or fail? Why?",
  "How many days did you submit your speaking video this week?",
  "What was the best speaking moment you had this week?",
  "What was the most difficult part of speaking this week?",
  "What new word or phrase did you learn and use this week?",
  "What is your focus for next week — in both review preparation and communication?",
];
export const WEEKLY_REFLECTION_TOPIC = "Weekly Reflection";
export const WEEKLY_REFLECTION_CATEGORY = "Weekly Reflection";

/**
 * Check if today is the last day of the month (IST)
 */
function isLastDayOfMonth() {
  const now = new Date();
  const istDate = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const lastDate = new Date(istDate.getFullYear(), istDate.getMonth() + 1, 0).getDate();
  return istDate.getDate() === lastDate;
}

/**
 * Check if today is the 1st of the month (IST)
 */
function isFirstDayOfMonth() {
  const now = new Date();
  const istDate = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  return istDate.getDate() === 1;
}

/**
 * Check if today is Sunday (IST)
 */
function isSunday() {
  const now = new Date();
  const istDate = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  return istDate.getDay() === 0; // 0 = Sunday
}

/**
 * Publish daily question
 * Handles special days (monthly reflection, goals, weekly reflection) and regular questions
 */
export async function publishDailyQuestion() {
  try {
    const statusCheck = await Status.findOne();
    if (statusCheck?.questionSentToday) {
      return { alreadyPublished: true };
    }

    // ── 1st of month → Monthly Goal Setting (takes priority over Sunday) ─
    if (isFirstDayOfMonth()) {
      const goalsText = MONTHLY_GOALS_QUESTIONS
        .map((q, i) => `${i + 1}. ${q}`)
        .join("\n");
      
      await Status.updateOne({}, {
        $set: {
          questionSentToday: true,
          isMonthlyGoalsDay: true,
          todayTopic: MONTHLY_GOALS_TOPIC,
          todayQuestion: goalsText,
          todayCategory: MONTHLY_GOALS_CATEGORY,
        }
      }, { upsert: true });
      
      return { 
        published: true, 
        type: "monthly_goals",
        topic: MONTHLY_GOALS_TOPIC 
      };
    }

    // ── Last day of month → Monthly Reflection (takes priority over Sunday)
    if (isLastDayOfMonth()) {
      const reflectionText = MONTHLY_REFLECTION_QUESTIONS
        .map((q, i) => `${i + 1}. ${q}`)
        .join("\n");
      
      await Status.updateOne({}, {
        $set: {
          questionSentToday: true,
          isMonthlyReflectionDay: true,
          todayTopic: MONTHLY_REFLECTION_TOPIC,
          todayQuestion: reflectionText,
          todayCategory: MONTHLY_REFLECTION_CATEGORY,
        }
      }, { upsert: true });
      
      return { 
        published: true, 
        type: "monthly_reflection",
        topic: MONTHLY_REFLECTION_TOPIC 
      };
    }

    // ── Sunday → Weekly Reflection ────────────────────────────────────────
    if (isSunday()) {
      const weeklyText = WEEKLY_REFLECTION_QUESTIONS
        .map((q, i) => `${i + 1}. ${q}`)
        .join("\n");
      
      await Status.updateOne({}, {
        $set: {
          questionSentToday: true,
          isWeeklyReflectionDay: true,
          todayTopic: WEEKLY_REFLECTION_TOPIC,
          todayQuestion: weeklyText,
          todayCategory: WEEKLY_REFLECTION_CATEGORY,
        }
      }, { upsert: true });
      
      return { 
        published: true, 
        type: "weekly_reflection",
        topic: WEEKLY_REFLECTION_TOPIC 
      };
    }

    // ── Regular day: pick a question from bank ────────────────────────────
    
    // Ensure question bank has questions
    let count = await Question.countDocuments();
    if (count === 0) {
      console.log("[QuestionScheduler] Question bank empty — auto-generating 14...");
      try {
        const { totalInDb } = await generateAndInsertQuestions(14);
        count = totalInDb;
        console.log(`[QuestionScheduler] Generated questions. Total: ${count}`);
      } catch (err) {
        console.log("[QuestionScheduler] Auto-generate failed:", err.message);
        throw new Error("Failed to generate questions");
      }
    } else if (count <= 7) {
      // Refill in background
      generateAndInsertQuestions(14)
        .then(({ inserted, totalInDb }) => 
          console.log(`[QuestionScheduler] Auto-refill: +${inserted.length} questions. Total: ${totalInDb}`)
        )
        .catch(err => 
          console.log("[QuestionScheduler] Background refill failed:", err.message)
        );
    }

    // Pick a question avoiding recent categories
    const statusDoc = await Status.findOne();
    const recentCategories = statusDoc?.recentCategories || [];

    let q = null;
    if (recentCategories.length > 0) {
      const fresh = await Question.aggregate([
        { $match: { category: { $nin: recentCategories } } },
        { $sample: { size: 1 } },
      ]);
      if (fresh?.length) q = fresh;
    }
    
    if (!q || !q.length) {
      q = await Question.aggregate([{ $sample: { size: 1 } }]);
    }
    
    if (!q || !q.length) {
      throw new Error("No questions available");
    }

    const question = q[0];
    const updatedRecent = question.category
      ? [...new Set([...recentCategories, question.category])].slice(-7)
      : recentCategories;

    await Status.updateOne({}, {
      $set: {
        questionSentToday: true,
        todayTopic: question.topic || null,
        todayQuestion: question.question || null,
        todayCategory: question.category || null,
        recentCategories: updatedRecent,
      }
    }, { upsert: true });

    await Question.findByIdAndDelete(question._id);
    
    return { 
      published: true, 
      type: "regular",
      topic: question.topic,
      category: question.category 
    };
  } catch (err) {
    console.error("[QuestionScheduler] Error:", err.message);
    throw err;
  }
}

/**
 * Check if it's time to publish question based on configured time
 */
export async function shouldPublishQuestion() {
  try {
    const status = await Status.findOne().lean();
    if (!status) return false;

    const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const nowTime = `${String(nowIST.getHours()).padStart(2, "0")}:${String(nowIST.getMinutes()).padStart(2, "0")}`;

    const sendTime = status.posterSendTime || "08:00";
    
    return nowTime === sendTime && !status.questionSentToday;
  } catch (err) {
    console.error("[QuestionScheduler] Check time error:", err.message);
    return false;
  }
}

/**
 * Catch-up: publish question if scheduled time already passed today
 */
export async function catchUpPublishQuestion() {
  try {
    const status = await Status.findOne().lean();
    if (!status || status.questionSentToday) return { catchUpNeeded: false };

    const sendTime = status.posterSendTime || "08:00";
    const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const nowMins = nowIST.getHours() * 60 + nowIST.getMinutes();
    const [sh, sm] = sendTime.split(":").map(Number);
    const sendMins = sh * 60 + sm;

    // If within 4-hour window after scheduled time
    if (nowMins >= sendMins && nowMins <= sendMins + 240) {
      const result = await publishDailyQuestion();
      return { catchUpNeeded: true, ...result };
    }

    return { catchUpNeeded: false };
  } catch (err) {
    console.error("[QuestionScheduler] Catch-up error:", err.message);
    throw err;
  }
}
