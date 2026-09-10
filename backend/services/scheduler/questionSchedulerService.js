/**
 * Question Scheduler Service
 * Business logic for daily question publishing
 */

import Status from "../../../models/statusSchema.js";
import Question from "../../../models/questionSchema.js";
import { generateAndInsertQuestions } from "../ai/questionGenerator.js";
import { getDueManualQuestion, getManualQuestionForDate } from "../questions/questionsService.js";
import { ensureTodayVocabulary } from "../ai/vocabularyGenerator.js";

/**
 * Sends today's poster to TARGET_GROUP on WhatsApp if connected.
 */
async function dispatchPosterToWhatsApp(details = {}) {
  try {
    if (process.env.TARGET_GROUP) {
      const { sendDailyPosterToGroup } = await import("../whatsapp/whatsappService.js");
      await sendDailyPosterToGroup(details);
    }
  } catch (err) {
    console.warn("[QuestionScheduler] WhatsApp poster auto-send skipped/failed:", err.message);
  }
}

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

export const STORY_SUMMARY_TOPIC = "Story Summary";
export const STORY_SUMMARY_CATEGORY = "Listening Practice";

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
 * Check if today is the story summary day (IST).
 * Uses storyDays from DB settings (fallback to storyDay, default [6] = Saturday).
 */
async function isStoryDay() {
  try {
    const status = await Status.findOne().select("storyDays storyDay").lean();
    let days = [];
    if (Array.isArray(status?.storyDays) && status.storyDays.length > 0) {
      days = status.storyDays;
    } else if (status?.storyDay !== undefined && status.storyDay !== null && status.storyDay !== -1) {
      days = [status.storyDay];
    } else if (status?.storyDay === -1) {
      days = [];
    } else {
      days = [6]; // default Saturday
    }
    if (days.length === 0) return false;
    const now = new Date();
    const istDate = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    return days.includes(istDate.getDay());
  } catch {
    // Fallback to Saturday if DB is unavailable
    const now = new Date();
    const istDate = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    return istDate.getDay() === 6;
  }
}

/**
 * Check if today is Saturday (IST) — kept for backwards compat
 */
function isSaturday() {
  const now = new Date();
  const istDate = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  return istDate.getDay() === 6; // 6 = Saturday
}

/**
 * Check if today is the picture description day (IST).
 * Uses pictureDescriptionDays from DB settings (fallback to pictureDescriptionDay, default [4] = Thursday).
 * Returns false if empty or disabled.
 */
async function isPictureDescriptionDay() {
  try {
    const status = await Status.findOne().select("pictureDescriptionDays pictureDescriptionDay").lean();
    let days = [];
    if (Array.isArray(status?.pictureDescriptionDays)) {
      days = status.pictureDescriptionDays;
    } else if (status?.pictureDescriptionDay !== undefined && status.pictureDescriptionDay !== null && status.pictureDescriptionDay !== -1) {
      days = [status.pictureDescriptionDay];
    } else if (status?.pictureDescriptionDay === -1) {
      days = [];
    } else {
      days = [4]; // default Thursday
    }
    if (days.length === 0) return false;
    const istDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    return days.includes(istDate.getDay());
  } catch {
    return false;
  }
}

/**
 * Auto-generate and publish a Picture Description challenge.
 * Skips with a non-fatal error if PEXELS_API_KEY is not set.
 */
async function publishAutoPictureDescription() {
  try {
    const { generatePictureDescriptionChallenge } = await import("../ai/pictureDescriptionGenerator.js");

    console.log("[QuestionScheduler] 🖼️  Auto-generating Picture Description challenge…");
    const challenge = await generatePictureDescriptionChallenge();

    await Status.updateOne({}, {
      $set: {
        questionSentToday: true,
        isPictureDescriptionDay: true,
        isStorySummaryDay: false,
        isMonthlyReflectionDay: false,
        isMonthlyGoalsDay: false,
        todayContentType: "picture_description",
        todayTopic: challenge.title,
        todayQuestion: challenge.instructions,
        todayCategory: "Picture Description",
        todayImageUrl: challenge.imageUrl,
        todayImageSource: challenge.imageSource,
        todayImagePageUrl: challenge.imagePageUrl,
        todayImagePhotographer: challenge.imagePhotographer,
        todayImagePhotographerUrl: challenge.imagePhotographerUrl,
        todayImageSearchQuery: challenge.imageQuery,
        todayImageInstructions: challenge.instructions,
        todayAudioUrl: null,
        todayStoryTranscript: null,
        todaySummaryGuide: null,
        todayPosterImage: null,
        todayVocabulary: [],
      }
    }, { upsert: true });

    console.log(`[QuestionScheduler] ✅ Picture Description published: "${challenge.title}"`);
    await ensureTodayVocabulary().catch(err =>
      console.warn("[QuestionScheduler] Vocabulary generation failed (non-fatal):", err.message)
    );
    dispatchPosterToWhatsApp({ topic: challenge.title, question: challenge.instructions, category: "Picture Description" });
    return { published: true, type: "picture_description", topic: challenge.title, source: "auto" };
  } catch (err) {
    console.error("[QuestionScheduler] Picture Description auto-publish failed:", err.message);
    return { published: false, error: err.message };
  }
}

