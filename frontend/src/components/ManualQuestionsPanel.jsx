import { useState, useEffect } from "react";
import api from "../api/client.js";

export default function ManualQuestionsPanel() {
  const [manualQuestions, setManualQuestions] = useState([]);
  const [templates, setTemplates] = useState({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [publishMode, setPublishMode] = useState("now"); // "now" | "schedule"
  const [form, setForm] = useState({
    setupType: "normal",
    scheduledFor: "",
    scheduledTime: "",
    category: "General",
    topic: "",
    question: "",
    audioUrl: "",
    storyTranscript: "",
    summaryGuide: "",
    imageUrl: "",
    imageSource: "",
    imagePageUrl: "",
    imagePhotographer: "",
    imagePhotographerUrl: "",
    imageInstructions: "",
    videoUrl: "",
    videoDuration: 60,
    videoTranscript: "",
    videoTitle: "",
    storyDuration: 90
  });
  const [saving, setSaving] = useState(false);
  const [generatingStory, setGeneratingStory] = useState(false);
  const [scrapingStory, setScrapingStory] = useState(false);
  const [storySourceMode, setStorySourceMode] = useState("scraped");
  const [generatingAudio, setGeneratingAudio] = useState(false);
  const [generatingPicture, setGeneratingPicture] = useState(false);
  const [generatingShadowing, setGeneratingShadowing] = useState(false);
  const [voiceRecommendation, setVoiceRecommendation] = useState(null);
  const [selectedVoiceId, setSelectedVoiceId] = useState("21m00Tcm4TlvDq8ikWAM");
  const [analyzingVoice, setAnalyzingVoice] = useState(false);
  const [busy, setBusy] = useState({});
  const [toast, setToast] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState("");

  const handleGenerateShadowing = async () => {
    setGeneratingShadowing(true);
    try {
      const res = await api.post("/questions/generate-shadowing-video", {
        targetDuration: form.videoDuration || 75,
        topic: form.topic?.trim() || undefined,
      }, {
        timeout: 120000 // 2 minutes timeout for audio download, whisper transcribing, and slicing
      });
      const { title, topic, instructions, videoUrl, audioUrl, videoDuration, videoTranscript } = res.data;
      const finalAudio = audioUrl || videoUrl || "";
      setForm(f => ({
        ...f,
        topic: topic || title || f.topic,
        question: instructions || f.question,
        videoUrl: finalAudio,
        audioUrl: finalAudio,
        videoDuration: videoDuration || 60,
        videoTranscript: videoTranscript || "",
        videoTitle: title || topic || "",
        category: "Shadowing Practice",
      }));
      notify("🎙️ Native podcast speech ingested & sliced! All fields populated.");
    } catch (err) {
      console.error("[AdminDashboard] Shadowing generate error:", err);
      const errMsg = err.response?.data?.error || (err.code === "ECONNABORTED" ? "Request timed out while downloading and processing podcast audio. Please try again." : err.message) || "Shadowing generation failed";
      notify(errMsg, "error");
    } finally {
      setGeneratingShadowing(false);
    }
  };

  const CURATED_SHADOWING_LESSONS = [
    {
      title: "Mastering Confident English Introductions",
      topic: "Public Speaking & First Impressions",
      videoDuration: 72,
      audioUrl: "/shadowing/stage-presence.mp3",
      videoUrl: "/shadowing/stage-presence.mp3",
      videoTranscript: "Confidence is not something you are born with; it is an active habit you build every single day. When you introduce yourself in English, stand tall, make warm eye contact, and speak with a steady, relaxed breath. You don't need complex vocabulary or rapid speech to make a powerful first impression. Clear pronunciation, a friendly smile, and genuine enthusiasm will speak louder than flawless grammar. Focus on connecting with your listener, one clear phrase at a time.",
      instructions: "Listen to the speaker and shadow along at the exact same rhythm and speed. Focus on breath control, pauses, and confident intonation."
    },
    {
      title: "The Art of Active Listening & Executive Presence",
      topic: "Effective Communication & Presence",
      videoDuration: 78,
      audioUrl: "/shadowing/active-listening.mp3",
      videoUrl: "/shadowing/active-listening.mp3",
      videoTranscript: "Great conversationalists are rarely the loudest voices in the room. They are the ones who listen attentively and respond with purpose. In English conversations, active listening means nodding, summarizing key points, and asking thoughtful follow-up questions. When you shadow this exercise, observe how natural pauses allow you to process thoughts before speaking. Speaking well begins with listening deeply and pacing your delivery with calm authority.",
      instructions: "Shadow each phrase out loud without stopping. Match the speaker's natural pauses and emphasize key thought groups."
    },
    {
      title: "Overcoming Hesitation & Fear of Making Mistakes",
      topic: "Fluency & Mindset",
      videoDuration: 84,
      audioUrl: "/shadowing/fluency-mindset.mp3",
      videoUrl: "/shadowing/fluency-mindset.mp3",
      videoTranscript: "Every language learner experiences that brief moment of hesitation right before speaking. Your mind searches for the perfect word, and fear whispers that you might make a mistake. The secret is simple: give yourself permission to speak imperfectly. Fluency begins when you value expressing your ideas over seeking mechanical perfection. Keep your vocal flow continuous, embrace small errors as stepping stones, and trust your practice.",
      instructions: "Speak along with the audio with zero hesitation. Keep your vocal flow continuous and smooth throughout."
    },
    {
      title: "How Great Speakers Use Intentional Pauses",
      topic: "Vocal Pacing & Public Speaking",
      videoDuration: 68,
      audioUrl: "/shadowing/intentional-pauses.mp3",
      videoUrl: "/shadowing/intentional-pauses.mp3",
      videoTranscript: "Novice speakers rush because they fear silence, but master speakers know that silence is where true authority lives. When you deliver an important idea, pause for two beats. Give your audience space to absorb your meaning. Breathing between sentences lowers your heart rate and steadies your pitch. Practice this rhythm: speak a complete thought, pause calmly, and begin the next phrase with clear intention.",
      instructions: "Shadow each thought group. Notice how each sentence finishes with a relaxed, measured pause."
    },
    {
      title: "The Compounding Power of Daily Speaking Habits",
      topic: "Personal Growth & Consistency",
      videoDuration: 75,
      audioUrl: "/shadowing/speaking-habits.mp3",
      videoUrl: "/shadowing/speaking-habits.mp3",
      videoTranscript: "Small consistent daily habits always beat sporadic bursts of extreme effort. Spending five focused minutes shadowing English speech every day rewires your speech muscles and builds effortless muscle memory. You do not need hours of study each night; all you need is relentless consistency. Celebrate every small win, remain curious, and trust the compounding power of daily progress.",
      instructions: "Shadow each phrase as you hear it. Mimic the speaker's vocal energy, rhythm, and cadence."
    },
    {
      title: "Turning Nervous Energy into Charismatic Presence",
      topic: "Stage Presence & Communication",
      videoDuration: 80,
      audioUrl: "/shadowing/charismatic-presence.mp3",
      videoUrl: "/shadowing/charismatic-presence.mp3",
      videoTranscript: "Stage fright and excitement produce the exact same physiological reaction: rapid heartbeat and heightened adrenaline. The only difference is your mental label. Instead of telling yourself you are nervous, tell yourself you are energized to share a message. Ground your feet into the floor, release tension in your shoulders, and channel that surge of energy into vocal warmth and conviction.",
      instructions: "Mimic the speaker's grounded energy and vocal projection. Project each syllable with clarity."
    }
  ];

  const notify = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const getTodayDate = () => new Date().toISOString().split('T')[0];

  const getCurrentTime = () => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  };

  const getNextMonthFirst = () => {
    const today = new Date();
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    return nextMonth.toISOString().split('T')[0];
  };

  const getNextMonthLast = () => {
    const today = new Date();
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 2, 0);
    return nextMonth.toISOString().split('T')[0];
  };

  const getDefaultDate = (setupType, mode = publishMode) => {
    if (mode === "now") return getTodayDate();
    switch (setupType) {
      case "normal":
      case "regular":
      case "story_summary":
      case "picture_description":
        return getTodayDate();
      case "monthly_goals":
        return getNextMonthFirst();
      case "monthly_reflection":
        return getNextMonthLast();
      default:
        return getTodayDate();
    }
  };

  const handleScrapeStory = async () => {
    setScrapingStory(true);
    try {
      const targetDuration = form.storyDuration || 90;
      const res = await api.post("/questions/generate-scraped-story", { targetDuration }, {
        timeout: 120000 // 2 minutes timeout for audio download, whisper transcribing, slicing, and LLM summary extraction
      });
      const { topic, title, storyTranscript, audioUrl, summaryGuide, question, duration } = res.data;
      setForm(f => ({
        ...f,
        topic: topic || title || f.topic,
        question: question || f.question,
        storyTranscript: storyTranscript || f.storyTranscript,
        audioUrl: audioUrl || f.audioUrl,
        storyDuration: duration || targetDuration,
        summaryGuide: Array.isArray(summaryGuide) ? summaryGuide.join("\n") : summaryGuide || f.summaryGuide,
      }));
      const durationLabel = duration ? ` (${duration}s - Target ${targetDuration}s)` : "";
      notify(`📻 English story sliced cleanly${durationLabel}! Intro trimmed.`);
      if (storyTranscript) {
        handleAnalyzeVoice(storyTranscript);
      }
    } catch (err) {
      console.error("[ManualQuestionsPanel] Scrape story error:", err);
      const errMsg = err.response?.data?.error || (err.code === "ECONNABORTED" ? "Request timed out while downloading and processing story audio. Please try again." : err.message) || "Story scraping failed";
      notify(errMsg, "error");
    } finally {
      setScrapingStory(false);
    }
  };

  const handleGenerateStory = async () => {
    setGeneratingStory(true);
    try {
      const targetDuration = form.storyDuration || 90;
      const res = await api.post("/questions/generate-story", { targetDuration, level: "B2" });
      const { topic, story, summaryGuide, question, voiceRecommendation: vRec } = res.data;
      setForm(f => ({
        ...f,
        topic,
        question,
        storyTranscript: story,
        summaryGuide: Array.isArray(summaryGuide) ? summaryGuide.join("\n") : summaryGuide || "",
      }));
      if (vRec) {
        setVoiceRecommendation(vRec);
        if (vRec.voiceId) setSelectedVoiceId(vRec.voiceId);
      }
      notify("Story generated! Character and matching voice identified.");
    } catch (err) {
      notify(err.response?.data?.error || "Story generation failed", "error");
    } finally {
      setGeneratingStory(false);
    }
  };

  const handleAnalyzeVoice = async () => {
    if (!form.storyTranscript) {
      notify("Please enter or generate a story transcript first.", "error");
      return;
    }
    setAnalyzingVoice(true);
    try {
      const res = await api.post("/questions/analyze-story-voice", {
        storyText: textToAnalyze,
      });
      if (res.data.voiceRecommendation) {
        setVoiceRecommendation(res.data.voiceRecommendation);
        if (res.data.voiceRecommendation.voiceId) {
          setSelectedVoiceId(res.data.voiceRecommendation.voiceId);
        }
        notify(`Matched voice: ${res.data.voiceRecommendation.voiceName} for "${res.data.voiceRecommendation.characterName}"!`);
      }
    } catch (err) {
      notify(err.response?.data?.error || "Voice analysis failed", "error");
    } finally {
      setAnalyzingVoice(false);
    }
  };

    const handleCleanTranscript = async () => {
    if (!form.storyTranscript) return;
    try {
      const res = await api.post("/questions/clean-story-transcript", {
        text: form.storyTranscript,
        title: form.topic
      });
      if (res.data?.cleanedTranscript) {
        setForm(f => ({ ...f, storyTranscript: res.data.cleanedTranscript }));
        notify("✂️ Narrator preambles, disclaimers, and outros trimmed!");
      }
    } catch (err) {
      notify("Failed to clean transcript", "error");
    }
  };

  const handleGenerateAudio = async () => {
    if (!form.storyTranscript) {
      notify("Generate a story first — the transcript is needed for audio.", "error");
      return;
    }
    setGeneratingAudio(true);
    try {
      const res = await api.post("/questions/generate-story-audio", {
        storyText: form.storyTranscript,
        topic: form.topic || "story",
        voiceId: selectedVoiceId || voiceRecommendation?.voiceId || undefined,
        voiceSettings: (selectedVoiceId === voiceRecommendation?.voiceId) ? voiceRecommendation?.voiceSettings : undefined,
      });
      setForm(f => ({ ...f, audioUrl: res.data.audioUrl, storyDuration: res.data.duration || f.storyDuration }));
      const voiceLabel = res.data.voiceUsed?.name ? ` with voice ${res.data.voiceUsed.name}` : "";
      notify(`Audio generated and uploaded${voiceLabel}! URL filled in.`);
    } catch (err) {
      notify(err.response?.data?.error || "Audio generation failed", "error");
    } finally {
      setGeneratingAudio(false);
    }
  };

  const handleGeneratePicture = async () => {
    setGeneratingPicture(true);
    try {
      const res = await api.post("/questions/generate-picture");
      const { title, instructions, imageUrl, imageSource, imagePageUrl, imagePhotographer, imagePhotographerUrl, imageSearchQuery } = res.data;
      setForm(f => ({
        ...f,
        topic: title || f.topic,
        question: instructions || f.question,
        imageUrl: imageUrl || "",
        imageSource: imageSource || "",
        imagePageUrl: imagePageUrl || "",
        imagePhotographer: imagePhotographer || "",
        imagePhotographerUrl: imagePhotographerUrl || "",
        imageInstructions: instructions || "",
        category: "Picture Description",
      }));
      notify("Picture challenge generated! All fields have been filled in.");
    } catch (err) {
      notify(err.response?.data?.error || "Picture generation failed", "error");
    } finally {
      setGeneratingPicture(false);
    }
  };

  const load = async () => {
    try {
      const [questionsRes, templatesRes] = await Promise.all([
        api.get("/questions/manual?upcoming=true"),
        api.get("/questions/templates")
      ]);
      setManualQuestions(questionsRes.data);
      setTemplates(templatesRes.data);
    } catch (err) {
      notify(err.response?.data?.error || "Failed to load data", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setEditingId(null);
    setPublishMode("now");
    setForm({
      setupType: "normal",
      scheduledFor: getTodayDate(),
      scheduledTime: getCurrentTime(),
      category: "General",
      topic: "",
      question: "",
      audioUrl: "",
      storyTranscript: "",
      summaryGuide: "",
      imageUrl: "",
      imageSource: "",
      imagePageUrl: "",
      imagePhotographer: "",
      imagePhotographerUrl: "",
      imageInstructions: "",
      videoUrl: "",
      videoDuration: 60,
      videoTranscript: "",
      videoTitle: ""
    });
    setSelectedTemplate("");
    setShowForm(false);
  };

  const handleEdit = (q) => {
    setEditingId(q._id);
    const isPastOrToday = q.scheduledFor && new Date(q.scheduledFor) <= new Date();
    setPublishMode(isPastOrToday ? "now" : "schedule");
    const dateStr = q.scheduledFor ? new Date(q.scheduledFor).toISOString().split("T")[0] : "";
    setForm({
      setupType: q.setupType || "normal",
      scheduledFor: dateStr,
      scheduledTime: q.scheduledTime || (q.scheduledFor ? new Date(q.scheduledFor).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : ""),
      category: q.category || "General",
      topic: q.topic || "",
      question: q.question || "",
      audioUrl: q.audioUrl || "",
      storyTranscript: q.storyTranscript || "",
      summaryGuide: q.summaryGuide || "",
      imageUrl: q.imageUrl || "",
      imageSource: q.imageSource || "",
      imagePageUrl: q.imagePageUrl || "",
      imagePhotographer: q.imagePhotographer || "",
      imagePhotographerUrl: q.imagePhotographerUrl || "",
      imageInstructions: q.imageInstructions || "",
      videoUrl: q.videoUrl || "",
      videoDuration: q.videoDuration || 60,
      videoTranscript: q.videoTranscript || "",
      videoTitle: q.videoTitle || ""
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const setupQuestion = async (e) => {
    e.preventDefault();
    if (form.setupType === "shadowing_video") {
      if (!form.videoUrl) {
        notify("Please enter a Video URL or use AI Generate Shadowing Video", "error");
        return;
      }
      if (Number(form.videoDuration) > 180) {
        notify("Video length must be 3 minutes (180 seconds) or less for Shadowing Activity", "error");
        return;
      }
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        publishNow: publishMode === "now",
        scheduledFor: publishMode === "now" ? getTodayDate() : form.scheduledFor,
        scheduledTime: publishMode === "now" ? getCurrentTime() : form.scheduledTime,
      };

      if (editingId) {
        await api.patch(`/questions/manual/${editingId}`, payload);
        notify(publishMode === "now" ? "⚡ Question updated & made active today!" : "Manual question updated!");
      } else {
        await api.post("/questions/manual", payload);
        notify(publishMode === "now" ? "⚡ Question published live to user dashboard!" : "Manual question scheduled successfully!");
      }
      resetForm();
      load();
    } catch (err) {
      notify(err.response?.data?.error || `Failed to ${editingId ? "update" : "setup"} question`, "error");
    } finally {
      setSaving(false);
    }
  };

  const handlePublishNow = async (id) => {
    setBusy(b => ({ ...b, [id]: true }));
    try {
      await api.post(`/questions/manual/${id}/publish-now`);
      notify("⚡ Question activated live on user dashboard!");
      load();
    } catch (err) {
      notify(err.response?.data?.error || "Failed to publish question now", "error");
    } finally {
      setBusy(b => ({ ...b, [id]: false }));
    }
  };

  const deleteQuestion = async (id) => {
    setBusy(b => ({ ...b, [id]: true }));
    try {
      await api.delete(`/questions/manual/${id}`);
      notify("Question deleted successfully!");
      if (editingId === id) resetForm();
      load();
    } catch (err) {
      notify(err.response?.data?.error || "Failed to delete question", "error");
    } finally {
      setBusy(b => ({ ...b, [id]: false }));
    }
  };

  const useTemplate = (templateQuestion) => {
    setForm(f => ({
      ...f,
      question: templateQuestion,
      category: f.setupType === "normal" || f.setupType === "regular" ? (f.category || "General") : f.setupType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
      topic: f.setupType === "normal" || f.setupType === "regular" ? f.topic : f.setupType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
    }));
  };

  const setupTypeLabels = {
    normal: "Normal Question (Daily Practice Prompt)",
    story_summary: "Story Summary (Listening Practice)",
    picture_description: "Picture Description Challenge",
    shadowing_video: "Shadowing Activity (Native Audio Shadowing)",
    monthly_reflection: "Monthly Reflection (Last day of month)",
    monthly_goals: "Monthly Goals (1st of month)"
  };

  const groupedQuestions = {
    normal: manualQuestions.filter(q => q.setupType === "normal" || q.setupType === "regular"),
    story_summary: manualQuestions.filter(q => q.setupType === "story_summary"),
    picture_description: manualQuestions.filter(q => q.setupType === "picture_description"),
    shadowing_video: manualQuestions.filter(q => q.setupType === "shadowing_video"),
    monthly_reflection: manualQuestions.filter(q => q.setupType === "monthly_reflection"),
    monthly_goals: manualQuestions.filter(q => q.setupType === "monthly_goals"),
  };

  return (
    <div style={{ maxWidth: 800 }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: "5rem", right: "1rem", zIndex: 9999,
          background: toast.type === "error" ? "#7f1d1d" : "#065f46",
          border: `1px solid ${toast.type === "error" ? "rgba(248,113,113,0.4)" : "rgba(74,222,128,0.4)"}`,
          color: "#fff", padding: "0.75rem 1.25rem", borderRadius: 12,
          fontSize: "0.9rem", fontWeight: 600,
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          animation: "slideUpIn 0.3s ease",
        }}>
          {toast.type === "error" ? "❌" : "✅"} {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 800 }}>📝 Manual Questions</h2>
          <p style={{ margin: "0.25rem 0 0", color: "var(--muted)", fontSize: "0.85rem" }}>
            Setup and publish custom questions, reflections, stories, or picture description challenges
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            onClick={() => {
              if (showForm && publishMode === "now" && !editingId) {
                resetForm();
              } else {
                resetForm();
                setPublishMode("now");
                setShowForm(true);
              }
            }}
            style={{
              background: showForm && publishMode === "now" ? "linear-gradient(135deg,#10b981,#059669)" : "linear-gradient(135deg,#059669,#047857)",
              border: "none",
              color: "#fff",
              borderRadius: 12, padding: "0.65rem 1.15rem",
              fontWeight: 700, fontSize: "0.88rem", cursor: "pointer",
              boxShadow: "0 4px 12px rgba(16,185,129,0.25)",
              display: "inline-flex", alignItems: "center", gap: "0.4rem"
            }}
          >
            ⚡ Setup Now (Today)
          </button>
          <button
            onClick={() => {
              if (showForm && publishMode === "schedule" && !editingId) {
                resetForm();
              } else {
                resetForm();
                setPublishMode("schedule");
                setShowForm(true);
              }
            }}
            style={{
              background: showForm && publishMode === "schedule" ? "linear-gradient(135deg,#7c6fff,#4f46e5)" : "rgba(124,111,255,0.15)",
              border: "1px solid rgba(124,111,255,0.3)",
              color: showForm && publishMode === "schedule" ? "#fff" : "#a78bfa",
              borderRadius: 12, padding: "0.65rem 1.15rem",
              fontWeight: 700, fontSize: "0.88rem", cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: "0.4rem"
            }}
          >
            📅 Schedule Later
          </button>
        </div>
      </div>

      {/* Setup form */}
      {showForm && (
        <div style={{
          background: publishMode === "now" 
            ? "linear-gradient(135deg, rgba(16,185,129,0.08), rgba(5,150,105,0.04))"
            : "linear-gradient(135deg, rgba(124,111,255,0.08), rgba(79,70,229,0.05))",
          border: publishMode === "now" ? "1px solid rgba(16,185,129,0.35)" : "1px solid rgba(124,111,255,0.25)",
          borderRadius: 16, padding: "1.5rem", marginBottom: "1.5rem",
        }}>
          {/* Mode Switcher Tabs inside Form */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.2rem", flexWrap: "wrap", gap: "0.75rem" }}>
            <div style={{ fontWeight: 800, fontSize: "1.05rem", color: publishMode === "now" ? "#34d399" : "#a78bfa" }}>
              {editingId ? "✏️ Edit Manual Question" : (publishMode === "now" ? "⚡ Setup & Publish Now (Today)" : "📅 Schedule Question for Later")}
            </div>
            <div style={{ display: "flex", background: "rgba(0,0,0,0.25)", borderRadius: 10, padding: 3, border: "1px solid rgba(255,255,255,0.08)" }}>
              <button
                type="button"
                onClick={() => setPublishMode("now")}
                style={{
                  background: publishMode === "now" ? "rgba(16,185,129,0.3)" : "transparent",
                  color: publishMode === "now" ? "#34d399" : "var(--muted)",
                  border: "none", borderRadius: 8, padding: "0.35rem 0.75rem",
                  fontSize: "0.78rem", fontWeight: 700, cursor: "pointer",
                }}
              >
                ⚡ Set for Today (Now)
              </button>
              <button
                type="button"
                onClick={() => setPublishMode("schedule")}
                style={{
                  background: publishMode === "schedule" ? "rgba(124,111,255,0.3)" : "transparent",
                  color: publishMode === "schedule" ? "#a78bfa" : "var(--muted)",
                  border: "none", borderRadius: 8, padding: "0.35rem 0.75rem",
                  fontSize: "0.78rem", fontWeight: 700, cursor: "pointer",
                }}
              >
                📅 Schedule Later
              </button>
            </div>
          </div>

          {publishMode === "now" && (
            <div style={{
              background: "rgba(16,185,129,0.12)",
              border: "1px solid rgba(16,185,129,0.25)",
              borderRadius: 10, padding: "0.6rem 0.85rem",
              fontSize: "0.82rem", color: "#34d399", marginBottom: "1rem",
              display: "flex", alignItems: "center", gap: "0.5rem"
            }}>
              <span>⚡</span>
              <span>This question will become <strong>immediately active</strong> on the user dashboard as today's challenge.</span>
            </div>
          )}

          <form onSubmit={setupQuestion}>
            <div className={publishMode === "now" ? "" : "grid-cols-2"} style={{ marginBottom: "0.75rem" }}>
              <div style={{ marginBottom: publishMode === "now" ? "0.75rem" : 0 }}>
                <label className="form-label">Question Type *</label>
                <select 
                  className="form-input" 
                  required
                  value={form.setupType} 
                  onChange={e => {
                    const newType = e.target.value;
                    setForm(f => ({ 
                      ...f, 
                      setupType: newType,
                      scheduledFor: getDefaultDate(newType),
                      scheduledTime: (newType === "story_summary" || newType === "picture_description" || newType === "shadowing_video") ? getCurrentTime() : f.scheduledTime,
                      category: newType === "normal" ? (f.category && f.category !== "Monthly Reflection" && f.category !== "Monthly Goals" ? f.category : "General") : newType === "shadowing_video" ? "Shadowing Practice" : newType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
                      topic: newType === "normal" ? f.topic : newType === "shadowing_video" ? (f.topic || "Daily Shadowing Challenge") : newType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
                      question: newType === "story_summary" ? "Listen to the story audio and record a short video summary in your own words." : newType === "picture_description" ? "Describe what you see in the image. Mention the people, setting, and actions. Share what you think might be happening." : newType === "shadowing_video" ? "Watch the video and practice shadowing by repeating every sentence simultaneously with the speaker." : f.question
                    }));
                    setSelectedTemplate("");
                  }}
                >
                  {Object.entries(setupTypeLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              {publishMode === "schedule" && (
                <>
                  <div>
                    <label className="form-label">Scheduled Date *</label>
                    <input 
                      className="form-input" 
                      type="date" 
                      required
                      value={form.scheduledFor} 
                      onChange={e => setForm(f => ({ ...f, scheduledFor: e.target.value }))} 
                    />
                  </div>
                  <div style={{ marginTop: "0.75rem" }}>
                    <label className="form-label">Scheduled Time {form.setupType === "story_summary" || form.setupType === "picture_description" || form.setupType === "shadowing_video" ? "*" : "(optional)"}</label>
                    <input
                      className="form-input"
                      type="time"
                      required={form.setupType === "story_summary" || form.setupType === "picture_description" || form.setupType === "shadowing_video"}
                      value={form.scheduledTime}
                      onChange={e => setForm(f => ({ ...f, scheduledTime: e.target.value }))}
                    />
                  </div>
                </>
              )}
            </div>

            {/* Template selector */}
            {templates[form.setupType] && (
              <div style={{ marginBottom: "0.75rem" }}>
                <label className="form-label">Use Template (optional)</label>
                <select 
                  className="form-input" 
                  value={selectedTemplate}
                  onChange={e => {
                    setSelectedTemplate(e.target.value);
                    if (e.target.value) {
                      useTemplate(e.target.value);
                    }
                  }}
                >
                  <option value="">Select a template...</option>
                  {templates[form.setupType].map((template, i) => (
                    <option key={i} value={template}>{template.slice(0, 60)}...</option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid-cols-2" style={{ marginBottom: "0.75rem" }}>
              <div>
                <label className="form-label">Category *</label>
                <input 
                  className="form-input" 
                  placeholder="e.g. Daily Life, Opinion, Reflection" 
                  required
                  value={form.category} 
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))} 
                />
              </div>
              <div>
                <label className="form-label">Topic *</label>
                <input 
                  className="form-input" 
                  placeholder="e.g. My Favorite Childhood Memory" 
                  required
                  value={form.topic} 
                  onChange={e => setForm(f => ({ ...f, topic: e.target.value }))} 
                />
              </div>
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <label className="form-label">Question *</label>
              <textarea 
                className="form-input" 
                rows={3}
                placeholder="Enter your custom question..."
                required
                value={form.question} 
                onChange={e => setForm(f => ({ ...f, question: e.target.value }))} 
              />
            </div>
            {form.setupType === "story_summary" && (
              <>
                {/* Story Mode Selector Tabs */}
                <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.85rem", background: "rgba(15,23,42,0.6)", padding: "4px", borderRadius: 10, border: "1px solid var(--border)" }}>
                  <button
                    type="button"
                    onClick={() => setStorySourceMode("scraped")}
                    style={{
                      flex: 1,
                      padding: "0.6rem 0.75rem",
                      borderRadius: 8,
                      fontSize: "0.82rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      border: "none",
                      background: storySourceMode === "scraped" ? "linear-gradient(135deg, #0284c7, #4f46e5)" : "transparent",
                      color: storySourceMode === "scraped" ? "#fff" : "var(--muted)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.4rem",
                      boxShadow: storySourceMode === "scraped" ? "0 2px 8px rgba(2, 132, 199, 0.4)" : "none"
                    }}
                  >
                    📻 Scraped Authentic Story (Native Audio)
                  </button>
                  <button
                    type="button"
                    onClick={() => setStorySourceMode("ai_custom")}
                    style={{
                      flex: 1,
                      padding: "0.6rem 0.75rem",
                      borderRadius: 8,
                      fontSize: "0.82rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      border: "none",
                      background: storySourceMode === "ai_custom" ? "linear-gradient(135deg, #0f766e, #0d9488)" : "transparent",
                      color: storySourceMode === "ai_custom" ? "#fff" : "var(--muted)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.4rem",
                      boxShadow: storySourceMode === "ai_custom" ? "0 2px 8px rgba(15, 118, 110, 0.4)" : "none"
                    }}
                  >
                    ✨ AI Story Generator + ElevenLabs Voice
                  </button>
                </div>

                {storySourceMode === "scraped" ? (
                  <>
                    {/* Target Story Duration Control */}
                    <div style={{ marginBottom: "0.85rem", padding: "0.85rem 1rem", borderRadius: 10, background: "rgba(2,132,199,0.06)", border: "1px solid rgba(2,132,199,0.25)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                        <label className="form-label" style={{ marginBottom: 0, fontWeight: 700, fontSize: "0.82rem", color: "#38bdf8" }}>
                          🎯 Target Story Duration (Seconds)
                        </label>
                        <span style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
                          Admin setting: ≈92s (60s – 120s recommended)
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        <input
                          type="number"
                          className="form-input"
                          min={50}
                          max={180}
                          step={5}
                          value={form.storyDuration || 90}
                          onChange={e => setForm(f => ({ ...f, storyDuration: Math.max(45, Math.min(180, parseInt(e.target.value, 10) || 90)) }))}
                          style={{ width: 100, textAlign: "center", fontWeight: 700 }}
                        />
                        <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                          {[60, 75, 90, 105, 120].map(s => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => setForm(f => ({ ...f, storyDuration: s }))}
                              style={{
                                padding: "4px 10px",
                                fontSize: "0.72rem",
                                borderRadius: 6,
                                border: (form.storyDuration || 90) === s ? "1px solid #38bdf8" : "1px solid var(--border)",
                                background: (form.storyDuration || 90) === s ? "rgba(56,189,248,0.2)" : "rgba(255,255,255,0.05)",
                                color: (form.storyDuration || 90) === s ? "#38bdf8" : "var(--muted)",
                                cursor: "pointer",
                                fontWeight: (form.storyDuration || 90) === s ? 700 : 500
                              }}
                            >
                              {s}s
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* 1-Click Automated RSS Story Scraping & Slicing */}
                    <div style={{
                      marginBottom: "0.85rem",
                      padding: "0.85rem 1rem",
                      borderRadius: 12,
                      background: "linear-gradient(135deg, rgba(2, 132, 199, 0.12), rgba(99, 102, 241, 0.08))",
                      border: "1px solid rgba(2, 132, 199, 0.35)"
                    }}>
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={scrapingStory}
                        onClick={handleScrapeStory}
                        style={{
                          width: "100%",
                          marginBottom: "0.45rem",
                          background: "linear-gradient(135deg, #0284c7, #4f46e5)",
                          border: "none",
                          padding: "0.85rem 1rem",
                          fontWeight: 800,
                          fontSize: "0.94rem",
                          borderRadius: 10,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "0.5rem",
                          boxShadow: "0 4px 15px rgba(2, 132, 199, 0.35)",
                          cursor: "pointer"
                        }}
                      >
                        {scrapingStory
                          ? "📻 Auto-Scraping Story & Slicing..."
                          : `📻 1-Click Auto-Scrape English Story (Target: ${form.storyDuration || 90}s)`}
                      </button>
                      <div style={{ fontSize: "0.72rem", color: "var(--muted)", textAlign: "center" }}>
                        ✂️ Slices strictly from story opening word to final moral. Intro preamble, LibriVox ads &amp; outro stripped.
                      </div>
                    </div>
                  </>
                ) : (
                  <div style={{ marginBottom: "0.75rem" }}>
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={generatingStory}
                      onClick={handleGenerateStory}
                      style={{ width: "100%", marginBottom: "0.5rem", background: "linear-gradient(135deg,#0f766e,#0d9488)" }}
                    >
                      {generatingStory ? "✨ Generating story…" : "✨ AI Generate Story (Custom Text)"}
                    </button>
                    <div style={{ fontSize: "0.72rem", color: "var(--muted)", textAlign: "center" }}>
                      Generates a natural listening story with human pacing, key summary points, and matches the best character voice.
                    </div>
                  </div>
                )}

                {/* Story Transcript with 1-Click Auto-Trim */}
                <div style={{ marginBottom: "0.75rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
                    <label className="form-label" style={{ marginBottom: 0 }}>
                      Story Transcript * <span style={{ color: "var(--muted)", fontWeight: 400 }}>(clean narrative · preamble trimmed)</span>
                    </label>
                    {form.storyTranscript && (
                      <button
                        type="button"
                        onClick={handleCleanTranscript}
                        style={{
                          background: "rgba(56, 189, 248, 0.12)",
                          border: "1px solid rgba(56, 189, 248, 0.35)",
                          color: "#38bdf8",
                          borderRadius: 6,
                          padding: "2px 8px",
                          fontSize: "0.72rem",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          fontWeight: 600
                        }}
                        title="Clean introductory credits, disclaimers, and outro"
                      >
                        ✂️ Auto-Trim Intro &amp; Outro
                      </button>
                    )}
                  </div>
                  <textarea
                    className="form-input"
                    rows={5}
                    placeholder="Story text to read aloud..."
                    value={form.storyTranscript}
                    onChange={e => setForm(f => ({ ...f, storyTranscript: e.target.value }))}
                  />
                </div>

                {/* Character & Adaptive Voice Matcher Card (Available in Both Modes!) */}
                <div style={{
                  marginBottom: "0.85rem",
                  padding: "0.85rem 1rem",
                  background: "rgba(167, 139, 250, 0.08)",
                  borderRadius: 10,
                  border: "1px solid rgba(167, 139, 250, 0.28)"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      <span style={{ fontSize: "1rem" }}>🎭</span>
                      <span style={{ fontWeight: 700, fontSize: "0.82rem", color: "#c4b5fd" }}>
                        Character Voice Matcher (ElevenLabs Human Cast)
                      </span>
                    </div>
                    {form.storyTranscript && (
                      <button
                        type="button"
                        disabled={analyzingVoice}
                        onClick={() => handleAnalyzeVoice()}
                        style={{
                          background: "rgba(167, 139, 250, 0.15)",
                          border: "1px solid rgba(196, 181, 253, 0.35)",
                          color: "#ddd6fe",
                          borderRadius: 6,
                          padding: "3px 8px",
                          fontSize: "0.72rem",
                          cursor: "pointer"
                        }}
                      >
                        {analyzingVoice ? "Analyzing…" : "🔄 Re-Analyze Voice"}
                      </button>
                    )}
                  </div>

                  {voiceRecommendation && (
                    <div style={{ fontSize: "0.78rem", color: "#e2e8f0", marginBottom: "0.65rem", lineHeight: 1.45, background: "rgba(15, 23, 42, 0.4)", padding: "8px", borderRadius: 6 }}>
                      <div><strong style={{ color: "#a78bfa" }}>Character:</strong> {voiceRecommendation.characterName} <span style={{ color: "#94a3b8" }}>({voiceRecommendation.persona})</span></div>
                      <div><strong style={{ color: "#38bdf8" }}>Mood &amp; Delivery:</strong> {voiceRecommendation.mood}</div>
                      <div style={{ color: "#cbd5e1", marginTop: "3px", fontSize: "0.73rem" }}>
                        💡 <em>"{voiceRecommendation.reason}"</em>
                      </div>
                    </div>
                  )}

                  <label className="form-label" style={{ fontSize: "0.74rem", color: "#cbd5e1", marginBottom: "0.3rem" }}>
                    Select Voice (ElevenLabs Human Cast)
                  </label>
                  <select
                    className="form-input"
                    value={selectedVoiceId}
                    onChange={e => setSelectedVoiceId(e.target.value)}
                    style={{ fontSize: "0.82rem", background: "#0f172a", borderColor: "rgba(167, 139, 250, 0.4)", color: "#f8fafc" }}
                  >
                    <option value="21m00Tcm4TlvDq8ikWAM">Rachel — Warm &amp; Conversational (Female, Most Natural)</option>
                    <option value="AZnzlk1XvdvUeBnXmlld">Domi — Energetic &amp; Expressive (Female, Lively)</option>
                    <option value="EXAVITQu4vr4xnSDxMaL">Bella — Gentle Storyteller (Female, Soft &amp; Calming)</option>
                    <option value="MF3mGyEYCl7XYWbV9V6O">Elli — Bright &amp; Youthful (Female, Student)</option>
                    <option value="TxGEqnHWrfWFTfGW9XjX">Josh — Casual &amp; Relatable (Male, Most Natural)</option>
                    <option value="yoZ06aMxZJJ28mfd3POQ">Sam — Dynamic &amp; Expressive (Male, Confident)</option>
                    <option value="ErXwobaYiN019PkySvjV">Antoni — Warm Storyteller (Male, Balanced)</option>
                    <option value="pNInz6obpgDQGcFmaJgB">Adam — Deep Classic Narrator (Male)</option>
                  </select>

                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={generatingAudio || !form.storyTranscript}
                    onClick={handleGenerateAudio}
                    style={{
                      marginTop: "0.6rem",
                      width: "100%",
                      color: "#22d3ee",
                      borderColor: "rgba(6,182,212,0.45)",
                      fontWeight: 700,
                      background: "rgba(6, 182, 212, 0.1)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.5rem"
                    }}
                  >
                    {generatingAudio ? "🎙️ Generating Audio with Selected Voice…" : "🎙️ Generate Audio with Character Voice (Studio Human Voice)"}
                  </button>
                  <div style={{ fontSize: "0.71rem", color: "var(--muted)", textAlign: "center", marginTop: "0.35rem" }}>
                    💡 Generates studio-quality human narration from the story transcript — zero robotic tone, zero vintage static.
                  </div>
                </div>

                {/* Story Audio URL and Player Preview */}
                <div style={{ marginBottom: "0.75rem" }}>
                  <label className="form-label">Story Audio URL *</label>
                  <input
                    className="form-input"
                    type="url"
                    placeholder="https://.../story.mp3"
                    required
                    value={form.audioUrl}
                    onChange={e => setForm(f => ({ ...f, audioUrl: e.target.value }))}
                  />
                  {form.audioUrl && (
                    <div style={{
                      marginTop: "0.55rem",
                      padding: "0.75rem 1rem",
                      borderRadius: 10,
                      background: "rgba(15,23,42,0.6)",
                      border: "1px solid rgba(56,189,248,0.25)"
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                          <span>🎧</span>
                          <strong style={{ fontSize: "0.82rem", color: "#38bdf8" }}>Story Audio Player</strong>
                        </div>
                        <span style={{ fontSize: "0.72rem", padding: "2px 8px", borderRadius: 4, background: "rgba(16,185,129,0.15)", color: "#10b981", fontWeight: 700 }}>
                          ⏱️ {form.storyDuration ? `${form.storyDuration}s` : "Ready"}
                        </span>
                      </div>
                      <audio controls src={form.audioUrl} style={{ width: "100%", height: 38 }} />
                      <div style={{ fontSize: "0.7rem", color: "#94a3b8", marginTop: "0.35rem" }}>
                        ✅ Narrator preamble &amp; outro trimmed. Audio starts directly with the story narrative.
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ marginBottom: "1rem" }}>
                  <label className="form-label">Expected Summary / Key Points (optional)</label>
                  <textarea
                    className="form-input"
                    rows={3}
                    placeholder="Key points students should mention..."
                    value={form.summaryGuide}
                    onChange={e => setForm(f => ({ ...f, summaryGuide: e.target.value }))}
                  />
                </div>
              </>
            )}
            {form.setupType === "picture_description" && (
              <>
                <div style={{ marginBottom: "0.75rem" }}>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={generatingPicture}
                    onClick={handleGeneratePicture}
                    style={{ width: "100%", marginBottom: "0.5rem", background: "linear-gradient(135deg,#1e40af,#1d4ed8)" }}
                  >
                    {generatingPicture ? "🖼️ Generating picture challenge…" : "🖼️ AI Generate Picture Challenge"}
                  </button>
                  <div style={{ fontSize: "0.72rem", color: "var(--muted)", textAlign: "center" }}>
                    Generates topic, instructions, and fetches a Pexels image automatically. You can edit any field before saving.
                  </div>
                </div>
                <div style={{ marginBottom: "0.75rem" }}>
                  <label className="form-label">Image URL * <span style={{ color: "var(--muted)", fontWeight: 400 }}>(direct photo link)</span></label>
                  <input
                    className="form-input"
                    type="url"
                    placeholder="https://images.pexels.com/photos/..."
                    required
                    value={form.imageUrl}
                    onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))}
                  />
                  {form.imageUrl && (
                    <img
                      src={form.imageUrl}
                      alt="preview"
                      style={{ marginTop: "0.5rem", width: "100%", maxHeight: 180, objectFit: "cover", borderRadius: 8, border: "1px solid rgba(99,179,237,0.3)" }}
                      onError={e => { e.target.style.display = "none"; }}
                    />
                  )}
                </div>
                <div className="grid-cols-2" style={{ marginBottom: "0.75rem" }}>
                  <div>
                    <label className="form-label">Photographer Name</label>
                    <input
                      className="form-input"
                      placeholder="e.g. John Smith"
                      value={form.imagePhotographer}
                      onChange={e => setForm(f => ({ ...f, imagePhotographer: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="form-label">Image Source</label>
                    <input
                      className="form-input"
                      placeholder="e.g. Pexels"
                      value={form.imageSource}
                      onChange={e => setForm(f => ({ ...f, imageSource: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="grid-cols-2" style={{ marginBottom: "0.75rem" }}>
                  <div>
                    <label className="form-label">Pexels Photo Page URL</label>
                    <input
                      className="form-input"
                      type="url"
                      placeholder="https://www.pexels.com/photo/..."
                      value={form.imagePageUrl}
                      onChange={e => setForm(f => ({ ...f, imagePageUrl: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="form-label">Photographer Profile URL</label>
                    <input
                      className="form-input"
                      type="url"
                      placeholder="https://www.pexels.com/@..."
                      value={form.imagePhotographerUrl}
                      onChange={e => setForm(f => ({ ...f, imagePhotographerUrl: e.target.value }))}
                    />
                  </div>
                </div>
                <div style={{ marginBottom: "1rem" }}>
                  <label className="form-label">Speaking Instructions (optional)</label>
                  <textarea
                    className="form-input"
                    rows={2}
                    placeholder="e.g. Describe what you see. Mention who is in the image, what they are doing, and what the setting feels like."
                    value={form.imageInstructions}
                    onChange={e => setForm(f => ({ ...f, imageInstructions: e.target.value }))}
                  />
                </div>
              </>
            )}
            {form.setupType === "shadowing_video" && (
              <>
                {/* 1-Click Fully Automated Podcast Fetcher & Slicer */}
                <div style={{ marginBottom: "0.85rem", padding: "0.85rem 1rem", borderRadius: 12, background: "linear-gradient(135deg, rgba(236,72,153,0.12), rgba(168,85,247,0.08))", border: "1px solid rgba(236,72,153,0.35)" }}>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={generatingShadowing}
                    onClick={handleGenerateShadowing}
                    style={{
                      width: "100%",
                      marginBottom: "0.45rem",
                      background: "linear-gradient(135deg, #ec4899, #8b5cf6)",
                      border: "none",
                      padding: "0.75rem 1rem",
                      fontWeight: 800,
                      fontSize: "0.92rem",
                      borderRadius: 10,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.5rem",
                      boxShadow: "0 4px 15px rgba(236, 72, 153, 0.35)",
                      cursor: "pointer"
                    }}
                  >
                    {generatingShadowing ? "⚡ Ingesting Podcast & AI Slicing Native Audio…" : "⚡ 1-Click Auto-Ingest & Slice Native Podcast Audio"}
                  </button>
                  <div style={{ fontSize: "0.72rem", color: "var(--muted)", textAlign: "center" }}>
                    Fully automated: grabs latest Stanford/TED podcast episode, transcribes with Whisper, and slices optimal 60-180s continuous speech. Zero manual admin entry needed!
                  </div>
                </div>

                <div style={{ marginBottom: "0.85rem", padding: "0.85rem 1rem", borderRadius: 12, background: "rgba(236,72,153,0.08)", border: "1px solid rgba(236,72,153,0.3)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
                    <span style={{ fontSize: "1.2rem" }}>🎙️</span>
                    <div>
                      <strong style={{ fontSize: "0.88rem", color: "#f472b6" }}>Native Speaker Human Audio (No AI Generation)</strong>
                      <div style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
                        Pick from authentic real human speaker lessons below, or paste any external native speaker MP3 audio link with transcript.
                      </div>
                    </div>
                  </div>
                </div>

                {/* Curated 1080p Real-Speaker Speech Library Dropdown */}
                <div style={{ marginBottom: "0.85rem", padding: "0.85rem", borderRadius: 10, background: "rgba(236,72,153,0.06)", border: "1px solid rgba(236,72,153,0.25)" }}>
                  <div style={{ fontWeight: 700, fontSize: "0.82rem", color: "#f472b6", marginBottom: "0.4rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span>📻 Pick from Native Human Speaker Audio Bank</span>
                    <span style={{ fontSize: "0.68rem", background: "rgba(34,197,94,0.15)", color: "#22c55e", padding: "0.1rem 0.4rem", borderRadius: 4, fontWeight: 700 }}>100% Human Native Voice</span>
                  </div>
                  <select
                    className="form-input"
                    style={{ fontSize: "0.82rem" }}
                    onChange={e => {
                      const idx = parseInt(e.target.value, 10);
                      if (!isNaN(idx) && CURATED_SHADOWING_LESSONS[idx]) {
                        const item = CURATED_SHADOWING_LESSONS[idx];
                        setForm(f => ({
                          ...f,
                          videoTitle: item.title,
                          topic: item.topic,
                          question: item.instructions,
                          videoUrl: item.videoUrl,
                          videoDuration: item.videoDuration,
                          videoTranscript: item.videoTranscript,
                          category: "Shadowing Practice"
                        }));
                        notify(`Loaded curated lesson: "${item.title}"`);
                      }
                    }}
                    defaultValue=""
                  >
                    <option value="" disabled>Select a curated TED-style public speaking lesson...</option>
                    {CURATED_SHADOWING_LESSONS.map((item, idx) => (
                      <option key={idx} value={idx}>
                        {item.title} ({item.videoDuration}s) — {item.topic}
                      </option>
                    ))}
                  </select>
                  <div style={{ fontSize: "0.71rem", color: "var(--muted)", marginTop: "0.35rem" }}>
                    Authentic human public speaking & communication audio clips with aligned scripts. No synthetic/robotic AI generation.
                  </div>
                </div>

                <div style={{ marginBottom: "0.75rem" }}>
                  <label className="form-label">Video Title / Topic *</label>
                  <input
                    className="form-input"
                    type="text"
                    placeholder="e.g. Master the Art of Public Speaking"
                    required
                    value={form.videoTitle}
                    onChange={e => setForm(f => ({ ...f, videoTitle: e.target.value, topic: e.target.value || f.topic }))}
                  />
                </div>
                <div style={{ marginBottom: "0.75rem" }}>
                  <label className="form-label">Native Speaker Audio URL (MP3) * <span style={{ color: "var(--muted)", fontWeight: 400 }}>(direct human audio stream link, max 3 min)</span></label>
                  <input
                    className="form-input"
                    type="url"
                    placeholder="https://.../video.mp4"
                    required
                    value={form.videoUrl}
                    onChange={e => setForm(f => ({ ...f, videoUrl: e.target.value }))}
                  />
                  {form.videoUrl && (
                    <div style={{ marginTop: "0.5rem", padding: "0.65rem 0.85rem", borderRadius: 8, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(236,72,153,0.3)", display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <span style={{ fontSize: "1.1rem" }}>🔊</span>
                      <audio
                        src={form.videoUrl}
                        controls
                        style={{ flex: 1, height: 36 }}
                        onError={e => { e.target.style.display = "none"; }}
                      />
                    </div>
                  )}
                </div>
                <div style={{ marginBottom: "0.75rem" }}>
                  <label className="form-label">Speech Duration (seconds) * <span style={{ color: "var(--muted)", fontWeight: 400 }}>(Maximum 180s / 3 minutes)</span></label>
                  <input
                    className="form-input"
                    type="number"
                    min="10"
                    max="180"
                    placeholder="e.g. 60"
                    required
                    value={form.videoDuration}
                    onChange={e => setForm(f => ({ ...f, videoDuration: Math.min(180, Math.max(10, parseInt(e.target.value, 10) || 60)) }))}
                  />
                  <div style={{ fontSize: "0.72rem", color: "#f472b6", marginTop: "0.25rem" }}>
                    ⭐ Student scoring: ≥85% active spoken time = 40/40 pts. Below 85% receives effort-proportional score. Delivery &amp; Rhythm = 60 pts.
                  </div>
                </div>
                <div style={{ marginBottom: "0.85rem" }}>
                  <label className="form-label">Video Transcript / Spoken Script <span style={{ color: "var(--muted)", fontWeight: 400 }}>(subtitles for student to shadow)</span></label>
                  <textarea
                    className="form-input"
                    rows={4}
                    placeholder="Exact text or speech spoken in the video so students can read along while shadowing..."
                    value={form.videoTranscript}
                    onChange={e => setForm(f => ({ ...f, videoTranscript: e.target.value }))}
                  />
                </div>
              </>
            )}
            <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
              <button 
                type="submit" 
                className="btn-primary" 
                disabled={saving} 
                style={{ 
                  minWidth: 180,
                  background: publishMode === "now" ? "linear-gradient(135deg,#10b981,#059669)" : undefined 
                }}
              >
                {saving 
                  ? (editingId ? "Updating…" : "Publishing…") 
                  : (editingId 
                      ? (publishMode === "now" ? "⚡ Update & Make Active Now" : "💾 Update Question") 
                      : (publishMode === "now" ? "⚡ Publish Active Question Now" : "📅 Schedule Question"))}
              </button>
              <button type="button" onClick={resetForm} className="btn-ghost" style={{ padding: "0.65rem 1.25rem" }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {loading && <div className="spinner-wrap"><div className="spinner" /></div>}

      {/* Scheduled Questions */}
      {!loading && (
        <>
          {Object.entries(groupedQuestions).map(([type, questions]) => (
            questions.length > 0 && (
              <div key={type} style={{ marginBottom: "1.5rem" }}>
                <div style={{ 
                  fontSize: "0.75rem", 
                  fontWeight: 700, 
                  color: "#7c6fff", 
                  textTransform: "uppercase", 
                  letterSpacing: "0.08em", 
                  marginBottom: "0.75rem" 
                }}>
                  📝 {setupTypeLabels[type]}
                </div>
                {questions.map(q => (
                  <div key={q._id} style={{
                    background: "var(--bg-secondary)",
                    border: editingId === q._id ? "2px solid #7c6fff" : (q.isUsed ? "1px solid rgba(16,185,129,0.3)" : "1px solid rgba(124,111,255,0.25)"),
                    borderRadius: 14, 
                    padding: "1rem 1.25rem",
                    marginBottom: "0.75rem",
                    transition: "all 0.2s",
                  }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                      <div style={{ flex: 1, minWidth: 260 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem", flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text)" }}>{q.topic}</span>
                          <span style={{
                            fontSize: "0.65rem", fontWeight: 700, padding: "0.15rem 0.5rem",
                            borderRadius: 20, textTransform: "uppercase",
                            background: q.isUsed ? "rgba(16,185,129,0.15)" : "rgba(124,111,255,0.15)",
                            color: q.isUsed ? "#34d399" : "#7c6fff",
                          }}>
                            {q.isUsed ? "⚡ Active / Published" : "Manual"}
                          </span>
                        </div>

                        <div style={{ fontSize: "0.85rem", color: "var(--text)", marginBottom: "0.4rem", lineHeight: 1.4 }}>
                          {q.question}
                        </div>
                        {q.audioUrl && (
                          <div style={{ fontSize: "0.78rem", color: "#2dd4bf", marginBottom: "0.4rem", wordBreak: "break-all" }}>
                            🎧 {q.audioUrl}
                          </div>
                        )}
                        {q.imageUrl && (
                          <div style={{ fontSize: "0.78rem", color: "#90cdf4", marginBottom: "0.4rem", wordBreak: "break-all" }}>
                            🖼️ {q.imageUrl}
                          </div>
                        )}
                        {q.videoUrl && (
                          <div style={{ fontSize: "0.78rem", color: "#f472b6", marginBottom: "0.4rem", wordBreak: "break-all" }}>
                            🎬 Video: {q.videoTitle ? `"${q.videoTitle}" ` : ""}({q.videoDuration || 60}s) — {q.videoUrl}
                          </div>
                        )}

                        <div style={{ display: "flex", gap: "1rem", fontSize: "0.78rem", color: "var(--muted)", flexWrap: "wrap" }}>
                          <span>📅 {new Date(q.scheduledFor).toLocaleDateString("en-IN", { dateStyle: "medium" })}</span>
                          <span>⏰ {q.scheduledTime || new Date(q.scheduledFor).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
                          <span>👤 {q.createdBy}</span>
                          <span>📂 {q.category}</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0, alignItems: "center", flexWrap: "wrap" }}>
                        <button
                          onClick={() => handlePublishNow(q._id)}
                          disabled={busy[q._id]}
                          title="Immediately set as today's active question"
                          style={{
                            background: "rgba(16,185,129,0.15)",
                            border: "1px solid rgba(16,185,129,0.35)",
                            color: "#34d399", borderRadius: 10,
                            padding: "0.5rem 0.85rem", fontWeight: 700, fontSize: "0.82rem",
                            cursor: "pointer", whiteSpace: "nowrap",
                            opacity: busy[q._id] ? 0.5 : 1
                          }}
                        >
                          ⚡ Make Active
                        </button>
                        <button
                          onClick={() => handleEdit(q)}
                          disabled={busy[q._id]}
                          style={{
                            background: "rgba(124,111,255,0.12)",
                            border: "1px solid rgba(124,111,255,0.3)",
                            color: "#a78bfa", borderRadius: 10,
                            padding: "0.5rem 0.85rem", fontWeight: 700, fontSize: "0.82rem",
                            cursor: "pointer", whiteSpace: "nowrap",
                          }}
                        >
                          ✏️ Edit
                        </button>
                        <button
                          onClick={() => deleteQuestion(q._id)}
                          disabled={busy[q._id]}
                          style={{
                            background: "rgba(248,113,113,0.12)",
                            border: "1px solid rgba(248,113,113,0.3)",
                            color: "#f87171", borderRadius: 10,
                            padding: "0.5rem 0.85rem", fontWeight: 700, fontSize: "0.82rem",
                            cursor: "pointer", whiteSpace: "nowrap",
                            opacity: busy[q._id] ? 0.5 : 1
                          }}
                        >
                          {busy[q._id] ? "Deleting…" : "✕ Delete"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ))}

          {manualQuestions.length === 0 && (
            <div style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--muted)" }}>
              <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>📝</div>
              <div style={{ fontWeight: 600, marginBottom: "0.5rem" }}>No manual questions scheduled</div>
              <div style={{ fontSize: "0.85rem" }}>Click "⚡ Setup Now" to create and publish a question immediately for today</div>
            </div>
          )}
        </>
      )}

    </div>
  );
}

