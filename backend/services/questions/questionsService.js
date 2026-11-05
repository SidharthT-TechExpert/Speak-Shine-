/**
 * Questions Service
 * Business logic for question management
 */

import Question from "../../../models/questionSchema.js";
import Status from "../../../models/statusSchema.js";

/**
 * Get a random question for practice
 */
export async function getRandomQuestion(category) {
  const filter = category ? { category } : {};
  const count = await Question.countDocuments(filter);
  
  if (count === 0) {
    const error = new Error("No questions available");
    error.statusCode = 404;
    throw error;
  }
  
  const skip = Math.floor(Math.random() * count);
  const question = await Question.findOne(filter).skip(skip).lean();
  
  if (question?.videoUrl) {
    const { resolvePlayableVideoUrl } = await import("../dashboard/dashboardService.js");
    question.videoUrl = resolvePlayableVideoUrl(question.videoUrl);
  }

  return question;
}

/**
 * List all questions with pagination (admin/trainer)
 */
export async function listQuestions(category, limit = 50, page = 1) {
  const filter = category ? { category } : {};
  
  const questions = await Question.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit))
    .lean();
  
  const total = await Question.countDocuments(filter);
  const { resolvePlayableVideoUrl } = await import("../dashboard/dashboardService.js");
  for (const q of questions) {
    if (q.videoUrl) q.videoUrl = resolvePlayableVideoUrl(q.videoUrl);
  }
  
  return {
    questions,
    total,
    page: Number(page),
  };
}

/**
 * Add a new question (admin only)
 */
export async function addQuestion(category, topic, question) {
  if (!category || !topic || !question) {
    throw new Error("category, topic and question are required");
  }
  
  const newQuestion = await Question.create({ category, topic, question });
  return newQuestion;
}

/**
 * Delete a question (admin only)
 */
export async function deleteQuestion(questionId) {
  await Question.findByIdAndDelete(questionId);
  return { success: true };
}

/**
 * Edit a question (admin only)
 */
export async function editQuestion(questionId, category, topic, question) {
  const updatedQuestion = await Question.findByIdAndUpdate(
    questionId,
    { category, topic, question },
    { new: true }
  );
  
  if (!updatedQuestion) {
    const error = new Error("Question not found");
    error.statusCode = 404;
    throw error;
  }
  
  return updatedQuestion;
}

/**
 * Setup manual question for specific date/type (admin/trainer)
 */