/**
 * Auto-generate and publish a story summary for the configured story day.
 * Skips if a manual story is already scheduled for today.
 */
export async function publishAutoSaturdayStory() {
  try {
    const { generateListeningStory } = await import("../ai/storyGenerator.js");
    const { generateAndUploadStoryAudio } = await import("../ai/storyAudioService.js");

    const status = await Status.findOne().lean();
    const wordCount = status?.storyWordCount ?? 200;
    const usedThemes = status?.usedStoryThemes || [];

    console.log("[QuestionScheduler] 🎧 Auto-generating Saturday story…");
    const story = await generateListeningStory({ wordCount, usedThemes });

    // Generate and upload audio with character-adapted voice
    const audioResult = await generateAndUploadStoryAudio(
      story.story,
      story.topic,
      story.voiceRecommendation?.voiceId,
      story.voiceRecommendation?.voiceSettings,
      story.character
    );
    const audioUrl = typeof audioResult === "string" ? audioResult : audioResult.audioUrl;
    console.log(`[QuestionScheduler] 🎭 Story audio created using voice: ${audioResult.voiceUsed?.name || "Adaptive"} (${audioResult.voiceUsed?.vibe || ""}) for character: "${story.character?.name || "Protagonist"}"`);

    // Save used theme
    await Status.updateOne({}, { $addToSet: { usedStoryThemes: story.theme } }, { upsert: true });

    // Publish as story summary day
    await Status.updateOne({}, {
      $set: {
        questionSentToday: true,
        isStorySummaryDay: true,
        isMonthlyReflectionDay: false,
        isMonthlyGoalsDay: false,
        todayContentType: "story_audio",
        todayTopic: story.topic,
        todayQuestion: story.question,
        todayCategory: STORY_SUMMARY_CATEGORY,
        todayAudioUrl: audioUrl,
        todayStoryTranscript: story.story,
        todaySummaryGuide: story.summaryGuide.join("\n"),
        todayPosterImage: null,
        todayVocabulary: [],
      }
    }, { upsert: true });

    console.log(`[QuestionScheduler] ✅ Story summary published: "${story.topic}"`);
    await ensureTodayVocabulary().catch(err =>
      console.warn("[QuestionScheduler] Vocabulary generation failed (non-fatal):", err.message)
    );
    dispatchPosterToWhatsApp({ topic: story.topic, question: story.question, category: STORY_SUMMARY_CATEGORY });
    return { published: true, type: "story_summary", topic: story.topic, source: "auto" };
  } catch (err) {
    console.error("[QuestionScheduler] Story summary auto-publish failed:", err.message);
    return { published: false, error: err.message };
  }
}

export const publishAutoStorySummary = publishAutoSaturdayStory;

/**
 * Publish any manual question (story, picture, normal, monthly reflection, monthly goals)
 */
export async function publishManualQuestion(q) {
  if (!q) return { published: false };

  const isStory = q.setupType === "story_summary";
  const isPicture = q.setupType === "picture_description";
  const isReflection = q.setupType === "monthly_reflection";
  const isGoals = q.setupType === "monthly_goals";

  await Status.updateOne({}, {
    $set: {
      questionSentToday: true,
      todayContentType: isStory ? "story_audio" : isPicture ? "picture_description" : "question",
      isStorySummaryDay: isStory,
      isPictureDescriptionDay: isPicture,
      isMonthlyReflectionDay: isReflection,
      isMonthlyGoalsDay: isGoals,
      todayTopic: q.topic || (isStory ? STORY_SUMMARY_TOPIC : isPicture ? PICTURE_DESCRIPTION_CATEGORY : isReflection ? MONTHLY_REFLECTION_TOPIC : isGoals ? MONTHLY_GOALS_TOPIC : "Daily Practice"),
      todayQuestion: q.question,
      todayCategory: q.category || (isStory ? STORY_SUMMARY_CATEGORY : isPicture ? PICTURE_DESCRIPTION_CATEGORY : isReflection ? MONTHLY_REFLECTION_CATEGORY : isGoals ? MONTHLY_GOALS_CATEGORY : "General"),
      todayAudioUrl: q.audioUrl || null,
      todayStoryTranscript: q.storyTranscript || null,
      todaySummaryGuide: q.summaryGuide || null,
      todayImageUrl: q.imageUrl || null,
      todayImageSource: q.imageSource || null,
      todayImagePageUrl: q.imagePageUrl || null,
      todayImagePhotographer: q.imagePhotographer || null,
      todayImagePhotographerUrl: q.imagePhotographerUrl || null,
      todayImageSearchQuery: q.imageSearchQuery || null,
      todayImageInstructions: q.imageInstructions || null,
      todayPosterImage: null,
      todayVocabulary: [],
    }
  }, { upsert: true });

  await Question.findByIdAndUpdate(q._id, { isUsed: true });

  await ensureTodayVocabulary().catch(err =>
    console.warn("[QuestionScheduler] Vocabulary generation failed (non-fatal):", err.message)
  );

  dispatchPosterToWhatsApp({
    topic: q.topic,
    question: q.question,
    category: q.category,
  });

  return {
    published: true,
    type: q.setupType || "normal",
    topic: q.topic,
    source: "manual"
  };
}

