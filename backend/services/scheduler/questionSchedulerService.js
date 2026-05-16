/**
 * Question Scheduler Service
 * Business logic for daily question publishing
 */

import Status from "../../../models/statusSchema.js";
import Question from "../../../models/questionSchema.js";
import { generateAndInsertQuestions } from "../ai/questionGenerator.js";
import { getManualQuestionForDate } from "../questions/questionsService.js";

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
 * Now checks for manual questions first before using defaults
 */
export async function publishDailyQuestion() {
  try {
    const statusCheck = await Status.findOne();
    if (statusCheck?.questionSentToday) {
      return { alreadyPublished: true };
    }

    const today = new Date();

    // ── 1st of month → Monthly Goal Setting (takes priority over Sunday) ─
    if (isFirstDayOfMonth()) {
      // Check for manual monthly goals question first
      const manualQuestion = await getManualQuestionForDate(today, "monthly_goals");
      
      if (manualQuestion) {
        await Status.updateOne({}, {
          $set: {
            questionSentToday: true,
            isMonthlyGoalsDay: true,
            todayTopic: manualQuestion.topic,
            todayQuestion: manualQuestion.question,
            todayCategory: manualQuestion.category,
          }
        }, { upsert: true });
        
        return { 
          published: true, 
          type: "monthly_goals",
          topic: manualQuestion.topic,
          source: "manual"
        };
      }

      // Use default questions if no manual question
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
        topic: MONTHLY_GOALS_TOPIC,
        source: "default"
      };
    }

    // ── Last day of month → Monthly Reflection (takes priority over Sunday)
    if (isLastDayOfMonth()) {
      // Check for manual monthly reflection question first
      const manualQuestion = await getManualQuestionForDate(today, "monthly_reflection");
      
      if (manualQuestion) {
        await Status.updateOne({}, {
          $set: {
            questionSentToday: true,
            isMonthlyReflectionDay: true,
            todayTopic: manualQuestion.topic,
            todayQuestion: manualQuestion.question,
            todayCategory: manualQuestion.category,
          }
        }, { upsert: true });
        
        return { 
          published: true, 
          type: "monthly_reflection",
          topic: manualQuestion.topic,
          source: "manual"
        };
      }

      // Use default questions if no manual question
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
        topic: MONTHLY_REFLECTION_TOPIC,
        source: "default"
      };
    }

    // ── Sunday → Weekly Reflection ────────────────────────────────────────
    if (isSunday()) {
      // Check for manual weekly reflection question first
      const manualQuestion = await getManualQuestionForDate(today, "weekly_reflection");
      
      if (manualQuestion) {
        await Status.updateOne({}, {
          $set: {
            questionSentToday: true,
            isWeeklyReflectionDay: true,
            todayTopic: manualQuestion.topic,
            todayQuestion: manualQuestion.question,
            todayCategory: manualQuestion.category,
          }
        }, { upsert: true });
        
        return { 
          published: true, 
          type: "weekly_reflection",
          topic: manualQuestion.topic,
          source: "manual"
        };
      }

      // Use default questions if no manual question
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
        topic: WEEKLY_REFLECTION_TOPIC,
        source: "default"
      };
    }

    // ── Regular day: pick a question from bank ────────────────────────────
    
    // Ensure question bank has questions (only regular questions, not manual setup)
    let count = await Question.countDocuments({ isManualSetup: { $ne: true } });
    if (count === 0) {
      console.log("[QuestionScheduler] Question bank empty — auto-generating 14...");
      try {
        const { totalInDb } = await generateAndInsertQuestions(14);
        count = await Question.countDocuments({ isManualSetup: { $ne: true } });
        console.log(`[QuestionScheduler] Generated questions. Total regular: ${count}`);
      } catch (err) {
        console.log("[QuestionScheduler] Auto-generate failed:", err.message);
        throw new Error("Failed to generate questions");
      }
    } else if (count <= 7) {
      // Refill in background
      generateAndInsertQuestions(14)
        .then(({ inserted }) => {
          const regularCount = inserted.filter(q => !q.isManualSetup).length;
          console.log(`[QuestionScheduler] Auto-refill: +${regularCount} regular questions`);
        })
        .catch(err => 
          console.log("[QuestionScheduler] Background refill failed:", err.message)
        );
    }

    // Pick a question avoiding recent categories (only from regular questions)
    // Keep at most (CATEGORIES - 1) recent entries so there's always ≥1 fresh category
    const ALL_CATS = 7; // Daily Life, Opinion, Personal Experience, English Growth, Future Goals, Fun Topic, Free Talk
    const MAX_RECENT = ALL_CATS - 1; // 6 — always leaves at least 1 category available

    const statusDoc = await Status.findOne();
    const recentCategories = (statusDoc?.recentCategories || []).slice(-MAX_RECENT);

    let q = null;
    if (recentCategories.length > 0) {
      const fresh = await Question.aggregate([
        { $match: { 
          category: { $nin: recentCategories },
          isManualSetup: { $ne: true }
        }},
        { $sample: { size: 1 } },
      ]);
      if (fresh?.length) q = fresh;
    }
    
    if (!q || !q.length) {
      // All categories recently used — pick the least-recently-used one
      // (oldest entry in recentCategories array, or fully random if array empty)
      const lruCategory = recentCategories.length > 0 ? recentCategories[0] : null;
      if (lruCategory) {
        const lruQ = await Question.aggregate([
          { $match: { category: lruCategory, isManualSetup: { $ne: true } }},
          { $sample: { size: 1 } },
        ]);
        if (lruQ?.length) q = lruQ;
      }
    }

    if (!q || !q.length) {
      q = await Question.aggregate([
        { $match: { isManualSetup: { $ne: true } }},
        { $sample: { size: 1 } }
      ]);
    }
    
    if (!q || !q.length) {
      throw new Error("No regular questions available");
    }

    const question = q[0];
    // Slide the window: add new category, keep only last MAX_RECENT
    const updatedRecent = question.category
      ? [...new Set([...recentCategories, question.category])].slice(-MAX_RECENT)
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
      category: question.category,
      source: "generated"
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