export async function setupManualQuestion(setupType, scheduledFor, scheduledTime, category, topic, question, createdBy, story = {}, publishNow = false) {
  if (publishNow) {
    scheduledFor = scheduledFor || new Date().toISOString().split('T')[0];
    const now = new Date();
    scheduledTime = scheduledTime || `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  }

  if (!setupType || !scheduledFor || !category || !topic || !question) {
    throw new Error("setupType, scheduledFor, category, topic and question are required");
  }

  const validTypes = ["normal", "regular", "monthly_reflection", "monthly_goals", "story_summary", "picture_description", "shadowing_video"];
  if (!validTypes.includes(setupType)) {
    throw new Error("Invalid setupType. Must be one of: " + validTypes.join(", "));
  }

  if (setupType === "story_summary" && !story.audioUrl) {
    throw new Error("audioUrl is required for story summary questions");
  }

  if (setupType === "picture_description" && !story.imageUrl) {
    throw new Error("imageUrl is required for picture description questions");
  }

  if (setupType === "shadowing_video" && !story.videoUrl) {
    throw new Error("videoUrl is required for shadowing video tasks");
  }

  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  const normalizedTime = scheduledTime && timeRegex.test(scheduledTime) ? scheduledTime : null;
  if (scheduledTime && !normalizedTime) {
    throw new Error("Invalid scheduledTime format. Use HH:MM");
  }

  const scheduleDate = publishNow
    ? new Date()
    : (normalizedTime
      ? new Date(`${scheduledFor}T${normalizedTime}:00+05:30`)
      : new Date(scheduledFor));
  if (isNaN(scheduleDate.getTime())) {
    throw new Error("Invalid scheduledFor date");
  }

  // Check if there's already a manual question for this date and type
  if (!publishNow) {
    const existing = await Question.findOne({
      isManualSetup: true,
      setupType,
      scheduledFor: {
        $gte: new Date(scheduleDate.getFullYear(), scheduleDate.getMonth(), scheduleDate.getDate()),
        $lt: new Date(scheduleDate.getFullYear(), scheduleDate.getMonth(), scheduleDate.getDate() + 1)
      },
      isUsed: false
    });

    if (existing) {
      throw new Error(`A manual ${setupType.replace('_', ' ')} question is already scheduled for this date`);
    }
  }

  const manualQuestion = await Question.create({
    category,
    topic,
    question,
    isManualSetup: true,
    setupType,
    contentType: setupType === "story_summary" ? "story_audio" : setupType === "picture_description" ? "picture_description" : setupType === "shadowing_video" ? "shadowing_video" : "question",
    audioUrl: story.audioUrl || null,
    storyTranscript: story.storyTranscript || null,
    summaryGuide: story.summaryGuide || null,
    imageUrl: story.imageUrl || null,
    imageSource: story.imageSource || null,
    imagePageUrl: story.imagePageUrl || null,
    imagePhotographer: story.imagePhotographer || null,
    imagePhotographerUrl: story.imagePhotographerUrl || null,
    imageSearchQuery: story.imageSearchQuery || null,
    imageInstructions: story.imageInstructions || null,
    imageDifficulty: story.imageDifficulty || null,
    speakingDuration: story.speakingDuration || null,
    videoUrl: story.videoUrl || null,
    videoDuration: story.videoDuration || null,
    videoTranscript: story.videoTranscript || null,
    videoTitle: story.videoTitle || topic || null,
    scheduledFor: scheduleDate,
    scheduledTime: normalizedTime,
    createdBy,
    isUsed: publishNow ? true : false
  });

  if (publishNow) {
    const { publishManualQuestion } = await import("../scheduler/questionSchedulerService.js");
    await publishManualQuestion(manualQuestion);
  }

  return manualQuestion;
}

/**
 * List manual questions (admin/trainer)
 */
export async function listManualQuestions(setupType, upcomingOnly = false) {
  const filter = { isManualSetup: true };
  
  if (setupType) {
    filter.setupType = setupType;
  }
  
  if (upcomingOnly) {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    filter.scheduledFor = { $gte: startOfToday };
  }

  const questions = await Question.find(filter)
    .sort({ scheduledFor: 1 })
    .lean();

  const { resolvePlayableVideoUrl } = await import("../dashboard/dashboardService.js");
  for (const q of questions) {
    if (q.videoUrl) q.videoUrl = resolvePlayableVideoUrl(q.videoUrl);
  }

  return questions;
}

/**
 * Update manual question (admin/trainer)
 */
export async function updateManualQuestion(questionId, data, userPhone) {
  const question = await Question.findById(questionId);

  if (!question) {
    const error = new Error("Question not found");
    error.statusCode = 404;
    throw error;
  }

  if (!question.isManualSetup) {
    const error = new Error("Can only edit manual setup questions");
    error.statusCode = 400;
    throw error;
  }

  const {
    setupType,
    scheduledFor,
    scheduledTime,
    category,
    topic,
    question: questionText,
    audioUrl,
    storyTranscript,
    summaryGuide,
    imageUrl,
    imageSource,
    imagePageUrl,
    imagePhotographer,
    imagePhotographerUrl,
    imageSearchQuery,
    imageInstructions,
    imageDifficulty,
    speakingDuration,
    videoUrl,
    videoDuration,
    videoTranscript,
    videoTitle,
  } = data;

  const validTypes = ["normal", "regular", "monthly_reflection", "monthly_goals", "story_summary", "picture_description", "shadowing_video"];
  const finalSetupType = setupType || question.setupType;
  if (!validTypes.includes(finalSetupType)) {
    const error = new Error("Invalid setupType. Must be one of: " + validTypes.join(", "));
    error.statusCode = 400;
    throw error;
  }

  if (finalSetupType === "story_summary" && !audioUrl && !question.audioUrl) {
    const error = new Error("audioUrl is required for story summary questions");
    error.statusCode = 400;
    throw error;
  }

  if (finalSetupType === "picture_description" && !imageUrl && !question.imageUrl) {
    const error = new Error("imageUrl is required for picture description questions");
    error.statusCode = 400;
    throw error;
  }

  if (finalSetupType === "shadowing_video" && !videoUrl && !question.videoUrl) {
    const error = new Error("videoUrl is required for shadowing video tasks");
    error.statusCode = 400;
    throw error;
  }

  let scheduleDate = question.scheduledFor;
  let normalizedTime = question.scheduledTime;

  if (scheduledTime !== undefined) {
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    normalizedTime = scheduledTime && timeRegex.test(scheduledTime) ? scheduledTime : null;
    if (scheduledTime && !normalizedTime) {
      const error = new Error("Invalid scheduledTime format. Use HH:MM");
      error.statusCode = 400;
      throw error;
    }
  }

  if (scheduledFor) {
    const datePart = typeof scheduledFor === "string" ? scheduledFor.split("T")[0] : new Date(scheduledFor).toISOString().split("T")[0];
    scheduleDate = normalizedTime
      ? new Date(`${datePart}T${normalizedTime}:00+05:30`)
      : new Date(scheduledFor);
    if (isNaN(scheduleDate.getTime())) {
      const error = new Error("Invalid scheduledFor date");
      error.statusCode = 400;
      throw error;
    }
  } else if (normalizedTime && question.scheduledFor) {
    const datePart = question.scheduledFor.toISOString().split("T")[0];
    scheduleDate = new Date(`${datePart}T${normalizedTime}:00+05:30`);
  }

  // Check if another manual question conflicts on this date
  if (scheduledFor || setupType) {
    const startOfDay = new Date(scheduleDate.getFullYear(), scheduleDate.getMonth(), scheduleDate.getDate());
    const endOfDay = new Date(scheduleDate.getFullYear(), scheduleDate.getMonth(), scheduleDate.getDate() + 1);
    const existing = await Question.findOne({
      _id: { $ne: questionId },
      isManualSetup: true,
      setupType: finalSetupType,
      scheduledFor: { $gte: startOfDay, $lt: endOfDay },
      isUsed: false,
    });
    if (existing) {
      const error = new Error(`Another manual ${finalSetupType.replace('_', ' ')} question is already scheduled for this date`);
      error.statusCode = 400;
      throw error;
    }
  }

  // Update question properties
  if (category) question.category = category;
  if (topic) question.topic = topic;
  if (questionText) question.question = questionText;
  question.setupType = finalSetupType;
  question.contentType = finalSetupType === "story_summary" ? "story_audio" : finalSetupType === "picture_description" ? "picture_description" : finalSetupType === "shadowing_video" ? "shadowing_video" : "question";
  question.scheduledFor = scheduleDate;
  question.scheduledTime = normalizedTime;
  if (audioUrl !== undefined) question.audioUrl = audioUrl || null;
  if (storyTranscript !== undefined) question.storyTranscript = storyTranscript || null;
  if (summaryGuide !== undefined) question.summaryGuide = summaryGuide || null;
  if (imageUrl !== undefined) question.imageUrl = imageUrl || null;
  if (imageSource !== undefined) question.imageSource = imageSource || null;
  if (imagePageUrl !== undefined) question.imagePageUrl = imagePageUrl || null;
  if (imagePhotographer !== undefined) question.imagePhotographer = imagePhotographer || null;
  if (imagePhotographerUrl !== undefined) question.imagePhotographerUrl = imagePhotographerUrl || null;
  if (imageSearchQuery !== undefined) question.imageSearchQuery = imageSearchQuery || null;
  if (imageInstructions !== undefined) question.imageInstructions = imageInstructions || null;
  if (imageDifficulty !== undefined) question.imageDifficulty = imageDifficulty || null;
  if (speakingDuration !== undefined) question.speakingDuration = speakingDuration || null;
  if (videoUrl !== undefined) question.videoUrl = videoUrl || null;
  if (videoDuration !== undefined) question.videoDuration = videoDuration || null;
  if (videoTranscript !== undefined) question.videoTranscript = videoTranscript || null;
  if (videoTitle !== undefined) question.videoTitle = videoTitle || null;

  await question.save();

  // If question is currently active on today's status, update Status in real time
  if (question.isUsed) {
    const status = await Status.findOne();
    if (status) {
      const isActiveType = (finalSetupType === "story_summary" && status.todayContentType === "story_audio")
        || (finalSetupType === "picture_description" && status.todayContentType === "picture_description")
        || (finalSetupType === "shadowing_video" && status.todayContentType === "shadowing_video")
        || (finalSetupType === "monthly_reflection" && status.isMonthlyReflectionDay)
        || (finalSetupType === "monthly_goals" && status.isMonthlyGoalsDay);

      if (isActiveType) {
        if (topic) status.todayTopic = topic;
        if (questionText) status.todayQuestion = questionText;
        if (category) status.todayCategory = category;
        if (audioUrl !== undefined) status.todayAudioUrl = audioUrl || null;
        if (storyTranscript !== undefined) status.todayStoryTranscript = storyTranscript || null;
        if (summaryGuide !== undefined) status.todaySummaryGuide = summaryGuide || null;
        if (imageUrl !== undefined) status.todayImageUrl = imageUrl || null;
        if (imageSource !== undefined) status.todayImageSource = imageSource || null;
        if (imagePageUrl !== undefined) status.todayImagePageUrl = imagePageUrl || null;
        if (imagePhotographer !== undefined) status.todayImagePhotographer = imagePhotographer || null;
        if (imagePhotographerUrl !== undefined) status.todayImagePhotographerUrl = imagePhotographerUrl || null;
        if (imageInstructions !== undefined) status.todayImageInstructions = imageInstructions || null;
        if (videoUrl !== undefined) status.todayVideoUrl = videoUrl || null;
        if (videoDuration !== undefined) status.todayVideoDuration = videoDuration || null;
        if (videoTranscript !== undefined) status.todayVideoTranscript = videoTranscript || null;
        if (videoTitle !== undefined) status.todayVideoTitle = videoTitle || null;
        await status.save();
      }
    }
  }

  return question;
}

/**
 * Delete manual question (admin/trainer)
 */
export async function deleteManualQuestion(questionId, userPhone) {
  const question = await Question.findById(questionId);
  
  if (!question) {
    const error = new Error("Question not found");
    error.statusCode = 404;
    throw error;
  }

  if (!question.isManualSetup) {
    const error = new Error("Can only delete manual setup questions");
    error.statusCode = 400;
    throw error;
  }

  if (question.isUsed) {
    const status = await Status.findOne().lean();
    const isActiveType = question.setupType === "story_summary"
      ? status?.todayContentType === "story_audio"
      : question.setupType === "picture_description"
      ? status?.todayContentType === "picture_description"
      : question.setupType === "monthly_reflection"
      ? status?.isMonthlyReflectionDay === true
      : question.setupType === "monthly_goals"
      ? status?.isMonthlyGoalsDay === true
      : false;
    const isActive = isActiveType
      && status?.todayTopic === question.topic
      && status?.todayQuestion === question.question;

    if (isActive) {
      await Status.updateOne({}, {
        $set: {
          questionSentToday: false,
          todayContentType: "question",
          todayTopic: null,
          todayQuestion: null,
          todayCategory: null,
          todayAudioUrl: null,
          todayStoryTranscript: null,
          todaySummaryGuide: null,
          todayImageUrl: null,
          todayImageSource: null,
          todayImagePageUrl: null,
          todayImagePhotographer: null,
          todayImagePhotographerUrl: null,
          todayImageSearchQuery: null,
          todayImageInstructions: null,
          isStorySummaryDay: false,
          isPictureDescriptionDay: false,
          todayVocabulary: [],
        }
      }, { upsert: true });
    }
  }

  await Question.findByIdAndDelete(questionId);
  return { success: true };
}

/**
 * Get question templates for manual setup (admin/trainer)
 */
export async function getQuestionTemplates() {
  const templates = {
    normal: [
      "Share an experience that significantly changed your perspective on life.",
      "If you could master any new skill in 30 days, what would it be and why?",
      "Describe your morning routine and how it sets the tone for your day.",
      "What is a piece of advice that you received that has helped you the most?",
      "Talk about a book, movie, or speaker that inspired you recently."
    ],
    regular: [
      "Share an experience that significantly changed your perspective on life.",
      "If you could master any new skill in 30 days, what would it be and why?",
      "Describe your morning routine and how it sets the tone for your day.",
      "What is a piece of advice that you received that has helped you the most?",
      "Talk about a book, movie, or speaker that inspired you recently."
    ],
    monthly_reflection: [
      "How many reviews did you attend this month?",
      "How many reviews passed and how many failed? Why did you fail?",
      "How many extensions did you take this month?",
      "What is your current growth and progress in the program?",
      "What did you do this month to improve your communication skill?",
      "What is your communication skill level now compared to last month?"
    ],
    monthly_goals: [
      "What is your main goal for this month in the program?",
      "What is your dream or target you are working toward right now?",
      "What specific steps will you take this month to improve your communication?",
      "What was your biggest challenge last month and how will you overcome it this month?",
      "How many reviews are you planning to attend this month?",
      "What will you do differently this month to grow faster?"
    ],
    story_summary: [
      "Listen to the story audio. Then record a short video summary in your own words.",
      "Retell the story in order: beginning, problem, important events, ending, and lesson.",
      "Summarize the story clearly without reading a transcript."
    ],
    picture_description: [
      "Describe what you see in the image. Mention the people, setting, and actions. Share what you think might be happening.",
      "Look at the image carefully. Describe the scene in detail, then explain what you think is happening and how it makes you feel.",
      "Describe the image from foreground to background. What stands out most? What story does this picture tell?"
    ],
    shadowing_video: [
      "Watch the speaker carefully and shadow every word out loud with identical pacing, emotion, and pauses.",
      "Listen and mimic the speaker's vocal projection, intonation, and rhythm in real time without stopping.",
      "Shadow this executive communication speech. Match the speaker's breathing cadence and emphasis on key words."
    ]
  };

  return templates;
}

/**
 * Get manual question for specific date and type (used by scheduler)
 */
export async function getManualQuestionForDate(date, setupType = null) {
  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);

  const filter = {
    isManualSetup: true,
    scheduledFor: {
      $gte: startOfDay,
      $lt: endOfDay
    },
    isUsed: false
  };
  if (setupType) {
    filter.setupType = setupType;
  }

  const manualQuestion = await Question.findOne(filter).sort({ scheduledFor: 1 });
  return manualQuestion;
}

/**
 * Get the oldest due manual question by exact scheduled datetime.
 */
export async function getDueManualQuestion(setupType = null, now = new Date()) {
  const filter = {
    isManualSetup: true,
    scheduledFor: { $lte: now },
    isUsed: false
  };
  if (setupType) {
    filter.setupType = setupType;
  }
  const manualQuestion = await Question.findOne(filter).sort({ scheduledFor: 1 });

  return manualQuestion;
}