/**
 * Publish any due manual task by exact scheduled datetime.
 */
export async function publishDueManualQuestion(now = new Date()) {
  const manualQuestion = await getDueManualQuestion(null, now);
  if (!manualQuestion) return { published: false };
  return publishManualQuestion(manualQuestion);
}

export async function publishDueManualStoryQuestion(now = new Date()) {
  const storyQuestion = await getDueManualQuestion("story_summary", now);
  if (!storyQuestion) return { published: false };
  return publishManualQuestion(storyQuestion);
}

const PICTURE_DESCRIPTION_CATEGORY = "Picture Description";

export async function publishDueManualPictureDescriptionQuestion(now = new Date()) {
  const q = await getDueManualQuestion("picture_description", now);
  if (!q) return { published: false };
  return publishManualQuestion(q);
}

/**
 * Publish daily question
 * Handles special days (monthly reflection, monthly goals) and regular questions
 * Now checks for manual questions first before using defaults
 */
export async function publishDailyQuestion() {
  try {
    const statusCheck = await Status.findOne();
    if (statusCheck?.questionSentToday) {
      return { alreadyPublished: true };
    }

    const today = new Date();

    // ── 0. Check for any due or scheduled manual question for today first ──────
    const dueManual = await publishDueManualQuestion(today);
    if (dueManual.published) return dueManual;

    const todayManual = await getManualQuestionForDate(today, null);
    if (todayManual) {
      return await publishManualQuestion(todayManual);
    }

    // ── 1. Last day of month → Monthly Reflection (Highest milestone priority) ──
    if (isLastDayOfMonth()) {
      // Check for manual monthly reflection question first
      const manualQuestion = await getManualQuestionForDate(today, "monthly_reflection");
      
      if (manualQuestion) {
        await Status.updateOne({}, {
          $set: {
            questionSentToday: true,
            isMonthlyReflectionDay: true,
            isMonthlyGoalsDay: false,
            isStorySummaryDay: false,
            isPictureDescriptionDay: false,
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
          isMonthlyGoalsDay: false,
          isStorySummaryDay: false,
          isPictureDescriptionDay: false,
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

    // ── 2. Due Manual Story Task ──────────────────────────────────────────
    const dueStory = await publishDueManualStoryQuestion();
    if (dueStory.published) return dueStory;

    // ── 3. Due Manual Picture Description Task ────────────────────────────
    const duePicture = await publishDueManualPictureDescriptionQuestion();
    if (duePicture.published) return duePicture;

    // ── 4. Story Summary Day → Auto Story Summary (e.g. Saturday) ────────
    if (await isStoryDay()) {
      return await publishAutoSaturdayStory();
    }

    // ── 5. Picture Description Day → Auto Picture Description (e.g. Thursday) ──
    if (await isPictureDescriptionDay()) {
      const result = await publishAutoPictureDescription();
      if (result.published) return result;
      // If picture generation failed (e.g. no Pexels key), log and fall through
      // to next challenge so users still get a task today.
      console.warn("[QuestionScheduler] ⚠️  Picture Description failed — falling back to next task");
    }

    // ── 6. 1st of month → Monthly Goal Setting (lower priority than story/picture) ──
    if (isFirstDayOfMonth()) {
      // Check for manual monthly goals question first
      const manualQuestion = await getManualQuestionForDate(today, "monthly_goals");
      
      if (manualQuestion) {
        await Status.updateOne({}, {
          $set: {
            questionSentToday: true,
            isMonthlyGoalsDay: true,
            isMonthlyReflectionDay: false,
            isStorySummaryDay: false,
            isPictureDescriptionDay: false,
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
          isMonthlyReflectionDay: false,
          isStorySummaryDay: false,
          isPictureDescriptionDay: false,
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
        todayContentType: "question",
        todayAudioUrl: null,
        todayStoryTranscript: null,
        todaySummaryGuide: null,
        todayTopic: question.topic || null,
        todayQuestion: question.question || null,
        todayCategory: question.category || null,
        recentCategories: updatedRecent,
      }
    }, { upsert: true });

    await Question.findByIdAndDelete(question._id);
    
    // Generate vocabulary words for today's question before poster dispatch
    await ensureTodayVocabulary().catch(err =>
      console.warn("[QuestionScheduler] Vocabulary generation failed (non-fatal):", err.message)
    );

    dispatchPosterToWhatsApp({
      topic: question.topic,
      question: question.question,
      category: question.category,
    });

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
    const todayIST = `${nowIST.getFullYear()}-${String(nowIST.getMonth() + 1).padStart(2, "0")}-${String(nowIST.getDate()).padStart(2, "0")}`;
    
    return nowTime === sendTime && (!status.questionSentToday || status.lastPosterSentDate !== todayIST || status.lastPosterSentTime !== sendTime);
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
