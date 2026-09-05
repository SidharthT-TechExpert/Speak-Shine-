import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import Modal from "../components/Modal.jsx";
import api, { getAuthToken } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import GuestBanner from "../components/GuestBanner.jsx";
import { getSharedSocket } from "../hooks/useSocket.js";
import { useNoiseCancellation } from "../hooks/useNoiseCancellation.js";
import { useBackgroundBlur } from "../hooks/useBackgroundBlur.js";
import { useVideoFrameHash } from "../hooks/useVideoFrameHash.js";
import { evaluateSubmitGate, getDurationLimits } from "../utils/videoSubmitGate.js";
import { saveDraft, loadDraft, clearDraft } from "../utils/videoDraftDB.js";
import MonthlyGraceCountdown from "../components/MonthlyGraceCountdown.jsx";

// ── Mode toggle ──────────────────────────────────────────────────────────────
// "upload"  → existing file-upload flow
// "record"  → new live-record flow

export default function VideoAnalysis() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isGuest = !user;

  const [mode, setMode] = useState(() => {
    return location.pathname === "/video-analysis" && !location.search.includes("record") ? "upload" : "record";
  });

  useEffect(() => {
    if (location.pathname === "/video-analysis" && !location.search.includes("record")) {
      setMode("upload");
    } else {
      setMode("record");
    }
  }, [location.pathname, location.search]);

  const [todayQuestion, setTodayQuestion] = useState(null);
  const [todayVocabulary, setTodayVocabulary] = useState([]);
  const [vocabWordCount, setVocabWordCount] = useState(5);
  const [vocabRequiredCount, setVocabRequiredCount] = useState(3);
  const [isMonthlyReflection, setIsMonthlyReflection] = useState(false);
  const [isMonthlyGoals, setIsMonthlyGoals] = useState(false);
  const [isStorySummary, setIsStorySummary] = useState(false);
  const [isPictureDescription, setIsPictureDescription] = useState(false);
  const [picturePreviewOpen, setPicturePreviewOpen] = useState(false);
  const [allowPrivateVideos, setAllowPrivateVideos] = useState(true);
  const [durationLimits, setDurationLimits] = useState(null);

  // shared state
  const [reportId, setReportId]       = useState(null);
  const [report, setReport]           = useState(null);
  const [progressStage, setProgressStage] = useState("");
  const [progressStageKey, setProgressStageKey] = useState("");
  const [completedSteps, setCompletedSteps] = useState([]);
  const [progressPercent, setProgressPercent] = useState(0);
  const [queueInfo, setQueueInfo]     = useState(null);
  const [myReports, setMyReports]     = useState([]);
  const [modal, setModal]             = useState(null);
  const [visibilityUpdating, setVisibilityUpdating] = useState(false);

  useEffect(() => {
    if (!picturePreviewOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setPicturePreviewOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [picturePreviewOpen]);

  useEffect(() => {
    if (isGuest) {
      // Show sample question for guests from preview API
      api.get("/guest/preview").then(r => {
        const t = r.data?.today;
        if (t?.question) setTodayQuestion({ question: t.question, topic: t.topic, category: t.category, audioUrl: t.audioUrl, contentType: t.contentType, imageUrl: t.imageUrl, imageSource: t.imageSource, imagePageUrl: t.imagePageUrl, imagePhotographer: t.imagePhotographer, imagePhotographerUrl: t.imagePhotographerUrl, imageInstructions: t.imageInstructions });
        if (Array.isArray(t?.vocabulary) && t.vocabulary.length > 0) setTodayVocabulary(t.vocabulary);
        if (t?.vocabWordCount) setVocabWordCount(t.vocabWordCount);
        if (t?.vocabRequiredCount) setVocabRequiredCount(t.vocabRequiredCount);
        if (t?.durationLimits) setDurationLimits(t.durationLimits);
      }).catch(() => {});
      return;
    }
    loadMyReports();
    // Fetch today's question for the top card
      api.get("/dashboard/me?_duration_refresh=" + Date.now()).then(r => {
      const t = r.data?.today;
      if (t?.question) setTodayQuestion({ question: t.question, topic: t.topic, category: t.category, audioUrl: t.audioUrl, contentType: t.contentType, imageUrl: t.imageUrl, imageSource: t.imageSource, imagePageUrl: t.imagePageUrl, imagePhotographer: t.imagePhotographer, imagePhotographerUrl: t.imagePhotographerUrl, imageInstructions: t.imageInstructions });
      if (t?.isMonthlyReflection) setIsMonthlyReflection(true);
      if (t?.isMonthlyGoals) setIsMonthlyGoals(true);
      if (t?.isStorySummary || t?.contentType === "story_audio") setIsStorySummary(true);
      if (t?.isPictureDescription || t?.contentType === "picture_description") setIsPictureDescription(true);
      if (Array.isArray(t?.vocabulary) && t.vocabulary.length > 0) setTodayVocabulary(t.vocabulary);
      if (t?.vocabWordCount) setVocabWordCount(t.vocabWordCount);
      if (t?.vocabRequiredCount) setVocabRequiredCount(t.vocabRequiredCount);
      if (r.data?.today?.allowPrivateVideos !== undefined) setAllowPrivateVideos(r.data.today.allowPrivateVideos);
      if (t?.durationLimits) setDurationLimits(t.durationLimits);
    }).catch(() => {});
  }, [isGuest]);

  // Auto-refresh reports table when there are processing reports
  useEffect(() => {
    const hasProcessing = myReports.some(r => r.status === "processing");
    if (!hasProcessing) return;

    const interval = setInterval(() => {
      loadMyReports();
    }, 3000); // Refresh every 3 seconds

    return () => clearInterval(interval);
  }, [myReports]);

  // Real-time progress: polling + SSE + Socket.io (fixes buffered/batched updates)
  useEffect(() => {
    if (!reportId || !report || report.status !== "processing") return;

    let done = false;
    // token may be null for cookie-based sessions — SSE/XHR use withCredentials instead
    const token = localStorage.getItem("token") || null;

    const finish = (data) => {
      if (done) return;
      done = true;
      setQueueInfo(null);
      if (data.status === "completed") setProgressPercent(100);
      api.get(`/video/report/${reportId}`).then((r) => {
        setReport(r.data);
        loadMyReports();
      });
    };

    const applyProgress = (data) => {
      if (!data || done) return;
      if (data.status === "queued") {
        setQueueInfo({
          position: data.position,
          queueLength: data.queueLength,
          estimatedWait: data.estimatedWait,
        });
        setProgressStage(`Position #${data.position} in queue…`);
        return;
      }
      if (Array.isArray(data.completedSteps)) setCompletedSteps([...data.completedSteps]);
      if (data.stageKey) setProgressStageKey(data.stageKey);
      if (data.stage) {
        setProgressStage(data.stage);
        setQueueInfo(null);
      }
      if (typeof data.percent === "number") setProgressPercent(data.percent);
      if (data.status === "completed" || data.status === "failed") finish(data);
    };

    const poll = async () => {
      if (done) return;
      try {
        const { data } = await api.get(`/video/progress-state/${reportId}`);
        applyProgress(data);
      } catch { /* retry next tick */ }
    };

    poll();
    const pollTimer = setInterval(poll, 700);

    const evtSource = new EventSource(
      token
        ? `/api/video/progress/${reportId}?token=${encodeURIComponent(token)}`
        : `/api/video/progress/${reportId}`
    );
    evtSource.onmessage = (e) => {
      try {
        applyProgress(JSON.parse(e.data));
      } catch { /* ignore */ }
    };
    evtSource.onerror = () => evtSource.close();

    const socket = token ? getSharedSocket(token) : null;
    const onSocketProgress = (payload) => {
      if (String(payload?.reportId) !== String(reportId)) return;
      applyProgress(payload);
    };
    socket?.on("video:progress", onSocketProgress);

    return () => {
      done = true;
      clearInterval(pollTimer);
      evtSource.close();
      socket?.off("video:progress", onSocketProgress);
    };
  }, [reportId, report?.status]);

  const loadMyReports = async () => {
    try {
      const res = await api.get("/video/my-reports");
      setMyReports(res.data.reports || []);
    } catch {}
  };

  const onAnalysisStarted = (id, isPublic = true) => {
    setReportId(id);
    setReport({ status: "processing", reportId: id, isPublic });
    setProgressStage("Preparing your video…");
    setProgressStageKey("download");
    setCompletedSteps([]);
    setProgressPercent(5);
    setQueueInfo(null);
    loadMyReports();
    setTimeout(() => document.getElementById("report-section")?.scrollIntoView({ behavior: "smooth" }), 200);
  };

  const toggleReportVisibility = async (id) => {
    if (visibilityUpdating) return;
    setVisibilityUpdating(true);
    try {
      const res = await api.patch(`/video/report/${id}/visibility`);
      setReport(prev => prev ? { ...prev, isPublic: res.data.isPublic } : null);
      loadMyReports();
    } catch (err) {
      setModal({
        type: "alert",
        title: "Error",
        message: err.response?.data?.error || "Failed to update visibility",
        confirmText: "OK",
        onConfirm: () => setModal(null)
      });
    } finally {
      setVisibilityUpdating(false);
    }
  };

  const viewReport = async (id) => {
    setReportId(id);
    setReport({ status: "loading" });
    setTimeout(() => document.getElementById("report-section")?.scrollIntoView({ behavior: "smooth" }), 100);
    try {
      const res = await api.get(`/video/report/${id}`);
      setReport(res.data);
    } catch {
      setReport({ status: "failed", errorMessage: "Failed to load report" });
    }
  };

  const deleteReport = async (id) => {
    setModal({
      type: "danger", title: "Delete Report",
      message: "This report will be permanently deleted. Are you sure?",
      confirmText: "Delete",
      onConfirm: async () => {
        setModal(null);
        try {
          await api.delete(`/video/report/${id}`);
          loadMyReports();
          if (reportId === id) { setReportId(null); setReport(null); }
        } catch {
          setModal({ type: "alert", title: "Error", message: "Failed to delete report.", confirmText: "OK", onConfirm: () => setModal(null) });
        }
      },
    });
  };

  const formatTimeRemaining = (expiresAt) => {
    const diff = new Date(expiresAt) - new Date();
    if (diff <= 0) return "Expired";
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return h > 0 ? `${h}h ${m}m remaining` : `${m}m remaining`;
  };

  return (
    <Layout title="Video Analysis">
      {modal && (
        <Modal
          type={modal.type} title={modal.title} message={modal.message}
          confirmText={modal.confirmText} onConfirm={modal.onConfirm}
          onCancel={modal.type !== "alert" ? () => setModal(null) : undefined}
        />
      )}
      <div className="video-analysis-page">
        {/* Monthly 2-Day Free Grace Period Countdown & Instant Payment Option */}
        <MonthlyGraceCountdown />

        {/* Guest banner */}
        {isGuest && <GuestBanner />}
        {isGuest && (
          <div style={{
            background: "rgba(124,111,255,0.07)",
            border: "1px solid rgba(124,111,255,0.25)",
            borderRadius: 12,
            padding: "0.85rem 1.1rem",
            marginBottom: "1rem",
            fontSize: "0.82rem",
            color: "var(--muted)",
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
          }}>
            <span>👁️</span>
            <span>You can <strong style={{ color: "var(--text)" }}>record or upload</strong> a video in preview mode, but <strong style={{ color: "#f87171" }}>submitting is disabled</strong>. Register to get AI feedback!</span>
          </div>
        )}


        {/* ── Monthly Goals Card (1st of month) ── */}
        {isMonthlyGoals && (
          <div style={{
            background: "linear-gradient(135deg, #0a1f0a 0%, #0d3d1a 50%, #0a2e12 100%)",
            border: "2px solid rgba(74,222,128,0.45)",
            borderRadius: 18,
            padding: "1.5rem",
            marginBottom: "1rem",
            position: "relative",
            overflow: "hidden",
            boxShadow: "0 8px 40px rgba(34,197,94,0.2)",
          }}>
            <div style={{ position:"absolute", top:-60, right:-60, width:200, height:200, borderRadius:"50%", background:"radial-gradient(circle, rgba(74,222,128,0.18) 0%, transparent 70%)", pointerEvents:"none" }} />

            <div style={{ display:"flex", alignItems:"center", gap:"0.75rem", marginBottom:"1.25rem" }}>
              <div style={{ fontSize:"2.5rem" }}>🎯</div>
              <div>
                <div style={{ fontSize:"0.7rem", color:"rgba(74,222,128,0.8)", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em" }}>
                  New Month — New Goals
                </div>
                <div style={{ fontSize:"1.3rem", fontWeight:800, color:"#fff", lineHeight:1.2 }}>
                  Monthly Goal Setting
                </div>
                <div style={{ fontSize:"0.8rem", color:"rgba(255,255,255,0.6)", marginTop:"0.2rem" }}>
                  Speak your plan, dreams &amp; goals for this month
                </div>
              </div>
            </div>

            <div style={{ display:"flex", flexDirection:"column", gap:"0.6rem", marginBottom:"1.25rem" }}>
              {[
                { n:"1", q:"What is your main goal for this month in the program?" },
                { n:"2", q:"What is your dream or target you are working toward right now?" },
                { n:"3", q:"What specific steps will you take this month to improve your communication?" },
                { n:"4", q:"What was your biggest challenge last month and how will you overcome it this month?" },
                { n:"5", q:"How many reviews are you planning to attend this month?" },
                { n:"6", q:"What will you do differently this month to grow faster?" },
              ].map(({ n, q }) => (
                <div key={n} style={{
                  display:"flex", gap:"0.75rem", alignItems:"flex-start",
                  background:"rgba(255,255,255,0.06)",
                  border:"1px solid rgba(74,222,128,0.2)",
                  borderRadius:12, padding:"0.75rem 1rem",
                }}>
                  <div style={{
                    minWidth:26, height:26, borderRadius:"50%",
                    background:"rgba(34,197,94,0.25)", border:"1px solid rgba(74,222,128,0.5)",
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize:"0.75rem", fontWeight:800, color:"#4ade80", flexShrink:0,
                  }}>{n}</div>
                  <div style={{ fontSize:"0.88rem", color:"rgba(255,255,255,0.9)", lineHeight:1.5 }}>{q}</div>
                </div>
              ))}
            </div>

            <div style={{
              background:"rgba(34,197,94,0.1)", border:"1px solid rgba(74,222,128,0.25)",
              borderRadius:10, padding:"0.75rem 1rem",
              fontSize:"0.8rem", color:"rgba(255,255,255,0.7)", lineHeight:1.5,
            }}>
              💡 <strong style={{ color:"#4ade80" }}>Tip:</strong> Be specific and speak from the heart. Your goals drive your growth — say them out loud with confidence!
            </div>
          </div>
        )}

        {/* ── Monthly Reflection Card (last day of month) ── */}
        {isMonthlyReflection && (
          <div style={{
            background: "linear-gradient(135deg, #1a0a2e 0%, #2d1060 50%, #1a0a2e 100%)",
            border: "2px solid rgba(167,139,250,0.5)",
            borderRadius: 18,
            padding: "1.5rem",
            marginBottom: "1rem",
            position: "relative",
            overflow: "hidden",
            boxShadow: "0 8px 40px rgba(139,92,246,0.25)",
          }}>
            {/* Glow */}
            <div style={{ position:"absolute", top:-60, right:-60, width:200, height:200, borderRadius:"50%", background:"radial-gradient(circle, rgba(167,139,250,0.2) 0%, transparent 70%)", pointerEvents:"none" }} />

            {/* Header */}
            <div style={{ display:"flex", alignItems:"center", gap:"0.75rem", marginBottom:"1.25rem" }}>
              <div style={{ fontSize:"2.5rem" }}>🌟</div>
              <div>
                <div style={{ fontSize:"0.7rem", color:"rgba(167,139,250,0.8)", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em" }}>
                  End of Month
                </div>
                <div style={{ fontSize:"1.3rem", fontWeight:800, color:"#fff", lineHeight:1.2 }}>
                  Monthly Reflection
                </div>
                <div style={{ fontSize:"0.8rem", color:"rgba(255,255,255,0.6)", marginTop:"0.2rem" }}>
                  Record a video answering all questions below
                </div>
              </div>
            </div>

            {/* Questions list */}
            <div style={{ display:"flex", flexDirection:"column", gap:"0.6rem", marginBottom:"1.25rem" }}>
              {[
                { n:"1", q:"How many reviews did you attend this month?" },
                { n:"2", q:"How many reviews passed and how many failed? Why did you fail?" },
                { n:"3", q:"How many extensions did you take this month?" },
                { n:"4", q:"What is your current growth and progress in the program?" },
                { n:"5", q:"What did you do this month to improve your communication skill?" },
                { n:"6", q:"What is your communication skill level now compared to last month?" },
              ].map(({ n, q }) => (
                <div key={n} style={{
                  display:"flex", gap:"0.75rem", alignItems:"flex-start",
                  background:"rgba(255,255,255,0.06)",
                  border:"1px solid rgba(167,139,250,0.2)",
                  borderRadius:12, padding:"0.75rem 1rem",
                }}>
                  <div style={{
                    minWidth:26, height:26, borderRadius:"50%",
                    background:"rgba(139,92,246,0.3)", border:"1px solid rgba(139,92,246,0.5)",
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize:"0.75rem", fontWeight:800, color:"#a78bfa", flexShrink:0,
                  }}>{n}</div>
                  <div style={{ fontSize:"0.88rem", color:"rgba(255,255,255,0.9)", lineHeight:1.5 }}>{q}</div>
                </div>
              ))}
            </div>

            {/* Tip */}
            <div style={{
              background:"rgba(139,92,246,0.12)", border:"1px solid rgba(139,92,246,0.25)",
              borderRadius:10, padding:"0.75rem 1rem",
              fontSize:"0.8rem", color:"rgba(255,255,255,0.7)", lineHeight:1.5,
            }}>
              💡 <strong style={{ color:"#a78bfa" }}>Tip:</strong> Speak clearly and answer each question in order. This counts as your daily submission — same rules apply.
            </div>
          </div>
        )}

        {/* ── Picture Description Card ── */}
        {todayQuestion && isPictureDescription && (
          <div style={{
            background: "linear-gradient(135deg, #0f1a2e 0%, #1a2d4a 50%, #0f1a2e 100%)",
            border: "2px solid rgba(99,179,237,0.45)",
            borderRadius: 18,
            padding: "1.5rem",
            marginBottom: "1rem",
            boxShadow: "0 8px 40px rgba(66,153,225,0.2)",
          }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
              <div style={{ fontSize: "2.5rem" }}>🖼️</div>
              <div>
                <div style={{ fontSize: "0.7rem", color: "rgba(147,197,253,0.85)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>Picture Description</div>
                <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "#fff", lineHeight: 1.2 }}>
                  {todayQuestion.topic || "Describe What You See"}
                </div>
                <div style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.6)", marginTop: "0.2rem" }}>
                  Look at the image carefully, then record your response.
                </div>
              </div>
            </div>

            {/* Image */}
            {todayQuestion.imageUrl && (
              <div style={{ marginBottom: "1rem", borderRadius: 12, overflow: "hidden", position: "relative" }}>
                <img
                  src={todayQuestion.imageUrl}
                  alt={todayQuestion.topic || "Picture description challenge"}
                  style={{
                    width: "100%",
                    maxHeight: 400,
                    objectFit: "contain",
                    background: "#0a0a14",
                    display: "block",
                    borderRadius: 12,
                  }}
                  loading="lazy"
                />
                <button
                  type="button"
                  onClick={() => setPicturePreviewOpen(true)}
                  aria-label="View picture full screen"
                  style={{
                    position: "absolute", top: "0.75rem", right: "0.75rem",
                    border: "1px solid rgba(255,255,255,0.35)", borderRadius: 10,
                    padding: "0.5rem 0.7rem", background: "rgba(0,0,0,0.7)",
                    color: "#fff", fontSize: "0.8rem", fontWeight: 700,
                    cursor: "pointer", backdropFilter: "blur(6px)",
                  }}
                >⛶ View Full Screen</button>
                {/* Photographer attribution */}
                {todayQuestion.imagePhotographer && (
                  <div style={{
                    position: "absolute", bottom: 0, left: 0, right: 0,
                    padding: "0.5rem 0.75rem",
                    background: "linear-gradient(to top, rgba(0,0,0,0.65), transparent)",
                    borderBottomLeftRadius: 12, borderBottomRightRadius: 12,
                    fontSize: "0.65rem", color: "rgba(255,255,255,0.75)",
                    display: "flex", alignItems: "center", gap: "0.25rem",
                  }}>
                    <span>📷</span>
                    <span>
                      Photo by{" "}
                      {todayQuestion.imagePhotographerUrl
                        ? <a href={todayQuestion.imagePhotographerUrl} target="_blank" rel="noopener noreferrer" style={{ color: "rgba(255,255,255,0.9)", textDecoration: "underline" }}>{todayQuestion.imagePhotographer}</a>
                        : todayQuestion.imagePhotographer
                      }
                      {todayQuestion.imageSource && (
                        <>
                          {" on "}
                          {todayQuestion.imagePageUrl
                            ? <a href={todayQuestion.imagePageUrl} target="_blank" rel="noopener noreferrer" style={{ color: "rgba(255,255,255,0.9)", textDecoration: "underline" }}>{todayQuestion.imageSource}</a>
                            : todayQuestion.imageSource
                          }
                        </>
                      )}
                    </span>
                  </div>
                )}
              </div>
            )}

            {picturePreviewOpen && todayQuestion.imageUrl && createPortal(
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Full screen picture preview"
                onClick={() => setPicturePreviewOpen(false)}
                style={{
                  position: "fixed", inset: 0, zIndex: 2000,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  padding: "2rem", background: "rgba(0,0,0,0.92)",
                }}
              >
                <button
                  type="button"
                  onClick={() => setPicturePreviewOpen(false)}
                  aria-label="Close full screen picture preview"
                  style={{
                    position: "fixed", top: "1.5rem", right: "1.5rem", zIndex: 2001,
                    width: 42, height: 42, borderRadius: "50%",
                    border: "2px solid rgba(255,255,255,0.65)",
                    background: "rgba(255,255,255,0.12)", color: "#fff",
                    fontSize: "1.4rem", cursor: "pointer",
                    boxShadow: "0 3px 16px rgba(0,0,0,0.45)",
                  }}
                >×</button>
                <a
                  href={todayQuestion.imageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={event => event.stopPropagation()}
                  style={{
                    position: "fixed", top: "1.5rem", left: "1.5rem", zIndex: 2001,
                    border: "2px solid rgba(255,255,255,0.55)", borderRadius: 10,
                    padding: "0.55rem 0.8rem", background: "rgba(255,255,255,0.12)",
                    color: "#fff", fontSize: "0.8rem", fontWeight: 700,
                    textDecoration: "none", backdropFilter: "blur(6px)",
                    boxShadow: "0 3px 16px rgba(0,0,0,0.45)",
                  }}
                >🔍 Open Original Image</a>
                <img
                  src={todayQuestion.imageUrl}
                  alt={todayQuestion.topic || "Picture description challenge"}
                  onClick={event => event.stopPropagation()}
                  style={{
                    maxWidth: "96vw", maxHeight: "92vh", objectFit: "contain",
                    borderRadius: 10, boxShadow: "0 12px 60px rgba(0,0,0,0.55)",
                  }}
                />
              </div>,
              document.body
            )}

            {/* Instructions */}
            <div style={{
              background: "rgba(99,179,237,0.08)", border: "1px solid rgba(99,179,237,0.25)",
              borderRadius: 12, padding: "0.85rem 1rem",
              color: "rgba(255,255,255,0.9)", fontSize: "0.9rem", lineHeight: 1.6,
            }}>
              {todayQuestion.imageInstructions || todayQuestion.question || "Describe what you see in the image."}
            </div>
            <div style={{
              background: "rgba(99,179,237,0.12)", border: "2px solid rgba(99,179,237,0.42)",
              borderRadius: 14, padding: "1rem 1.1rem", marginTop: "0.85rem",
              color: "rgba(255,255,255,0.9)", fontSize: "0.88rem", lineHeight: 1.55,
              boxShadow: "0 4px 18px rgba(66,153,225,0.12)",
            }}>
              <strong style={{ color: "#b9e3ff", fontSize: "0.95rem" }}>💬 Guiding questions — use these in your response</strong>
              <ol style={{ margin: "0.65rem 0 0", paddingLeft: "1.45rem", display: "grid", gap: "0.45rem" }}>
                {["What do you see?", "What do you think is happening?", "What is the atmosphere like?", "What do you think might happen next?"].map(question => (
                  <li key={question} style={{ paddingLeft: "0.25rem", fontWeight: 600 }}>{question}</li>
                ))}
              </ol>
            </div>
          </div>
        )}

        {/* ── Story Summary Card ── */}
        {todayQuestion && isStorySummary && (
          <div
            className="listening-practice-card"
            style={{
              borderRadius: 18,
              padding: "1.5rem",
              marginBottom: "1rem",
            }}
          >
            <div style={{ display:"flex", alignItems:"center", gap:"0.75rem", marginBottom:"1rem" }}>
              <div style={{ fontSize:"2.5rem" }}>🎧</div>
              <div>
                <div style={{ fontSize:"0.7rem", color:"rgba(94,234,212,0.85)", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em" }}>Listening Practice</div>
                <div style={{ fontSize:"1.3rem", fontWeight:800, color:"#fff", lineHeight:1.2 }}>Story Summary</div>
                <div style={{ fontSize:"0.8rem", color:"rgba(255,255,255,0.65)", marginTop:"0.2rem" }}>Listen carefully, then summarize the story in your own words.</div>
              </div>
            </div>

            {todayQuestion.topic && (
              <div style={{ fontSize:"1rem", fontWeight:700, color:"#ccfbf1", marginBottom:"0.85rem" }}>{todayQuestion.topic}</div>
            )}

            {todayQuestion.audioUrl && (
              <audio controls controlsList="nodownload nofullscreen noremoteplayback" onContextMenu={e => e.preventDefault()} src={todayQuestion.audioUrl} style={{ width:"100%", marginBottom:"1rem" }} />
            )}

            <div style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(45,212,191,0.25)", borderRadius:12, padding:"0.85rem 1rem", color:"rgba(255,255,255,0.9)", fontSize:"0.9rem", lineHeight:1.5 }}>
              {todayQuestion.question || "Listen to the story audio and record a short video summary in your own words."}
            </div>
          </div>
        )}

        {/* ── Today's Question Card — regular days only ── */}
        {todayQuestion && !isMonthlyReflection && !isMonthlyGoals && !isStorySummary && !isPictureDescription && (
          <div className="daily-poster" style={{ marginBottom: "1rem" }}>
            <div className="daily-poster-header">
              <div className="daily-poster-brand">✦ Speak &amp; Shine</div>
              <div className="daily-poster-sub">DAILY SPEAKING CHALLENGE</div>
              {todayQuestion.category && (
                <div className="daily-poster-badge">{todayQuestion.category}</div>
              )}
            </div>

            {todayQuestion.topic && (
              <div className="daily-poster-topic-wrap">
                <div className="daily-poster-section-label">TOPIC</div>
                <div className="daily-poster-topic">"{todayQuestion.topic}"</div>
              </div>
            )}

            <div className="daily-poster-question-wrap">
              <div className="daily-poster-section-label">❓ QUESTION</div>
              <div className="daily-poster-question">{todayQuestion.question}</div>
            </div>

            {/* Vocabulary words */}
            {todayVocabulary.length > 0 && (
              <VocabularyWords
                words={todayVocabulary}
                requiredCount={vocabRequiredCount}
                totalCount={vocabWordCount}
                isPictureDescription={isPictureDescription}
              />
            )}
          </div>
        )}

        {/* Mode switcher */}
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
          <button
            className={`tab-btn${mode === "record" ? " active" : ""}`}
            onClick={() => {
              setMode("record");
              navigate("/record");
            }}
          >🎥 Record Now</button>
          <button
            className={`tab-btn${mode === "upload" ? " active" : ""}`}
            onClick={() => {
              setMode("upload");
              navigate("/video-analysis");
            }}
          >📁 Upload Video</button>
        </div>

        {mode === "upload"
          ? <UploadCard onAnalysisStarted={onAnalysisStarted} isMonthlyReflection={isMonthlyReflection} isMonthlyGoals={isMonthlyGoals} isStorySummary={isStorySummary} isPictureDescription={isPictureDescription} vocabulary={todayVocabulary} vocabRequiredCount={vocabRequiredCount} vocabWordCount={vocabWordCount} isGuest={isGuest} durationLimits={durationLimits} allowPrivateVideos={allowPrivateVideos} />
          : <RecordCard  onAnalysisStarted={onAnalysisStarted} question={todayQuestion} isMonthlyReflection={isMonthlyReflection} isMonthlyGoals={isMonthlyGoals} isStorySummary={isStorySummary} isPictureDescription={isPictureDescription} vocabulary={todayVocabulary} vocabRequiredCount={vocabRequiredCount} vocabWordCount={vocabWordCount} isGuest={isGuest} durationLimits={durationLimits} allowPrivateVideos={allowPrivateVideos} />
        }

        {/* Report Section */}
        {report && (
          <div id="report-section" className="card" style={{ marginTop: "1rem" }}>
            <div className="section-title">
              {report.status === "loading"    && "⏳ Loading…"}
              {report.status === "processing" && "⏳ Analysing your video…"}
              {report.status === "completed"  && "✅ Analysis Complete"}
              {report.status === "failed"     && "❌ Analysis Failed"}
            </div>
            {report.status !== "loading" && report.status !== "failed" && (
              <div style={{
                margin: "1.25rem 0",
                padding: "0.85rem 1rem",
                borderRadius: 12,
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid var(--border2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "0.5rem"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <span style={{ fontSize: "1.2rem" }}>{report.isPublic ? "🌐" : "🔒"}</span>
                  <div>
                    <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--text)" }}>
                      Video is {report.isPublic ? "Public" : "Private"}
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
                      {report.isPublic 
                        ? "Visible to other users in the Community Feed." 
                        : "Only you and the admin can see this video."}
                    </div>
                  </div>
                </div>
                {/* Toggle switch */}
                <div
                  onClick={() => toggleReportVisibility(reportId || report._id || report.reportId)}
                  aria-disabled={visibilityUpdating}
                  style={{
                    display: "flex", alignItems: "center", gap: "0.6rem",
                    cursor: visibilityUpdating ? "wait" : "pointer", userSelect: "none",
                    pointerEvents: visibilityUpdating ? "none" : "auto",
                    opacity: visibilityUpdating ? 0.65 : 1,
                    background: report.isPublic ? "rgba(74,222,128,0.07)" : "rgba(248,113,113,0.07)",
                    border: `1px solid ${report.isPublic ? "rgba(74,222,128,0.25)" : "rgba(248,113,113,0.25)"}`,
                    borderRadius: 12, padding: "0.5rem 0.85rem",
                    transition: "all 0.2s",
                  }}
                >
                  <div style={{
                    width: 40, height: 22, borderRadius: 99, flexShrink: 0,
                    background: report.isPublic ? "rgba(74,222,128,0.3)" : "rgba(248,113,113,0.3)",
                    border: `1px solid ${report.isPublic ? "rgba(74,222,128,0.5)" : "rgba(248,113,113,0.5)"}`,
                    position: "relative", transition: "all 0.2s",
                  }}>
                    <div style={{
                      width: 16, height: 16, borderRadius: "50%",
                      background: report.isPublic ? "#4ade80" : "#f87171",
                      position: "absolute", top: 2,
                      left: report.isPublic ? 20 : 2,
                      transition: "left 0.2s, background 0.2s",
                      boxShadow: `0 0 6px ${report.isPublic ? "rgba(74,222,128,0.6)" : "rgba(248,113,113,0.6)"}`,
                    }} />
                  </div>
                  <span style={{ fontSize: "0.82rem", fontWeight: 600, color: report.isPublic ? "#4ade80" : "#f87171", whiteSpace: "nowrap" }}>
                    {report.isPublic ? "Public" : "Private"}
                  </span>
                </div>
              </div>
            )}
            {(report.status === "loading" || report.status === "processing") && (
              <ProcessingProgress
                stage={progressStage}
                stageKey={progressStageKey}
                completedSteps={completedSteps}
                percent={progressPercent}
                queueInfo={queueInfo}
                isLoading={report.status === "loading"}
              />
            )}
            {report.status === "failed" && (
              <div className="error-box">
                <p>{report.errorMessage || "Analysis failed. Please try again."}</p>
                <button 
                  className="btn-primary" 
                  style={{ marginTop: "1rem" }}
                  onClick={async () => {
                    try {
                      setReport({ status: "processing" });
                      setProgressStage("Retrying analysis…");
                      setProgressStageKey("queue");
                      setCompletedSteps([]);
                      setProgressPercent(10);
                      await api.post(`/video/retry/${reportId}`);
                      // Will be updated via SSE
                    } catch (err) {
                      setReport({ 
                        status: "failed", 
                        errorMessage: err.response?.data?.error || "Retry failed" 
                      });
                    }
                  }}
                >
                  🔄 Retry Analysis
                </button>
              </div>
            )}
            {report.status === "completed" && report.analysis && (
              <ReportView 
                reportId={reportId || report._id || report.reportId}
                analysis={{
                  ...report.analysis,
                  challengeType: report.analysis?.challengeType
                    || report.challengeType,
                }}
                expiresAt={report.expiresAt} 
                formatTimeRemaining={formatTimeRemaining} 
                videoUrl={report.videoUrl}
                onReEvaluated={(newAnalysis) => {
                  setReport((prev) => ({
                    ...prev,
                    analysis: newAnalysis,
                  }));
                }}
              />
            )}
          </div>
        )}

        {/* Recent Reports */}
        {myReports.length > 0 && (
          <div className="card" style={{ marginTop: "1rem" }}>
            <div className="section-title">📋 Recent Reports (Last 18 Hours)</div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr><th>Submitted</th><th>File</th><th>Status</th><th>Expires</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {myReports.map((r) => (
                    <tr key={r._id}>
                      <td style={{ color: "var(--muted)" }}>
                        {new Date(r.submittedAt).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td>{r.videoFileName} {r.isPublic ? "🌐" : "🔒"}</td>
                      <td>
                        {r.status === "processing" && "⏳ Processing"}
                        {r.status === "completed"  && "✅ Ready"}
                        {r.status === "failed"     && "❌ Failed"}
                      </td>
                      <td style={{ color: "var(--muted)", fontSize: "0.9rem" }}>{formatTimeRemaining(r.expiresAt)}</td>
                      <td>
                        {r.status === "completed" && (
                          <button className="btn-secondary" onClick={() => viewReport(r._id)}
                            style={{ marginRight: "0.5rem" }}>View</button>
                        )}
                        {r.status === "failed" && (
                          <button 
                            className="btn-primary" 
                            onClick={async () => {
                              try {
                                // Optimistically update UI
                                setMyReports(prev => prev.map(report => 
                                  report._id === r._id 
                                    ? { ...report, status: "processing" }
                                    : report
                                ));
                                
                                await api.post(`/video/retry/${r._id}`);
                                
                                // Load fresh data and view the report
                                await loadMyReports();
                                viewReport(r._id);
                              } catch (err) {
                                // Revert on error
                                loadMyReports();
                                setModal({ 
                                  type: "alert", 
                                  title: "Error", 
                                  message: err.response?.data?.error || "Retry failed", 
                                  confirmText: "OK", 
                                  onConfirm: () => setModal(null) 
                                });
                              }
                            }}
                            style={{ marginRight: "0.5rem" }}
                          >
                            🔄 Retry
                          </button>
                        )}
                        <button className="btn-danger" onClick={() => deleteReport(r._id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

// ── Processing Progress Component ────────────────────────────────────────────
// Maps SSE stage strings to ordered pipeline steps with icons and labels.

const PIPELINE_STEPS = [
  { key: "download",   icon: "⬇️", label: "Downloading video" },
  { key: "virus",      icon: "🔍", label: "Virus scan" },
  { key: "codec",      icon: "🎬", label: "Codec validation" },
  { key: "moderation", icon: "🛡️", label: "Content safety check" },
  { key: "queue",      icon: "⏳", label: "Queued for AI" },
  { key: "audio",      icon: "🎵", label: "Extracting audio" },
  { key: "visual",     icon: "🎥", label: "Analysing video" },
  { key: "speech",     icon: "🗣️", label: "Scoring speech" },
  { key: "feedback",   icon: "📝", label: "Generating feedback" },
];

function ProcessingProgress({ stage, stageKey, completedSteps = [], percent = 0, queueInfo, isLoading }) {
  const completedSet = new Set(completedSteps);
  const activeIdx = stageKey
    ? PIPELINE_STEPS.findIndex((s) => s.key === stageKey)
    : -1;

  if (isLoading) {
    return (
      <div className="spinner-wrap">
        <div className="spinner" />
        <p style={{ color: "var(--muted)", marginTop: "0.75rem" }}>Loading report…</p>
      </div>
    );
  }

  if (queueInfo && queueInfo.position > 1) {
    return (
      <div style={{ padding: "1.5rem 0", textAlign: "center" }}>
        <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>🚦</div>
        <p style={{ color: "var(--warning)", fontWeight: 700, fontSize: "1.1rem", marginBottom: "0.25rem" }}>
          Position #{queueInfo.position} in queue
        </p>
        <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
          ~{queueInfo.estimatedWait} min estimated wait
        </p>
      </div>
    );
  }

  const pct = Math.min(100, Math.max(0, percent || 0));

  return (
    <div style={{ padding: "1rem 0" }}>
      {/* Overall progress bar */}
      <div style={{ marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.35rem", fontSize: "0.8rem" }}>
          <span style={{ color: "var(--muted)" }}>Overall progress</span>
          <span style={{ color: "var(--primary)", fontWeight: 700 }}>{pct}%</span>
        </div>
        <div style={{
          height: 8, borderRadius: 999, background: "var(--bg2)", overflow: "hidden",
          border: "1px solid var(--border)",
        }}>
          <div style={{
            height: "100%", width: `${pct}%`,
            background: "linear-gradient(90deg, var(--primary), #a78bfa)",
            transition: "width 0.45s ease",
            borderRadius: 999,
          }} />
        </div>
      </div>

      {/* Spinner + current stage label */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.25rem" }}>
        <div className="spinner" style={{ flexShrink: 0 }} />
        <span style={{ color: "var(--text)", fontWeight: 600, fontSize: "0.95rem" }}>
          {stage || "Starting…"}
        </span>
      </div>

      {/* Step pipeline */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {PIPELINE_STEPS.map((step, i) => {
          const isActive  = stageKey === step.key;
          const isDone    = completedSet.has(step.key) && !isActive;
          const isPending = !isDone && !isActive;
          return (
            <div key={step.key} style={{
              display: "flex", alignItems: "center", gap: "0.75rem",
              padding: "0.5rem 0.75rem", borderRadius: 10,
              background: isActive  ? "rgba(99,102,241,0.12)"
                        : isDone    ? "rgba(34,197,94,0.08)"
                        : "transparent",
              border: isActive  ? "1px solid rgba(99,102,241,0.3)"
                    : isDone    ? "1px solid rgba(34,197,94,0.2)"
                    : "1px solid transparent",
              transition: "all 0.3s ease",
              opacity: isPending ? 0.4 : 1,
            }}>
              {/* Status icon */}
              <span style={{ fontSize: "1rem", minWidth: "1.25rem", textAlign: "center" }}>
                {isDone   ? "✅"
               : isActive ? step.icon
               : "○"}
              </span>
              <span style={{
                fontSize: "0.85rem",
                fontWeight: isActive ? 700 : 400,
                color: isActive ? "var(--text)" : isDone ? "var(--success)" : "var(--muted)",
              }}>
                {step.label}
              </span>
              {isActive && (
                <span style={{
                  marginLeft: "auto", fontSize: "0.72rem",
                  color: "var(--primary)", fontWeight: 600,
                  animation: "pulse 1.5s infinite",
                }}>
                  IN PROGRESS
                </span>
              )}
            </div>
          );
        })}
      </div>

      <p style={{ color: "var(--muted)", fontSize: "0.8rem", marginTop: "1rem", textAlign: "center" }}>
        Usually takes 2–3 minutes · Don't close this tab
      </p>

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}

// ── Client-side video compression ────────────────────────────────────────────
// Only compress when the file exceeds the server's hard 110 MB limit.
// Compression plays the video in real-time (canvas → MediaRecorder), so
// a 7-min video takes ~7 min. We only trigger it as a last resort.
const COMPRESS_THRESHOLD = 500 * 1024 * 1024; // 500 MB - effectively disable compression
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB hard limit

// True when the browser can re-encode large files before upload (canvas + MediaRecorder).
const CAN_COMPRESS =
  typeof MediaRecorder !== "undefined" &&
  typeof HTMLCanvasElement !== "undefined" &&
  typeof HTMLCanvasElement.prototype.captureStream === "function";

function readVideoBlobDuration(blob) {
  return new Promise((resolve) => {
    if (!blob || blob.size <= 0) {
      resolve(null);
      return;
    }

    const video = document.createElement("video");
    const url = URL.createObjectURL(blob);
    let settled = false;
    let fallbackTimer = null;

    const finish = (duration) => {
      if (settled) return;
      settled = true;
      clearTimeout(fallbackTimer);
      URL.revokeObjectURL(url);
      const rounded = isFinite(duration) && duration > 0 ? Math.round(duration) : null;
      resolve(rounded);
    };

    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.onerror = () => finish(null);
    fallbackTimer = setTimeout(() => finish(null), 8000);

    video.onloadedmetadata = () => {
      if (isFinite(video.duration) && video.duration > 0) {
        finish(video.duration);
        return;
      }

      // Some MediaRecorder WebM blobs report Infinity/NaN until the browser seeks.
      video.ontimeupdate = () => {
        if (isFinite(video.duration) && video.duration > 0) {
          finish(video.duration);
        }
      };
      try {
        video.currentTime = 1e6;
      } catch {}
    };

    video.src = url;
  });
}

function compressVideo(file, onProgress) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.playsInline = true;
    video.muted = false; // IMPORTANT: Don't mute - we need audio for compression!
    const blobUrl = URL.createObjectURL(file);
    video.src = blobUrl;

    let hardTimeout = setTimeout(() => {
      cleanup();
      reject(new Error("Compression timed out — uploading original"));
    }, 5 * 60 * 1000);

    const cleanup = () => {
      if (hardTimeout) clearTimeout(hardTimeout);
      URL.revokeObjectURL(blobUrl);
      // Force cleanup of canvas/context to free memory
      if (canvas) {
        canvas.width = canvas.height = 0;
        canvas = null;
      }
      if (ctx) ctx = null;
      if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
    };
    video.onerror = () => { cleanup(); reject(new Error("Failed to load video for compression")); };

    let canvas, ctx; // Declare outside for cleanup

    video.onloadedmetadata = () => {
      const duration = video.duration;
      if (!duration || !isFinite(duration)) { cleanup(); reject(new Error("Unknown duration")); return; }

      // Timeout: Original duration + 2 minutes buffer
      // (We compress at 1× speed now, so a 5-min video takes ~5 min to compress)
      clearTimeout(hardTimeout);
      const timeoutMs = Math.max(3 * 60 * 1000, (duration + 120) * 1000);
      hardTimeout = setTimeout(() => {
        cleanup();
        reject(new Error("Compression timed out — uploading original"));
      }, timeoutMs);

      // Scale to max 720p (reduce memory usage)
      let w = video.videoWidth, h = video.videoHeight;
      const maxDim = 720;
      if (Math.max(w, h) > maxDim) {
        const scale = maxDim / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      w += w % 2; h += h % 2; // even dimensions

      canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      ctx = canvas.getContext("2d", {
        alpha: false, // Disable alpha channel to save memory
        willReadFrequently: false,
        desynchronized: true, // Better performance
      });
      const canvasStream = canvas.captureStream(24);

      // Capture audio via Web Audio API
      // Route audio through Web Audio without playing to speakers
      let audioCtx;
      let audioConnected = false;
      try {
        audioCtx = new AudioContext();
        const src = audioCtx.createMediaElementSource(video);
        const dest = audioCtx.createMediaStreamDestination();
        src.connect(dest);
        // DON'T connect src to audioCtx.destination (speakers) - keeps it silent
        dest.stream.getAudioTracks().forEach(t => {
          canvasStream.addTrack(t);
          console.log(`[Compress] Audio track added: ${t.label || 'unlabeled'}`);
        });
        audioConnected = dest.stream.getAudioTracks().length > 0;
        console.log(`[Compress] Audio ${audioConnected ? 'captured' : 'NOT captured'}`);
      } catch (e) {
        console.warn("[Compress] Audio capture failed:", e.message);
      }

      // Target bitrate: aim for ~80-100MB output (raised from 40MB)
      // Video bitrate: adjusted based on duration
      // Audio bitrate: 96kbps for good speech quality (don't let it auto-compress to silence)
      const targetVideoBitrate = Math.min(1500000, Math.floor((90 * 8 * 1024 * 1024) / duration));
      const targetAudioBitrate = 96000; // 96 kbps - good quality for speech
      
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
        ? "video/webm;codecs=vp8,opus" : "video/webm";

      const recorder = new MediaRecorder(canvasStream, { 
        mimeType, 
        videoBitsPerSecond: targetVideoBitrate,
        audioBitsPerSecond: targetAudioBitrate, // Explicit audio bitrate to preserve speech
        // Request smaller chunk size to reduce memory buffering
      });
      const chunks = [];
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      recorder.onstop = () => {
        cleanup();
        if (audioCtx) audioCtx.close().catch(() => {});
        const blob = new Blob(chunks, { type: "video/webm" });
        console.log(`[Compress] Done: ${(file.size/1024/1024).toFixed(1)}MB → ${(blob.size/1024/1024).toFixed(1)}MB`);
        resolve(blob);
      };
      recorder.onerror = (err) => { 
        console.error("[Compress] Recording error:", err); 
        cleanup(); 
        reject(new Error("Compression recording failed")); 
      };

      // Start recording + playback at NORMAL speed
      // We record at 1× speed to preserve original duration and audio pitch
      // (The compression happens from bitrate reduction, not time compression)
      recorder.start(100);
      
      video.play().catch(e => {
        // Autoplay blocked — skip compression, upload original
        recorder.stop();
        cleanup();
        reject(new Error("Autoplay blocked: " + e.message));
      });

      let lastFrameTime = 0;
      const draw = () => {
        if (video.ended || video.paused) return;
        
        // Throttle drawing to ~24fps to reduce CPU/memory pressure
        const now = performance.now();
        if (now - lastFrameTime < 42) {
          requestAnimationFrame(draw);
          return;
        }
        lastFrameTime = now;
        
        ctx.drawImage(video, 0, 0, w, h);
        if (onProgress) onProgress(Math.min(video.currentTime / duration, 0.99));
        requestAnimationFrame(draw);
      };
      video.onplay = draw;
      video.onended = () => { recorder.stop(); if (onProgress) onProgress(1); };
    };
  });
}

// ── Mobile-friendly camera (avoids 2–3× digital zoom / tight face crop) ───────
function isMobileRecordingDevice() {
  if (typeof navigator === "undefined") return false;
  return /Android|webOS|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 0 && window.matchMedia("(max-width: 768px)").matches);
}

async function resetCameraZoom(videoTrack) {
  if (!videoTrack?.getCapabilities) return;
  try {
    const caps = videoTrack.getCapabilities();
    if (caps.zoom == null) return;
    const zoom = typeof caps.zoom === "object" ? (caps.zoom.min ?? 1) : 1;
    await videoTrack.applyConstraints({ advanced: [{ zoom }] });
  } catch {
    try { await videoTrack.applyConstraints({ zoom: 1 }); } catch { /* unsupported */ }
  }
}

function buildRecordingMediaConstraints(camId, micId) {
  const isMobile = isMobileRecordingDevice();
  // Use 'exact' for deviceId to enforce the selected device, not 'ideal'
  const videoBase = camId ? { deviceId: { exact: camId } } : { facingMode: "user" };

  const video = isMobile
    ? {
        ...videoBase,
        resizeMode: { ideal: "none" },
        frameRate: { ideal: 24, max: 30 },
        width: { max: 1280 },
        height: { max: 1280 },
      }
    : {
        ...videoBase,
        resizeMode: { ideal: "none" },
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1080 },
        aspectRatio: { ideal: 16 / 9 },
        frameRate: { ideal: 30, max: 30 },
      };

  return {
    video,
    audio: {
      // Use 'exact' for deviceId to enforce the selected device, not 'ideal'
      ...(micId ? { deviceId: { exact: micId } } : {}),
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: 48000,
      channelCount: 1,
    },
  };
}

async function openRecordingStream(camId, micId) {
  console.log(`[DeviceSelection] Opening stream with camId="${camId}", micId="${micId}"`);
  const full = buildRecordingMediaConstraints(camId, micId);
  console.log('[DeviceSelection] Built constraints:', JSON.stringify(full, null, 2));
  try {
    const stream = await navigator.mediaDevices.getUserMedia(full);
    const track = stream.getVideoTracks()[0];
    if (track) {
      const settings = track.getSettings();
      console.log(`[DeviceSelection] ✓ Video track using deviceId: "${settings.deviceId}", label: "${track.label}"`);
      await resetCameraZoom(track);
    }
    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      const audioSettings = audioTrack.getSettings();
      console.log(`[DeviceSelection] ✓ Audio track using deviceId: "${audioSettings.deviceId}", label: "${audioTrack.label}"`);
    }
    return stream;
  } catch (err) {
    console.warn('[DeviceSelection] Primary constraints failed, trying fallback:', err.message);
    // Fallback: use 'exact' deviceId if specified, otherwise use facingMode
    const stream = await navigator.mediaDevices.getUserMedia({
      video: camId ? { deviceId: { exact: camId }, facingMode: "user" } : { facingMode: "user" },
      audio: full.audio,
    });
    const track = stream.getVideoTracks()[0];
    if (track) {
      const settings = track.getSettings();
      console.log(`[DeviceSelection] ✓ Fallback video track using deviceId: "${settings.deviceId}", label: "${track.label}"`);
      await resetCameraZoom(track);
    }
    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      const audioSettings = audioTrack.getSettings();
      console.log(`[DeviceSelection] ✓ Fallback audio track using deviceId: "${audioSettings.deviceId}", label: "${audioTrack.label}"`);
    }
    return stream;
  }
}

function SubmitGatePanel({ gate }) {
  if (!gate?.checks?.length) return null;
  const icon = { pass: "✅", warn: "⚠️", fail: "❌" };
  const color = { pass: "var(--success)", warn: "var(--warning)", fail: "var(--danger)" };
  return (
    <div style={{
      marginBottom: "1rem",
      padding: "0.85rem 1rem",
      borderRadius: 12,
      border: `1px solid ${gate.passed ? "rgba(74,222,128,0.35)" : "rgba(248,113,113,0.4)"}`,
      background: gate.passed ? "rgba(74,222,128,0.06)" : "rgba(248,113,113,0.08)",
    }}>
      <div style={{ fontWeight: 700, fontSize: "0.82rem", marginBottom: "0.5rem", color: "var(--text)" }}>
        {gate.passed ? "✓ Ready to submit" : "✗ Fix these before submitting"}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
        {gate.checks.map((c) => (
          <div key={c.id} style={{ display: "flex", gap: "0.5rem", fontSize: "0.8rem", alignItems: "flex-start" }}>
            <span style={{ flexShrink: 0 }}>{icon[c.status]}</span>
            <span>
              <strong style={{ color: color[c.status] }}>{c.label}:</strong>{" "}
              <span style={{ color: "var(--muted)" }}>{c.message}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Vocabulary Words Component ───────────────────────────────────────────────
// compact=true → chips only (used during active recording)
// compact=false (default) → full card with word + meaning + example
function VocabularyWords({ words, compact = false, requiredCount, totalCount, isPictureDescription = false }) {
  if (!words || words.length === 0) return null;
  const required = requiredCount ?? 3;
  const total = totalCount ?? words.length;
  const maxPts = isPictureDescription ? 10 : 30;
  const hint = total > required
    ? `Use at least ${required} of today's ${total} vocabulary words in your video!`
    : "Try to use these words in your video today!";
  const fullHint = total > required
    ? `Use at least ${required} of today's ${total} vocabulary words naturally in your speaking video!`
    : "Try to use these words naturally in your speaking video today!";

  const [speakingIndex, setSpeakingIndex] = useState(null);
  const [ttsWarning, setTtsWarning] = useState(null);
  const audioFallbackRef = useRef(null);

  const parseVocabItem = (item) => {
    if (!item) return { word: "", meaning: "", example: "" };
    if (typeof item === "string") {
      const parts = item.split(/\s*[-—:]\s*/);
      if (parts.length >= 2) {
        return {
          word: parts[0].trim(),
          meaning: parts.slice(1).join(" — ").trim(),
          example: "",
        };
      }
      return { word: item.trim(), meaning: "", example: "" };
    }
    const word = item.word || item.Word || item.term || item.name || "";
    const meaning = item.meaning || item.Meaning || item.definition || item.desc || "";
    const example = item.example || item.Example || item.sentence || "";
    return { word, meaning, example };
  };

  const handleSpeak = (rawWord, rawMeaning, rawExample, idx) => {
    if (!rawWord) return;
    const wordClean = (rawWord || "").trim();
    const meaningClean = (rawMeaning || "").trim();
    const exampleClean = (rawExample || "").trim();

    // Construct full spoken narrative
    let textToSpeak = wordClean;
    if (meaningClean) {
      textToSpeak += `. ${meaningClean}`;
    }
    if (exampleClean) {
      textToSpeak += `. For example: ${exampleClean}`;
    }

    setSpeakingIndex(idx);

    // Stop any previous playing audio
    if (audioFallbackRef.current) {
      audioFallbackRef.current.pause();
      audioFallbackRef.current = null;
    }

    // Dynamic safety timer proportional to text length
    const expectedDurationMs = Math.max(6000, Math.min(30000, textToSpeak.length * 90));
    const safetyTimer = setTimeout(() => {
      setSpeakingIndex(prev => prev === idx ? null : prev);
    }, expectedDurationMs);

    // 1. Primary: Server-side audio stream from /api/video/tts (100% reliable MP3 stream)
    const audioUrl = `/api/video/tts?text=${encodeURIComponent(textToSpeak)}`;
    const audio = new Audio(audioUrl);
    audioFallbackRef.current = audio;

    audio.onended = () => {
      clearTimeout(safetyTimer);
      setSpeakingIndex(null);
    };

    audio.onerror = () => {
      // 2. Secondary: Native Web Speech API fallback
      if ('speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
          window.speechSynthesis.resume();
          const utterance = new SpeechSynthesisUtterance(textToSpeak);
          utterance.rate = 0.88;
          utterance.lang = 'en-US';
          window._activeSpeechUtterance = utterance;
          utterance.onend = () => {
            clearTimeout(safetyTimer);
            setSpeakingIndex(null);
          };
          utterance.onerror = () => {
            clearTimeout(safetyTimer);
            setSpeakingIndex(null);
          };
          window.speechSynthesis.speak(utterance);
          return;
        } catch {}
      }
      clearTimeout(safetyTimer);
      setSpeakingIndex(null);
    };

    audio.play().catch(() => {
      if ('speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
          window.speechSynthesis.resume();
          const utterance = new SpeechSynthesisUtterance(textToSpeak);
          utterance.rate = 0.88;
          utterance.lang = 'en-US';
          utterance.onend = () => {
            clearTimeout(safetyTimer);
            setSpeakingIndex(null);
          };
          utterance.onerror = () => {
            clearTimeout(safetyTimer);
            setSpeakingIndex(null);
          };
          window.speechSynthesis.speak(utterance);
          return;
        } catch {}
      }
      clearTimeout(safetyTimer);
      setSpeakingIndex(null);
    });
  };

  if (compact) {
    return (
      <div style={{
        marginTop: "1rem",
        marginBottom: "0.5rem",
        background: "rgba(124,111,255,0.07)",
        border: "1px solid rgba(124,111,255,0.25)",
        borderRadius: 14,
        padding: "0.85rem 1rem",
      }}>
        <div style={{
          fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase",
          letterSpacing: "0.1em", color: "rgba(124,111,255,0.9)", marginBottom: "0.65rem",
        }}>
          📚 TODAY'S VOCABULARY CHALLENGE
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          {words.map((rawItem, i) => {
            const w = parseVocabItem(rawItem);
            return (
              <span key={i} style={{
                background: "rgba(124,111,255,0.18)",
                border: "1px solid rgba(124,111,255,0.35)",
                borderRadius: 20,
                padding: "0.3rem 0.85rem",
                fontSize: "0.88rem",
                fontWeight: 700,
                color: "#c4b5fd",
                letterSpacing: "0.02em",
              }}>
                {w.word}
              </span>
            );
          })}
        </div>
        <div style={{ marginTop: "0.6rem", fontSize: "0.72rem", color: "rgba(255,255,255,0.35)" }}>
          ✨ {hint}
        </div>
      </div>
    );
  }

  // Full card — word + meaning + example
  return (
    <div className="vocab-container-pro" style={{ marginTop: "1rem", marginBottom: "0.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.85rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "1.1rem" }}>📚</span>
          <span style={{
            fontSize: "0.74rem", fontWeight: 800, textTransform: "uppercase",
            letterSpacing: "0.1em", color: "#c4b5fd",
          }}>
            Today's Vocabulary Challenge
          </span>
        </div>
        <div style={{
          fontSize: "0.72rem", fontWeight: 700,
          background: "rgba(124, 111, 255, 0.15)",
          border: "1px solid rgba(124, 111, 255, 0.3)",
          color: "#c4b5fd",
          padding: "2px 8px", borderRadius: 99,
        }}>
          🎯 Goal: {required} / {total} words (+{maxPts} pts)
        </div>
      </div>

      {speakingIndex !== null && (
        <div style={{
          marginBottom: "0.65rem", padding: "0.45rem 0.85rem", borderRadius: 8,
          background: "rgba(124, 111, 255, 0.15)", border: "1px solid rgba(124, 111, 255, 0.4)",
          color: "#c4b5fd", fontSize: "0.75rem", fontWeight: 700,
          display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.4rem",
        }}>
          <span>🔊 Playing audio pronunciation...</span>
          <span style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.7)", fontWeight: 500 }}>
            (If silent, check that your browser tab/site sound is un-muted)
          </span>
        </div>
      )}

      {ttsWarning && (
        <div style={{
          marginBottom: "0.65rem", padding: "0.4rem 0.75rem", borderRadius: 8,
          background: "rgba(251, 191, 36, 0.12)", border: "1px solid rgba(251, 191, 36, 0.35)",
          color: "#fbbf24", fontSize: "0.74rem", fontWeight: 600,
        }}>
          ℹ️ {ttsWarning}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
        {words.map((rawItem, i) => {
          const w = parseVocabItem(rawItem);
          const isSpeaking = speakingIndex === i;
          return (
            <div key={i} className="vocab-card-pro">
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.75rem" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.2rem" }}>
                    <div className="vocab-num-badge">0{i + 1}</div>
                    <span className="vocab-word-title" style={{ color: "#ffffff", fontWeight: 800, fontSize: "0.98rem" }}>
                      {w.word}
                    </span>
                    {w.meaning && (
                      <span style={{ fontSize: "0.8rem", color: "#cbd5e1", fontWeight: 500, lineHeight: 1.4 }}>
                        — {w.meaning}
                      </span>
                    )}
                  </div>

                  {w.example && (
                    <div className="vocab-example-bubble">
                      💬 <span style={{ fontStyle: "italic" }}>"{w.example}"</span>
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", flexShrink: 0, marginTop: "2px" }}>
                  <button
                    type="button"
                    onClick={() => handleSpeak(w.word, w.meaning, w.example, i)}
                    className="vocab-listen-btn"
                    title="Listen to full pronunciation and example sentence"
                    style={isSpeaking ? { background: "#7c6fff", color: "#fff", transform: "scale(1.15)" } : {}}
                  >
                    {isSpeaking ? "🔊" : "🔈"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: "0.85rem", fontSize: "0.74rem", color: "rgba(255, 255, 255, 0.65)" }}>
        ✨ {fullHint}
      </div>
    </div>
  );
}

// ── Upload Card (direct-to-R2 flow) ─────────────────────────────────────────
function UploadCard({ onAnalysisStarted, isMonthlyReflection, isMonthlyGoals, isStorySummary, isPictureDescription = false, vocabulary = [], vocabRequiredCount = 3, vocabWordCount = 5, isGuest = false, durationLimits: dbDurationLimits, allowPrivateVideos = true }) {
  const [file, setFile]           = useState(null);
  const [fileDuration, setFileDuration] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress]   = useState(0);
  const [stage, setStage]         = useState(""); // "hashing" | "uploading" | "confirming"
  const [error, setError]         = useState(null);
  const [uploadSpeed, setUploadSpeed] = useState(null); // MB/s
  const [uploadEta, setUploadEta]     = useState(null); // seconds
  const [compressProgress, setCompressProgress] = useState(0);
  const [isPublic, setIsPublic]   = useState(true);
  const uploadStartRef = useRef(null);
  const { generateHashAndFrames, cacheResult, isHashing, hashProgress } = useVideoFrameHash();

  const gateFlags = { isMonthlyReflection, isMonthlyGoals, isStorySummary, isPictureDescription };
  const durationLimits = dbDurationLimits || getDurationLimits(gateFlags);

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 500 * 1024 * 1024) { setError("File size must be less than 500MB."); return; }
    setFile(f);
    setFileDuration(null);
    readVideoBlobDuration(f).then(setFileDuration);
  };

  const uploadGate = file
    ? evaluateSubmitGate({ durationSeconds: fileDuration, fileSizeBytes: file.size, flags: gateFlags, canCompress: CAN_COMPRESS, customLimits: durationLimits })
    : null;

  const handleUpload = async () => {
    if (!file) { setError("Please select a video file"); return; }
    const gate = evaluateSubmitGate({ durationSeconds: fileDuration, fileSizeBytes: file.size, flags: gateFlags, canCompress: CAN_COMPRESS, customLimits: durationLimits });
    if (!gate.passed) {
      setError(gate.checks.find((c) => c.status === "fail")?.message || "Video does not meet requirements.");
      return;
    }
    setUploading(true); setProgress(0); setError(null);

    try {
      let fileToUpload = file;
      let originalDuration = fileDuration; // Capture duration before compression

      // ── Compress large files in the browser ──
      // Only attempt compression if file exceeds threshold and browser supports it
      if (file.size > COMPRESS_THRESHOLD && CAN_COMPRESS) {
        setStage("compressing");
        setCompressProgress(0);
        
        // Read duration from original file BEFORE compressing (compressed WebM may have wrong metadata)
        if (!originalDuration) {
          console.log('[Upload] Reading duration from original file before compression...');
          originalDuration = await readVideoBlobDuration(file);
          if (originalDuration) {
            setFileDuration(originalDuration);
            console.log(`[Upload] Original duration: ${originalDuration}s`);
          }
        }
        
        try {
          console.log(`[Upload] File ${(file.size/1024/1024).toFixed(1)}MB exceeds ${(COMPRESS_THRESHOLD/1024/1024).toFixed(0)}MB threshold - compressing...`);
          const compressed = await compressVideo(file, (p) => setCompressProgress(Math.round(p * 100)));
          const ext = file.name.replace(/\.[^.]+$/, ".webm");
          fileToUpload = new File([compressed], ext, { type: "video/webm" });
          console.log(`[Upload] ✅ Compressed ${(file.size/1024/1024).toFixed(1)}MB → ${(fileToUpload.size/1024/1024).toFixed(1)}MB`);
        } catch (compErr) {
          console.warn("[Upload] ⚠️ Compression failed, uploading original file:", compErr.message);
          setError(null); // Clear any error display
          setStage(""); // Reset stage
          setCompressProgress(0);
          fileToUpload = file;
          
          // If original file is too large and compression failed, show clear error
          if (file.size > 200 * 1024 * 1024) {
            setUploading(false);
            setError(`Video compression failed (browser memory limit). Your file is ${(file.size/1024/1024).toFixed(1)}MB (max 200MB without compression). Please:\n• Record a shorter video (max ${isMonthlyReflection ? "7" : isMonthlyGoals ? "10" : isStorySummary || isPictureDescription ? "3" : "5"} min)\n• Or use a lower resolution when recording`);
            return;
          }
        }
      }

      // Server accepts files up to 200 MB
      if (fileToUpload.size > 200 * 1024 * 1024) {
        setUploading(false);
        setStage("");
        setError(`File is ${(fileToUpload.size / 1024 / 1024).toFixed(1)}MB (max 200MB). Please record a shorter or lower-resolution video.`);
        return;
      }

      // ── Kick off frame extraction + presigned URL fetch in parallel ──
      // Frame extraction runs in the background while we start uploading.
      setStage("hashing");
      let videoHash = null;
      let frames = null;
      let cachedResult = null;

      const framePromise = Promise.race([
        generateHashAndFrames(file),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Frame extraction timeout")), 12000))
      ]).then(result => {
        videoHash = result.hash;
        frames = result.frames;
        cachedResult = result.cachedResult;
        if (result.cached) console.log('[Upload] ⚡ Video previously checked');
        if (result.duration && !fileDuration) setFileDuration(Math.round(result.duration));
        console.log(`[Upload] Extracted ${frames?.length || 0} frames for AI analysis`);
      }).catch(err => {
        console.warn('[Upload] Frame extraction failed/timed out, continuing without:', err.message);
      });

      // Get presigned URL immediately (don't wait for frames)
      const presignPromise = api.get("/video/presign", {
        params: { filename: fileToUpload.name, mimeType: fileToUpload.type || "video/mp4" },
      });

      const { data: presign } = await presignPromise;
      setStage("uploading");
      uploadStartRef.current = Date.now();

      // ── Upload video (runs in parallel with frame extraction) ──
      // withCredentials must only be set for same-origin proxy requests, NOT for R2 presigned URLs
      const uploadFile = (url, headers = {}, useCookies = false) => new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", url);
        if (useCookies) xhr.withCredentials = true; // only for proxy-upload (same origin)
        Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
        xhr.upload.onprogress = (e) => {
          if (e.total) {
            const pct = Math.round((e.loaded / e.total) * 99);
            setProgress(pct);
            const elapsed = (Date.now() - uploadStartRef.current) / 1000;
            if (elapsed > 1 && e.loaded > 0) {
              const speed = e.loaded / elapsed; // bytes/s
              setUploadSpeed(speed / (1024 * 1024)); // MB/s
              const remaining = (e.total - e.loaded) / speed;
              setUploadEta(Math.ceil(remaining));
            }
          }
        };
        xhr.onload = () => {
          setUploadSpeed(null);
          setUploadEta(null);
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else {
            let msg = `Upload failed (${xhr.status})`;
            try { msg = JSON.parse(xhr.responseText)?.error || msg; } catch {}
            reject(new Error(msg));
          }
        };
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.send(fileToUpload);
      });

      try {
        await uploadFile(presign.uploadUrl, {
          "Content-Type": fileToUpload.type || "video/mp4",
        }, false); // false = no cookies for R2 presigned URL
        console.log("[Upload] ⚡ Direct R2 upload succeeded");
      } catch (directErr) {
        console.warn("[Upload] Direct R2 upload failed, falling back to proxy:", directErr.message);
        setProgress(0);
        setUploadSpeed(null);
        setUploadEta(null);
        uploadStartRef.current = Date.now();
        const token = await getAuthToken();
        const proxyUrl = token
          ? `/api/video/proxy-upload?token=${encodeURIComponent(token)}`
          : `/api/video/proxy-upload`;
        await uploadFile(proxyUrl, {
          "Content-Type": fileToUpload.type || "video/mp4",
          "x-r2-key": presign.key,
          "x-mime-type": fileToUpload.type || "video/mp4",
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        }, true); // true = send cookies for same-origin proxy
      }

      // Wait for frame extraction to finish (may already be done)
      await framePromise;

      // Step 3: Upload frames if extracted (optional - server can fall back to extracting from video)
      let frameKeys = null;
      if (frames && frames.length > 0) {
        try {
          setStage("uploading-frames");
          setProgress(100);
          console.log('[Upload] Uploading frames to server...');
          
          // Convert frames to base64 for JSON transport
          const frameDataPromises = frames.map(blob => {
            return new Promise((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result.split(',')[1]); // Get base64 part
              reader.readAsDataURL(blob);
            });
          });
          
          const frameData = await Promise.all(frameDataPromises);
          
          // Send frames to server
          const { data: frameUpload } = await api.post("/video/upload-frames", {
            reportKey: presign.key,
            frames: frameData,
          });
          
          frameKeys = frameUpload.frameKeys;
          console.log('[Upload] ⚡ Frames uploaded - server will skip frame extraction!');
        } catch (frameErr) {
          console.warn('[Upload] Frame upload failed, server will extract from video:', frameErr);
          // Continue without frames - not critical
        }
      } else {
        setProgress(100);
      }

      // Step 4: Tell our server the upload is done — start analysis
      setStage("confirming");

      // Use original duration (before compression) for validation
      // Don't re-read from compressed file as WebM metadata may be incorrect
      const recordedDuration = originalDuration || await readVideoBlobDuration(fileToUpload);
      
      if (recordedDuration) {
        console.log(`[Upload] Sending duration to server: ${recordedDuration}s`);
      } else {
        console.warn('[Upload] Could not determine video duration');
      }

      const { data } = await api.post("/video/confirm", {
        key:       presign.key,
        publicUrl: presign.publicUrl,
        mimeType:  fileToUpload.type || "video/mp4",
        isPublic:  isPublic,
        videoHash: videoHash, // Send hash for cache checking
        frameKeys: frameKeys, // Send frame keys if uploaded
        ...(recordedDuration ? { recordedDuration } : {}),
      });
      
      // Cache successful result for future uploads
      if (videoHash && data.success) {
        cacheResult(videoHash, { passed: true });
      }

      onAnalysisStarted(data.reportId, isPublic);
      setIsPublic(true);
      setFile(null);
      document.getElementById("video-input").value = "";
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Upload failed");
    } finally {
      setUploading(false); setProgress(0); setStage(""); setUploadSpeed(null); setUploadEta(null);
    }
  };

  return (
    <div className="card">
      <div className="section-title">📹 Upload Video for Analysis</div>
      <p style={{ color: "var(--muted)", marginBottom: "1rem" }}>
        Minimum {durationLimits.minLabel} · Full score at {durationLimits.fullScoreLabel} · Max {durationLimits.maxLabel} · Up to 500MB · MP4, MOV, AVI, WEBM, 3GP · Reports stored 18 hours
      </p>
      <div className="upload-area">
        <input id="video-input" type="file"
          accept="video/mp4,video/quicktime,video/x-msvideo,video/webm,video/mpeg,video/3gpp,video/x-flv,video/x-ms-wmv"
          onChange={handleFileChange} disabled={uploading} style={{ marginBottom: "1rem" }} />
        {file && !uploading && (
          <div style={{ color: "var(--muted)", marginBottom: "1rem", fontSize: "0.9rem" }}>
            📄 {file.name} — {(file.size / 1024 / 1024).toFixed(1)} MB
          </div>
        )}
        {uploading && (
          <div style={{ marginBottom: "1rem" }}>
            {/* Step label + percentage */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem", fontSize: "0.88rem" }}>
              <span style={{ color: "var(--text)", fontWeight: 600 }}>
                {stage === "compressing" ? "🗜️ Compressing video…" :
                 stage === "hashing" ? "🔍 Extracting frames…" :
                 stage === "uploading-frames" ? "📤 Saving frames…" :
                 stage === "confirming" ? "🤖 Starting analysis…" :
                 progress < 100 ? "☁️ Uploading to cloud…" : "✅ Upload complete"}
              </span>
              <span style={{ color: "var(--primary)", fontWeight: 700 }}>
                {stage === "compressing" ? `${compressProgress}%` :
                 stage === "hashing" ? `${hashProgress}%` :
                 stage === "confirming" || stage === "uploading-frames" ? "100%" :
                 `${progress}%`}
              </span>
            </div>
            {/* Progress bar */}
            <div style={{ background: "var(--bg)", borderRadius: "99px", height: "10px", overflow: "hidden", marginBottom: "0.75rem" }}>
              <div style={{
                height: "100%",
                width: stage === "compressing" ? `${compressProgress}%` : stage === "hashing" ? `${hashProgress}%` : stage === "confirming" || stage === "uploading-frames" ? "100%" : `${progress}%`,
                background: progress === 100 || stage === "confirming" ? "var(--success)" : stage === "compressing" ? "linear-gradient(90deg, #f59e0b, #ef4444)" : "linear-gradient(90deg, var(--primary), #a78bfa)",
                borderRadius: "99px",
                transition: "width 0.4s ease",
              }} />
            </div>
            {/* Step checklist */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              {[
                ...(file && file.size > COMPRESS_THRESHOLD ? [{ icon: "🗜️", label: `Compressing video (${(file.size/1024/1024).toFixed(0)}MB)`, done: stage !== "compressing" && stage !== "", active: stage === "compressing",
                  sub: stage === "compressing" ? `${compressProgress}%` : null }] : []),
                { icon: "🔍", label: "Extracting video frames", done: stage !== "hashing" && stage !== "compressing", active: stage === "hashing" },
                { icon: "☁️", label: "Uploading to cloud", done: progress >= 100, active: stage === "uploading" && progress < 100,
                  sub: stage === "uploading" && progress < 100
                    ? `${progress}%${uploadSpeed ? ` · ${uploadSpeed.toFixed(1)} MB/s` : ""}${uploadEta ? ` · ~${uploadEta}s left` : ""}`
                    : null },
                { icon: "📤", label: "Saving frames for AI", done: stage === "confirming", active: stage === "uploading-frames" },
                { icon: "🤖", label: "Starting AI analysis", done: false, active: stage === "confirming" },
              ].map((s, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: "0.6rem",
                  padding: "0.45rem 0.75rem", borderRadius: "8px",
                  background: s.active ? "rgba(124,111,255,0.1)" : s.done ? "rgba(74,222,128,0.07)" : "transparent",
                  border: `1px solid ${s.active ? "rgba(124,111,255,0.3)" : s.done ? "rgba(74,222,128,0.2)" : "transparent"}`,
                }}>
                  <span style={{ fontSize: "0.9rem", width: "1.2rem", textAlign: "center" }}>
                    {s.done ? "✅" : s.active ? "⏳" : "⬜"}
                  </span>
                  <span style={{ fontSize: "0.82rem", color: s.done ? "var(--success)" : s.active ? "var(--text)" : "var(--muted)", fontWeight: s.active ? 600 : 400, flex: 1 }}>
                    {s.icon} {s.label}
                  </span>
                  {s.sub && <span style={{ fontSize: "0.78rem", color: "var(--primary)", fontWeight: 700 }}>{s.sub}</span>}
                  {s.active && <div style={{ width: "12px", height: "12px", borderRadius: "50%", border: "2px solid var(--primary)", borderTopColor: "transparent", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />}
                </div>
              ))}
            </div>
          </div>
        )}
        {uploadGate && <SubmitGatePanel gate={uploadGate} />}
        {/* Vocabulary challenge */}
        {vocabulary.length > 0 && (
          <VocabularyWords words={vocabulary} requiredCount={vocabRequiredCount} totalCount={vocabWordCount} isPictureDescription={isPictureDescription} />
        )}
        {allowPrivateVideos && file && !uploading && (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            margin: "1rem 0",
            background: isPublic ? "rgba(74,222,128,0.05)" : "rgba(248,113,113,0.05)",
            border: `1px solid ${isPublic ? "rgba(74,222,128,0.2)" : "rgba(248,113,113,0.2)"}`,
            borderRadius: "12px",
            padding: "0.75rem 1rem",
            cursor: "pointer",
            transition: "all 0.2s",
          }} onClick={() => setIsPublic(!isPublic)}>
            {/* Toggle switch */}
            <div style={{
              width: 40, height: 22, borderRadius: 99, flexShrink: 0,
              background: isPublic ? "rgba(74,222,128,0.3)" : "rgba(248,113,113,0.3)",
              border: `1px solid ${isPublic ? "rgba(74,222,128,0.5)" : "rgba(248,113,113,0.5)"}`,
              position: "relative", transition: "all 0.2s",
            }}>
              <div style={{
                width: 16, height: 16, borderRadius: "50%",
                background: isPublic ? "#4ade80" : "#f87171",
                position: "absolute", top: 2,
                left: isPublic ? 20 : 2,
                transition: "left 0.2s, background 0.2s",
                boxShadow: `0 0 6px ${isPublic ? "rgba(74,222,128,0.6)" : "rgba(248,113,113,0.6)"}`,
              }} />
            </div>
            <div>
              <span style={{ fontSize: "0.85rem", fontWeight: 600, color: isPublic ? "#4ade80" : "#f87171" }}>
                {isPublic ? "🌐 Public" : "🔒 Private"}
              </span>
              <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: "0.1rem" }}>
                {isPublic ? "Visible to everyone in the Community Feed" : "Only you and admin can see this"}
              </div>
            </div>
          </div>
        )}
        <button className="btn-primary" onClick={handleUpload} disabled={!file || uploading || (uploadGate && !uploadGate.passed) || isGuest} style={{ width: "100%", position: "relative" }}>
          {uploading ?
            (stage === "hashing" ? `Analyzing ${hashProgress}%…` :
             stage === "uploading-frames" ? "Uploading frames…" :
             stage === "confirming" ? "Starting analysis…" : `Uploading ${progress}%…`) :
            isGuest ? "🔒 Register to Submit & Get AI Feedback" :
            "Upload & Analyze"}        </button>
        {isGuest && (
          <p style={{ textAlign: "center", fontSize: "0.78rem", color: "var(--muted)", marginTop: "0.4rem" }}>
            <a href="/register" style={{ color: "#7c6fff", textDecoration: "none", fontWeight: 600 }}>Register free →</a> to submit videos and receive AI analysis
          </p>
        )}
      </div>
      {error && <div className="error-box" style={{ marginTop: "1rem" }}><p>{error}</p></div>}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}



// ── Record Card ──────────────────────────────────────────────────────────────
// States: "setup" → "countdown" → "recording" → "preview" → "uploading"

function RecordCard({ onAnalysisStarted, question, isMonthlyReflection, isMonthlyGoals, isStorySummary, isPictureDescription = false, vocabulary = [], vocabRequiredCount = 3, vocabWordCount = 5, isGuest = false, durationLimits: dbDurationLimits, allowPrivateVideos = true }) {
  const navigate = useNavigate();
  const [step, setStep]             = useState("setup");
  const [cameras, setCameras]       = useState([]);
  const { generateHashAndFrames, cacheResult, isHashing, hashProgress } = useVideoFrameHash();
  const [mics, setMics]             = useState([]);
  const [camId, setCamId]           = useState("");
  const [micId, setMicId]           = useState("");
  const [countdown, setCountdown]   = useState(3);
  const [elapsed, setElapsed]       = useState(0);
  const elapsedRef = useRef(0); // always holds the latest elapsed value — avoids stale closure in onstop
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [error, setError]           = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState(""); // "compressing" | "hashing" | "uploading" | "uploading-frames" | "confirming"
  const [uploadSpeed, setUploadSpeed] = useState(null); // MB/s
  const [uploadEta, setUploadEta]     = useState(null); // seconds
  const [compressProgress, setCompressProgress] = useState(0);
  const [isPaused, setIsPaused]     = useState(false);
  const [noiseCancel, setNoiseCancel] = useState(true);
  const [backgroundBlur, setBackgroundBlur] = useState(false); // Background blur toggle
  const [blurStrength, setBlurStrength] = useState(20); // Blur strength in pixels (10-40)
  const [ncStatus, setNcStatus]     = useState("idle");
  const [isPublic, setIsPublic]     = useState(true);
  const [previewAspect, setPreviewAspect] = useState(null);
  const [draftRestored, setDraftRestored] = useState(false); // true when draft loaded from IndexedDB

  // ── Background compression state ─────────────────────────────────────────
  // Compression starts automatically as soon as the preview step loads (if blob > threshold).
  // By the time the user clicks Submit, it's already done.
  const [bgCompressState, setBgCompressState] = useState("idle"); // "idle"|"compressing"|"done"|"failed"
  const [bgCompressProgress, setBgCompressProgress] = useState(0);
  const bgCompressedBlobRef = useRef(null); // holds the compressed File once ready

  const { applyNoiseCancellation, cleanupNC } = useNoiseCancellation();
  const { applyBlur, cleanupBlur, toggleBlur, blurStatus, blurError } = useBackgroundBlur(blurStrength);

  const liveVideoRef    = useRef(null);
  const previewVideoRef = useRef(null);
  const streamRef       = useRef(null);
  const recorderRef     = useRef(null);
  const chunksRef       = useRef([]);
  const timerRef        = useRef(null);
  const countdownRef    = useRef(null);
  const pendingBlobRef  = useRef(null); // holds blob until preview video mounts
  const mimeTypeRef     = useRef("video/webm"); // store the actual MIME type used
  const uploadStartRef  = useRef(null);
  const recordingStartedAtRef = useRef(null);
  const accumulatedRecordingMsRef = useRef(0);

  // Keep elapsedRef in sync with elapsed state so callbacks always read the latest value
  useEffect(() => { elapsedRef.current = elapsed; }, [elapsed]);

  const getWallClockElapsed = useCallback(() => {
    let ms = accumulatedRecordingMsRef.current;
    if (recordingStartedAtRef.current) {
      ms += Date.now() - recordingStartedAtRef.current;
    }
    return Math.max(elapsedRef.current, Math.round(ms / 1000));
  }, []);

  const closeActiveRecordingSegment = useCallback(() => {
    if (recordingStartedAtRef.current) {
      accumulatedRecordingMsRef.current += Date.now() - recordingStartedAtRef.current;
      recordingStartedAtRef.current = null;
    }
    const seconds = Math.max(elapsedRef.current, Math.round(accumulatedRecordingMsRef.current / 1000));
    elapsedRef.current = seconds;
    setElapsed(seconds);
    return seconds;
  }, []);

  const gateFlags = { isMonthlyReflection, isMonthlyGoals, isStorySummary, isPictureDescription };
  const durationLimits = dbDurationLimits || getDurationLimits(gateFlags);
  const MAX_SECONDS = durationLimits.maxSeconds;

  // Enumerate devices + restore any saved draft on mount
  useEffect(() => {
    (async () => {
      // ── Restore video draft from IndexedDB (survives page refresh) ──
      try {
        const draft = await loadDraft();
        if (draft?.blob && draft.blob.size > 0) {
          mimeTypeRef.current = draft.mimeType || "video/webm";
          pendingBlobRef.current = draft.blob;
          setRecordedBlob(draft.blob);

          // If saved elapsed is 0 or missing, read actual duration from the blob.
          let restoredElapsed = draft.elapsed || 0;
          if (restoredElapsed <= 0) {
            restoredElapsed = await readVideoBlobDuration(draft.blob) || 0;
            console.log(`[VideoDraft] Measured blob duration: ${restoredElapsed}s`);
          }

          elapsedRef.current = restoredElapsed;
          setElapsed(restoredElapsed);
          setStep("preview");
          setDraftRestored(true);
          console.log(`[VideoDraft] Restored draft — ${(draft.blob.size / 1024 / 1024).toFixed(1)} MB, ${restoredElapsed}s`);
        }
      } catch (draftErr) {
        console.warn("[VideoDraft] Could not restore draft:", draftErr);
      }

      // ── Enumerate camera/mic devices ──
      try {
        const tmp = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        tmp.getTracks().forEach(t => t.stop());
        const devices = await navigator.mediaDevices.enumerateDevices();
        setCameras(devices.filter(d => d.kind === "videoinput"));
        setMics(devices.filter(d => d.kind === "audioinput"));
      } catch {
        setError("Camera/microphone permission denied. Please allow access and refresh.");
      }
    })();
    return () => cleanup();
  }, []);

  const syncPreviewAspect = useCallback(() => {
    const v = liveVideoRef.current;
    if (v?.videoWidth && v?.videoHeight) {
      setPreviewAspect(`${v.videoWidth} / ${v.videoHeight}`);
    }
  }, []);

  const livePreviewStyle = {
    width: "100%",
    maxWidth: "480px",
    borderRadius: "12px",
    background: "#000",
    objectFit: "contain",
    display: "block",
    aspectRatio: previewAspect || (isMobileRecordingDevice() ? "3 / 4" : "16 / 9"),
    maxHeight: isMobileRecordingDevice() ? "70vh" : "none",
  };

  // Attach stream to live video once countdown/recording step renders the element
  useEffect(() => {
    if ((step === "countdown" || step === "recording") && liveVideoRef.current && streamRef.current) {
      liveVideoRef.current.srcObject = streamRef.current;
      liveVideoRef.current.play().catch(() => {});
      syncPreviewAspect();
    }
  }, [step, syncPreviewAspect]);

  // Attach blob URL to preview video once preview step renders the element.
  // Production builds can hit a timer/state race after MediaRecorder stops, so
  // re-read the blob duration here and use it as the source of truth for submit.
  useEffect(() => {
    if (step !== "preview" || !previewVideoRef.current || !recordedBlob) return;

    const url = URL.createObjectURL(recordedBlob);
    let cancelled = false;

    previewVideoRef.current.src = url;
    previewVideoRef.current.load();

    readVideoBlobDuration(recordedBlob).then((duration) => {
      if (cancelled || !duration) return;
      if (Math.abs(duration - elapsedRef.current) <= 1) return;

      elapsedRef.current = duration;
      setElapsed(duration);
      saveDraft({ blob: recordedBlob, mimeType: mimeTypeRef.current, elapsed: duration })
        .catch(err => console.warn("[VideoDraft] Could not update measured duration:", err));
      console.log(`[Recording] Preview duration synced from blob: ${duration}s`);
    });

    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [step, recordedBlob]);

  useEffect(() => {
    if (step === "preview" && pendingBlobRef.current) {
      pendingBlobRef.current = null;
    }
  }, [step]);

  // ── Background compression — starts as soon as preview loads ─────────────
  // If the blob is large enough, kick off compression immediately so it's
  // ready before the user clicks Submit (parallel, not sequential).
  useEffect(() => {
    if (step !== "preview" || !recordedBlob) return;
    if (recordedBlob.size <= COMPRESS_THRESHOLD) return; // small enough, no need
    if (!CAN_COMPRESS) return; // browser doesn't support canvas compression
    if (bgCompressState !== "idle") return; // already running or done

    let cancelled = false;
    setBgCompressState("compressing");
    setBgCompressProgress(0);
    bgCompressedBlobRef.current = null;

    const mimeType = mimeTypeRef.current || recordedBlob.type || "video/webm";
    const ext = mimeType.includes("mp4") ? "mp4" : "webm";
    const fileToCompress = new File([recordedBlob], `recording.${ext}`, { type: mimeType });

    console.log(`[BgCompress] Starting background compression of ${(recordedBlob.size/1024/1024).toFixed(1)} MB`);

    compressVideo(fileToCompress, (p) => {
      if (!cancelled) setBgCompressProgress(Math.round(p * 100));
    }).then((compressed) => {
      if (cancelled) return;
      const compressedFile = new File([compressed], "recording.webm", { type: "video/webm" });
      bgCompressedBlobRef.current = compressedFile;
      setBgCompressState("done");
      console.log(`[BgCompress] Done: ${(recordedBlob.size/1024/1024).toFixed(1)} MB → ${(compressedFile.size/1024/1024).toFixed(1)} MB`);
    }).catch((err) => {
      if (cancelled) return;
      setBgCompressState("failed");
      console.warn("[BgCompress] Failed (will compress on submit):", err.message);
    });

    return () => { cancelled = true; };
  }, [step, recordedBlob, bgCompressState]);

  const cleanup = useCallback(() => {
    clearInterval(timerRef.current);
    clearInterval(countdownRef.current);
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    cleanupNC();
    cleanupBlur();
    setNcStatus("idle");
  }, [cleanupNC, cleanupBlur]);

  const startCountdown = async () => {
    setError(null);
    
    // Check MediaRecorder support
    if (!window.MediaRecorder) {
      setError("Your browser doesn't support video recording. Please use the upload option or try a different browser.");
      return;
    }
    
    try {
      const rawStream = await openRecordingStream(camId, micId);

      let finalStream = rawStream;

      // ── Step 1: RNNoise WASM AI noise cancellation on audio ──
      if (noiseCancel) {
        setNcStatus("loading");
        finalStream = await applyNoiseCancellation(rawStream);
        setNcStatus(finalStream !== rawStream ? "active" : "fallback");
      }

      // ── Step 2: MediaPipe AI background blur on video ──
      if (backgroundBlur) {
        try {
          finalStream = await applyBlur(finalStream);
          console.log(`[BackgroundBlur] Applied - status: ${blurStatus}`);
        } catch (blurErr) {
          console.warn('[BackgroundBlur] Failed, continuing without:', blurErr);
          // Continue with unblurred stream
        }
      }

      streamRef.current = finalStream;
      setStep("countdown");
      setCountdown(3);
      let c = 3;
      countdownRef.current = setInterval(() => {
        c--;
        setCountdown(c);
        if (c <= 0) { clearInterval(countdownRef.current); startRecording(finalStream); }
      }, 1000);
    } catch (err) {
      setNcStatus("idle");
      setError("Could not access camera/mic: " + err.message + ". Please check permissions and try again.");
    }
  };

  const startRecording = (stream) => {
    chunksRef.current = [];

    // Cap the bitrate so even a 10-min recording stays under the 110 MB upload
    // limit. ~1.1 Mbps video + 96 kbps audio ≈ 90 MB at 10 min, ~45 MB at 5 min.
    // Without this, the browser default (~2.5 Mbps) produced 130 MB+ files.
    let recorder;
    const recorderOptions = { videoBitsPerSecond: 1_100_000, audioBitsPerSecond: 96_000 };
    try {
      recorder = new MediaRecorder(stream, recorderOptions);
      console.log(`[Recording] MediaRecorder with capped bitrate (1.1 Mbps video / 96 kbps audio)`);
    } catch (err) {
      // Some browsers reject the options object — fall back to the most basic config.
      console.warn(`[Recording] Bitrate options unsupported, falling back to basic:`, err);
      try {
        recorder = new MediaRecorder(stream);
        console.log(`[Recording] Using basic MediaRecorder (no options)`);
      } catch (err2) {
        console.error(`[Recording] Basic MediaRecorder failed:`, err2);
        setError("Your browser doesn't support video recording. Please use a different browser.");
        setStep("setup");
        cleanup();
        return;
      }
    }

    // Store the actual MIME type the browser chose
    mimeTypeRef.current = recorder.mimeType || "video/webm";
    console.log(`[Recording] Browser selected MIME type: ${mimeTypeRef.current}`);

    recorderRef.current = recorder;
    
    // Track recording health
    let lastChunkTime = Date.now();
    let totalDataReceived = 0;
    let chunkCount = 0;
    
    recorder.ondataavailable = (e) => { 
      chunkCount++;
      const now = Date.now();
      const timeSinceLastChunk = now - lastChunkTime;
      lastChunkTime = now;
      
      if (e.data && e.data.size > 0) {
        totalDataReceived += e.data.size;
        console.log(`[Recording] Chunk ${chunkCount}: ${e.data.size} bytes (${timeSinceLastChunk}ms since last)`);
        chunksRef.current.push(e.data);
        
        // Real-time health check - warn if chunks are too small
        const expectedSizePerChunk = 50000; // ~50KB per second minimum
        if (e.data.size < expectedSizePerChunk && elapsed > 5) {
          console.warn(`[Recording] Small chunk detected: ${e.data.size} bytes (expected ~${expectedSizePerChunk})`);
        }
      } else {
        console.error(`[Recording] Empty chunk ${chunkCount} received after ${timeSinceLastChunk}ms`);
      }
      
      // Log recording health every 10 chunks
      if (chunkCount % 10 === 0) {
        const avgChunkSize = totalDataReceived / chunkCount;
        console.log(`[Recording] Health check - ${chunkCount} chunks, ${totalDataReceived} bytes total, ${avgChunkSize.toFixed(0)} avg/chunk`);
      }
    };
    
    recorder.onstop = () => {
      console.log(`[Recording] Stop event - ${chunksRef.current.length} chunks collected, ${totalDataReceived} bytes total`);
      
      // Validate chunks before creating blob
      const validChunks = chunksRef.current.filter(chunk => chunk && chunk.size > 0);
      const totalSize = validChunks.reduce((sum, chunk) => sum + chunk.size, 0);
      
      console.log(`[Recording] Valid chunks: ${validChunks.length}, Total size: ${totalSize} bytes`);
      
      if (validChunks.length === 0 || totalSize === 0) {
        console.error(`[Recording] No valid chunks found!`);
        setError("Recording failed - no data captured. Browser may not support recording.");
        setStep("setup");
        cleanup();
        return;
      }
      
      // More aggressive size validation using the finalized recording duration.
      const finalElapsed = closeActiveRecordingSegment();
      const expectedMinSize = finalElapsed * 3000; // ~3KB per second (very conservative)
      const expectedMaxSize = finalElapsed * 500000; // ~500KB per second (generous)
      
      if (totalSize < expectedMinSize) {
        console.error(`[Recording] File too small: ${totalSize} bytes for ${finalElapsed}s (expected min: ${expectedMinSize})`);
        setError(`Recording corrupted - file too small (${Math.round(totalSize/1024)}KB for ${finalElapsed}s). Try a different browser.`);
        setStep("setup");
        cleanup();
        return;
      }
      
      if (totalSize > expectedMaxSize) {
        console.warn(`[Recording] File very large: ${totalSize} bytes for ${finalElapsed}s (expected max: ${expectedMaxSize})`);
      }
      
      console.log(`[Recording] Creating blob with MIME type: ${mimeTypeRef.current}`);
      const blob = new Blob(validChunks, { type: mimeTypeRef.current });
      console.log(`[Recording] Blob created - type: ${blob.type}, size: ${blob.size}`);
      
      // Final validation - check if blob is accessible
      try {
        const url = URL.createObjectURL(blob);
        URL.revokeObjectURL(url); // Clean up immediately
        console.log(`[Recording] Blob validation passed`);
      } catch (blobErr) {
        console.error(`[Recording] Blob creation failed:`, blobErr);
        setError("Recording failed - could not create video file. Try a different browser.");
        setStep("setup");
        cleanup();
        return;
      }

      // ── Persist to IndexedDB so a refresh doesn't lose the recording ──
      // Use finalized duration — `elapsed` state can be stale in this callback.
      const elapsedSnapshot = finalElapsed;
      saveDraft({ blob, mimeType: mimeTypeRef.current, elapsed: elapsedSnapshot })
        .then(() => console.log(`[VideoDraft] Draft saved — ${elapsedSnapshot}s`))
        .catch(err => console.warn("[VideoDraft] Could not save draft:", err));
      
      pendingBlobRef.current = blob;
      setRecordedBlob(blob);
      elapsedRef.current = finalElapsed;
      setElapsed(finalElapsed);
      setDraftRestored(false); // this is a fresh recording, not a restore
      setStep("preview");
      cleanup();
    };
    
    recorder.onerror = (e) => {
      console.error(`[Recording] MediaRecorder error:`, e);
      setError(`Recording error: ${e.error?.message || 'Unknown error'}. Try a different browser.`);
      setStep("setup");
      cleanup();
    };
    
    recorder.onstatechange = (e) => {
      console.log(`[Recording] State changed to: ${recorder.state}`);
    };
    
    // Start with 2-second intervals for better chunk collection
    try {
      recorder.start(2000);
      console.log(`[Recording] Started with 2000ms intervals`);
    } catch (startErr) {
      console.error(`[Recording] Failed to start:`, startErr);
      setError("Could not start recording. Try a different browser.");
      setStep("setup");
      cleanup();
      return;
    }
    
    setStep("recording");
    elapsedRef.current = 0;
    accumulatedRecordingMsRef.current = 0;
    recordingStartedAtRef.current = Date.now();
    setElapsed(0);
    setIsPaused(false);
    timerRef.current = setInterval(() => {
      const next = getWallClockElapsed();
      elapsedRef.current = next;
      setElapsed(next);
      if (next >= MAX_SECONDS) stopRecording();
    }, 1000);
  };

  const stopRecording = () => {
    clearInterval(timerRef.current);
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      console.log(`[Recording] Stopping recorder in state: ${recorderRef.current.state}`);
      try {
        closeActiveRecordingSegment();
        recorderRef.current.stop();
      } catch (err) {
        console.error(`[Recording] Error stopping recorder:`, err);
        setError("Error stopping recording. Please try again.");
        setStep("setup");
        cleanup();
      }
    }
  };

  const togglePause = useCallback(() => {
    if (!recorderRef.current) return;
    if (recorderRef.current.state === "recording") {
      closeActiveRecordingSegment();
      recorderRef.current.pause();
      clearInterval(timerRef.current);
      setIsPaused(true);
    } else if (recorderRef.current.state === "paused") {
      recorderRef.current.resume();
      recordingStartedAtRef.current = Date.now();
      timerRef.current = setInterval(() => {
        const next = getWallClockElapsed();
        elapsedRef.current = next;
        setElapsed(next);
        if (next >= MAX_SECONDS) stopRecording();
      }, 1000);
      setIsPaused(false);
    }
  }, [closeActiveRecordingSegment, getWallClockElapsed, MAX_SECONDS]);

  // Toggle blur during recording
  const handleBlurToggle = useCallback(() => {
    const newValue = !backgroundBlur;
    setBackgroundBlur(newValue);
    if (step === "recording" && toggleBlur) {
      toggleBlur(newValue);
    }
  }, [backgroundBlur, step, toggleBlur]);

  // ── Spacebar = pause / resume while recording ────────────────────────────
  useEffect(() => {
    if (step !== "recording") return;
    const onKey = (e) => {
      // Only trigger on spacebar; ignore if user is typing in an input/textarea
      if (e.code !== "Space") return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      e.preventDefault(); // prevent page scroll
      togglePause();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, togglePause]);

  const retake = () => {
    // Delete the IndexedDB draft so it doesn't restore again
    clearDraft().catch(() => {});
    setRecordedBlob(null);
    setElapsed(0);
    elapsedRef.current = 0;
    recordingStartedAtRef.current = null;
    accumulatedRecordingMsRef.current = 0;
    setDraftRestored(false);
    setBgCompressState("idle");
    setBgCompressProgress(0);
    bgCompressedBlobRef.current = null;
    setStep("setup");
    cleanup();
  };

  const submitRecording = async () => {
    if (!recordedBlob) return;
    const gate = evaluateSubmitGate({
      durationSeconds: elapsed,
      fileSizeBytes: recordedBlob.size,
      flags: gateFlags,
      canCompress: CAN_COMPRESS,
      customLimits: durationLimits,
    });
    if (!gate.passed) {
      setError(gate.checks.find((c) => c.status === "fail")?.message || "Recording does not meet requirements.");
      return;
    }
    
    console.log(`[Upload] Validating blob - size: ${recordedBlob.size}, type: ${recordedBlob.type}, elapsed: ${elapsed}s`);
    
    const expectedMinSize = elapsed * 8000;
    if (recordedBlob.size < expectedMinSize) {
      setError(`Recording seems corrupted (too small: ${Math.round(recordedBlob.size/1024)}KB for ${elapsed}s). Please record again.`);
      return;
    }
    
    setStep("uploading");
    setUploadProgress(0);
    setUploadStage("");
    setUploadSpeed(null);
    setUploadEta(null);
    setCompressProgress(0);
    setError(null);

    try {
      let mimeType = mimeTypeRef.current || recordedBlob.type || "video/webm";
      if (!mimeType.startsWith("video/")) mimeType = "video/webm";
      const ext = mimeType.includes("mp4") ? "mp4" : "webm";
      let fileToUpload = new File([recordedBlob], `recording.${ext}`, { type: mimeType });
      console.log(`[Upload] Created file - name: ${fileToUpload.name}, size: ${fileToUpload.size}, type: ${fileToUpload.type}`);

      // ── Compress large recordings ──
      // Use background-compressed result if already ready; otherwise compress now.
      if (fileToUpload.size > COMPRESS_THRESHOLD && typeof MediaRecorder !== "undefined" && typeof HTMLCanvasElement.prototype.captureStream === "function") {
        if (bgCompressedBlobRef.current) {
          // ✅ Already compressed in background during preview — use it instantly
          console.log(`[Upload] Using pre-compressed blob (${(bgCompressedBlobRef.current.size/1024/1024).toFixed(1)} MB)`);
          fileToUpload = bgCompressedBlobRef.current;
        } else {
          // Fallback: compress now (background compression failed or wasn't supported)
          setUploadStage("compressing");
          setCompressProgress(0);
          try {
            const compressed = await compressVideo(fileToUpload, (p) => setCompressProgress(Math.round(p * 100)));
            fileToUpload = new File([compressed], "recording.webm", { type: "video/webm" });
            console.log(`[Upload] Compressed ${(recordedBlob.size/1024/1024).toFixed(1)}MB → ${(fileToUpload.size/1024/1024).toFixed(1)}MB`);
          } catch (compErr) {
            console.warn("[Upload] Compression failed, uploading original:", compErr.message);
          }
        }
      }

      // Server hard-rejects anything over 110 MB. If we still can't fit, stop here
      // with a clear message rather than letting the upload fail with a 413.
      if (fileToUpload.size > 110 * 1024 * 1024) {
        setStep("preview");
        setError(`Recording is ${(fileToUpload.size / 1024 / 1024).toFixed(1)} MB even after compression (max 110 MB). Please record a shorter clip.`);
        return;
      }

      // ── Frame extraction + presigned URL in parallel ──
      setUploadStage("hashing");
      let videoHash = null;
      let frames = null;

      const framePromise = Promise.race([
        generateHashAndFrames(fileToUpload),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Frame extraction timeout")), 12000))
      ]).then(result => {
        videoHash = result.hash;
        frames = result.frames;
        if (result.cached) console.log('[Upload] ⚡ Video previously checked');
        console.log(`[Upload] Extracted ${frames?.length || 0} frames for AI analysis`);
      }).catch(err => {
        console.warn('[Upload] Frame extraction failed/timed out, continuing without:', err.message);
      });

      const presignPromise = api.get("/video/presign", {
        params: { filename: fileToUpload.name, mimeType: fileToUpload.type },
      });

      const { data: presign } = await presignPromise;
      setUploadStage("uploading");
      uploadStartRef.current = Date.now();

      // ── Upload video (runs in parallel with frame extraction) ──
      const uploadRecFile = (url, headers = {}, useCookies = false) => new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", url);
        if (useCookies) xhr.withCredentials = true; // only for same-origin proxy
        Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
        xhr.upload.onprogress = (e) => {
          if (e.total) {
            const pct = Math.round((e.loaded / e.total) * 99);
            setUploadProgress(pct);
            const elapsedMs = (Date.now() - uploadStartRef.current) / 1000;
            if (elapsedMs > 1 && e.loaded > 0) {
              const speed = e.loaded / elapsedMs;
              setUploadSpeed(speed / (1024 * 1024));
              const remaining = (e.total - e.loaded) / speed;
              setUploadEta(Math.ceil(remaining));
            }
          }
        };
        xhr.onload = () => {
          setUploadSpeed(null);
          setUploadEta(null);
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else {
            let msg = `Upload failed (${xhr.status})`;
            try { msg = JSON.parse(xhr.responseText)?.error || msg; } catch {}
            reject(new Error(msg));
          }
        };
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.ontimeout = () => reject(new Error("Upload timeout"));
        xhr.timeout = 300000;
        xhr.send(fileToUpload);
      });

      try {
        await uploadRecFile(presign.uploadUrl, { "Content-Type": fileToUpload.type }, false); // no cookies for R2
        console.log("[Upload] ⚡ Direct R2 upload succeeded");
      } catch (directErr) {
        console.warn("[Upload] Direct R2 upload failed, falling back to proxy:", directErr.message);
        setUploadProgress(0);
        setUploadSpeed(null);
        setUploadEta(null);
        uploadStartRef.current = Date.now();
        const token = await getAuthToken();
        const proxyUrl = token
          ? `/api/video/proxy-upload?token=${encodeURIComponent(token)}`
          : `/api/video/proxy-upload`;
        await uploadRecFile(proxyUrl, {
          "Content-Type": fileToUpload.type,
          "x-r2-key": presign.key,
          "x-mime-type": fileToUpload.type,
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        }, true); // send cookies for same-origin proxy
      }

      // Wait for frame extraction to finish
      await framePromise;

      // ── Upload frames if extracted ──
      let frameKeys = null;
      if (frames && frames.length > 0) {
        try {
          setUploadStage("uploading-frames");
          setUploadProgress(100);
          console.log('[Upload] Uploading frames to server...');

          const frameDataPromises = frames.map(blob => {
            return new Promise((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result.split(',')[1]);
              reader.readAsDataURL(blob);
            });
          });

          const frameData = await Promise.all(frameDataPromises);

          const { data: frameUpload } = await api.post("/video/upload-frames", {
            reportKey: presign.key,
            frames: frameData,
          });

          frameKeys = frameUpload.frameKeys;
          console.log('[Upload] ⚡ Frames uploaded - server will skip frame extraction!');
        } catch (frameErr) {
          console.warn('[Upload] Frame upload failed, server will extract from video:', frameErr);
        }
      } else {
        setUploadProgress(100);
      }

      // ── Confirm with server — start analysis ──
      setUploadStage("confirming");

      const { data } = await api.post("/video/confirm", {
        key:       presign.key,
        publicUrl: presign.publicUrl,
        mimeType:  fileToUpload.type,
        isPublic:  isPublic,
        recordedDuration: elapsed,
        videoHash: videoHash,
        frameKeys: frameKeys,
      });
      
      if (videoHash && data.success) {
        cacheResult(videoHash, { passed: true });
      }

      console.log(`[Upload] Analysis started with reportId: ${data.reportId}`);
      // ── Clear the draft — video has been submitted successfully ──
      clearDraft().catch(() => {});
      onAnalysisStarted(data.reportId, isPublic);
      setIsPublic(true);
      setStep("setup");
      setRecordedBlob(null);
      setElapsed(0);
      setDraftRestored(false);
    } catch (err) {
      console.error("[Upload] Error:", err);
      setError(err.response?.data?.error || err.message || "Upload failed");
      setStep("preview");
    } finally {
      setUploadStage("");
      setUploadSpeed(null);
      setUploadEta(null);
    }
  };

  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const recordGate = recordedBlob
    ? evaluateSubmitGate({
        durationSeconds: elapsed,
        fileSizeBytes: recordedBlob.size,
        flags: gateFlags,
        canCompress: CAN_COMPRESS,
        customLimits: durationLimits,
      })
    : null;

  return (
    <div className="card">
      <div className="section-title">🎥 Record Video for Analysis</div>

      {/* ── SETUP ── */}
      {step === "setup" && (
        <div>
          <p style={{ color: "var(--muted)", marginBottom: "1.25rem", fontSize: "0.9rem" }}>
            Minimum {durationLimits.minLabel} · Full score at {durationLimits.fullScoreLabel} · Max {durationLimits.maxLabel} · Speak clearly to the camera
          </p>
          
          {/* Recording stability notice for long recordings */}
          {(isMonthlyReflection || isMonthlyGoals) && (
            <div style={{
              background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)",
              borderRadius: 12, padding: "0.85rem 1rem", marginBottom: "1.25rem",
              fontSize: "0.82rem", color: "rgba(255,255,255,0.8)", lineHeight: 1.6,
            }}>
              ⚠️ <strong style={{ color: "#f59e0b" }}>Long Recording Notice:</strong> For recordings over 5 minutes, ensure stable internet and avoid switching apps. If you experience issues, try recording in shorter segments or use the upload option instead.
            </div>
          )}
          
          {/* Browser compatibility notice */}
          <div style={{
            background: "rgba(14,165,233,0.08)", border: "1px solid rgba(56,189,248,0.25)",
            borderRadius: 10, padding: "0.75rem 1rem", marginBottom: "1.25rem",
            fontSize: "0.8rem", color: "rgba(255,255,255,0.7)", lineHeight: 1.5,
          }}>
            💡 <strong style={{ color: "#38bdf8" }}>For best results:</strong> Use Chrome or Edge browsers. Recording uses advanced browser features that work best in modern browsers.
          </div>

          {/* Monthly reflection reminder inside record card */}
          {isMonthlyReflection && (
            <div style={{
              background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.3)",
              borderRadius: 12, padding: "0.85rem 1rem", marginBottom: "1.25rem",
              fontSize: "0.82rem", color: "rgba(255,255,255,0.8)", lineHeight: 1.6,
            }}>
              🌟 <strong style={{ color: "#a78bfa" }}>Monthly Reflection Day!</strong> Answer all 6 questions in your video:
              <ol style={{ marginTop: "0.5rem", paddingLeft: "1.2rem", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <li>How many reviews did you attend this month?</li>
                <li>How many passed / failed? Why did you fail?</li>
                <li>How many extensions did you take this month?</li>
                <li>What is your current growth and progress?</li>
                <li>What did you do to improve communication this month?</li>
                <li>What is your communication skill level now vs last month?</li>
              </ol>
            </div>
          )}

          {/* Monthly goals reminder inside record card */}
          {isMonthlyGoals && (
            <div style={{
              background: "rgba(34,197,94,0.08)", border: "1px solid rgba(74,222,128,0.3)",
              borderRadius: 12, padding: "0.85rem 1rem", marginBottom: "1.25rem",
              fontSize: "0.82rem", color: "rgba(255,255,255,0.8)", lineHeight: 1.6,
            }}>
              🎯 <strong style={{ color: "#4ade80" }}>Monthly Goal Setting Day!</strong> Speak your goals for this month:
              <ol style={{ marginTop: "0.5rem", paddingLeft: "1.2rem", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <li>What is your main goal for this month?</li>
                <li>What is your dream or target right now?</li>
                <li>What steps will you take to improve communication?</li>
                <li>Biggest challenge last month &amp; how to overcome it?</li>
                <li>How many reviews are you planning this month?</li>
                <li>What will you do differently to grow faster?</li>
              </ol>
            </div>
          )}

          {/* Story summary reminder inside record card */}
          {isStorySummary && (
            <div style={{
              background: "rgba(20,184,166,0.08)", border: "1px solid rgba(45,212,191,0.3)",
              borderRadius: 12, padding: "0.85rem 1rem", marginBottom: "1.25rem",
              fontSize: "0.82rem", color: "rgba(255,255,255,0.8)", lineHeight: 1.6,
            }}>
              🎧 <strong style={{ color: "#2dd4bf" }}>Story Summary Day!</strong> Listen to the audio first, then retell the story clearly in your own words.
            </div>
          )}

          {/* Picture description reminder inside record card */}
          {isPictureDescription && (
            <div style={{
              background: "rgba(66,153,225,0.08)", border: "1px solid rgba(99,179,237,0.3)",
              borderRadius: 12, padding: "0.85rem 1rem", marginBottom: "1.25rem",
              fontSize: "0.82rem", color: "rgba(255,255,255,0.8)", lineHeight: 1.6,
            }}>
              🖼️ <strong style={{ color: "#90cdf4" }}>Picture Description!</strong> Look at the image above, then describe what you see and share your thoughts.
            </div>
          )}

          {/* Device selectors */}
          <div className="grid-cols-2" style={{ marginBottom: "1.25rem" }}>
            <div style={{ position: 'relative', zIndex: 10 }}>
              <label className="form-label">📷 Camera</label>
              <select 
                className="form-input" 
                value={camId} 
                onChange={e => setCamId(e.target.value)}
                style={{ cursor: 'pointer', position: 'relative', zIndex: 10 }}
              >
                <option value="">Default camera</option>
                {cameras.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0,6)}`}</option>)}
              </select>
            </div>
            <div style={{ position: 'relative', zIndex: 10 }}>
              <label className="form-label">🎙️ Microphone</label>
              <select 
                className="form-input" 
                value={micId} 
                onChange={e => setMicId(e.target.value)}
                style={{ cursor: 'pointer', position: 'relative', zIndex: 10 }}
              >
                <option value="">Default mic</option>
                {mics.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Mic ${d.deviceId.slice(0,6)}`}</option>)}
              </select>
            </div>
          </div>

          {/* Noise cancellation toggle */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: "var(--card2)", border: "1px solid var(--border2)",
            borderRadius: "10px", padding: "0.75rem 1rem", marginBottom: "0.75rem",
          }}>
            <div>
              <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text)" }}>
                🎙️ AI Noise Cancellation
              </div>
              <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: "0.15rem" }}>
                RNNoise WASM — removes background noise
              </div>
            </div>
            <button onClick={() => setNoiseCancel(v => !v)} style={{
              width: "44px", height: "24px", borderRadius: "12px", border: "none", cursor: "pointer",
              background: noiseCancel ? "var(--success)" : "var(--border2)",
              position: "relative", transition: "background 0.2s", flexShrink: 0,
            }}>
              <span style={{
                position: "absolute", top: "3px",
                left: noiseCancel ? "22px" : "3px",
                width: "18px", height: "18px", borderRadius: "50%",
                background: "#fff", transition: "left 0.2s",
              }} />
            </button>
          </div>

          {/* Background blur toggle */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: "var(--card2)", border: "1px solid var(--border2)",
            borderRadius: "10px", padding: "0.75rem 1rem", marginBottom: "0.75rem",
          }}>
            <div>
              <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text)" }}>
                🌫️ AI Background Blur
              </div>
              <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: "0.15rem" }}>
                MediaPipe AI — detects you and blurs background
              </div>
              {blurError && (
                <div style={{ fontSize: "0.7rem", color: "var(--danger)", marginTop: "0.25rem" }}>
                  ⚠️ Model loading failed - check internet connection
                </div>
              )}
            </div>
            <button onClick={() => setBackgroundBlur(v => !v)} style={{
              width: "44px", height: "24px", borderRadius: "12px", border: "none", cursor: "pointer",
              background: backgroundBlur ? "var(--primary)" : "var(--border2)",
              position: "relative", transition: "background 0.2s", flexShrink: 0,
            }}>
              <span style={{
                position: "absolute", top: "3px",
                left: backgroundBlur ? "22px" : "3px",
                width: "18px", height: "18px", borderRadius: "50%",
                background: "#fff", transition: "left 0.2s",
              }} />
            </button>
          </div>

          {/* Blur strength slider (only show when blur is enabled) */}
          {backgroundBlur && (
            <div style={{
              background: "var(--card2)", border: "1px solid var(--border2)",
              borderRadius: "10px", padding: "0.75rem 1rem", marginBottom: "1.25rem",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                <label style={{ fontSize: "0.8rem", color: "var(--text)", fontWeight: 600 }}>
                  Blur Strength
                </label>
                <span style={{ fontSize: "0.75rem", color: "var(--primary)", fontWeight: 700 }}>
                  {blurStrength}px
                </span>
              </div>
              <input
                type="range"
                min="5"
                max="40"
                step="5"
                value={blurStrength}
                onChange={(e) => setBlurStrength(Number(e.target.value))}
                style={{
                  width: "100%",
                  height: "6px",
                  borderRadius: "3px",
                  background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${((blurStrength - 5) / 35) * 100}%, var(--border2) ${((blurStrength - 5) / 35) * 100}%, var(--border2) 100%)`,
                  outline: "none",
                  cursor: "pointer",
                  WebkitAppearance: "none",
                }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.25rem", fontSize: "0.65rem", color: "var(--muted)" }}>
                <span>Light</span>
                <span>Strong</span>
              </div>
            </div>
          )}

          {/* Vocabulary challenge */}
          {vocabulary.length > 0 && (
            <VocabularyWords words={vocabulary} requiredCount={vocabRequiredCount} totalCount={vocabWordCount} isPictureDescription={isPictureDescription} />
          )}

          <button className="btn-primary" onClick={startCountdown} style={{ width: "100%" }}>
            🎬 Start Recording
          </button>
          {error && <div className="error-box" style={{ marginTop: "1rem" }}><p>{error}</p></div>}
        </div>
      )}

      {/* ── COUNTDOWN ── */}
      {step === "countdown" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1.5rem" }}>
          <video ref={liveVideoRef} autoPlay muted playsInline
            onLoadedMetadata={syncPreviewAspect}
            style={livePreviewStyle} />
          <div style={{ fontSize: "5rem", fontWeight: 900, color: "var(--primary)", lineHeight: 1 }}>{countdown}</div>
          
          {/* Noise cancellation status */}
          {ncStatus === "loading" && (
            <p style={{ color: "var(--warning)", fontSize: "0.82rem" }}>⚙️ Loading AI noise cancellation…</p>
          )}
          {ncStatus === "active" && (
            <p style={{ color: "var(--success)", fontSize: "0.82rem" }}>✅ AI noise cancellation active</p>
          )}
          {ncStatus === "fallback" && (
            <p style={{ color: "var(--muted)", fontSize: "0.82rem" }}>🎙️ Browser noise suppression active</p>
          )}
          {!noiseCancel && (
            <p style={{ color: "var(--muted)", fontSize: "0.82rem" }}>🎙️ Browser noise suppression active</p>
          )}
          
          {/* Background blur status */}
          {backgroundBlur && blurStatus === "loading" && (
            <p style={{ color: "var(--warning)", fontSize: "0.82rem" }}>⚙️ Loading AI background blur…</p>
          )}
          {backgroundBlur && blurStatus === "active" && (
            <p style={{ color: "var(--success)", fontSize: "0.82rem" }}>✅ AI background blur active</p>
          )}
          {backgroundBlur && blurStatus === "fallback" && (
            <p style={{ color: "var(--muted)", fontSize: "0.82rem" }}>🌫️ Background blur unavailable — continuing without</p>
          )}
          {backgroundBlur && blurStatus === "error" && (
            <p style={{ color: "var(--danger)", fontSize: "0.82rem" }}>⚠️ Background blur error — continuing without</p>
          )}
          
          <p style={{ color: "var(--muted)" }}>Get ready…</p>
        </div>
      )}

      {/* ── RECORDING ── */}
      {step === "recording" && (
        <div>
          {/* Video — 9:16 on mobile, 16:9 on desktop */}
          <div style={{ position: "relative", marginBottom: "0.85rem" }}>
            <video ref={liveVideoRef} autoPlay muted playsInline
              onLoadedMetadata={syncPreviewAspect}
              style={{
                ...livePreviewStyle,
                maxWidth: "100%",
              }} />

            {/* REC badge */}
            <div style={{
              position: "absolute", top: "12px", left: "12px",
              background: isPaused ? "rgba(245,158,11,0.9)" : "rgba(248,113,113,0.9)",
              color: "#fff", padding: "0.25rem 0.65rem", borderRadius: "99px",
              fontSize: "0.75rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.4rem",
              zIndex: 2,
            }}>
              <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#fff",
                animation: isPaused ? "none" : "blink 1s infinite" }} />
              {isPaused ? "PAUSED" : "REC"}
            </div>

            {/* Background blur badge - only show if active */}
            {backgroundBlur && blurStatus === "active" && (
              <div style={{
                position: "absolute", top: "12px", right: ncStatus === "active" ? "75px" : "12px",
                background: "rgba(139,92,246,0.85)", color: "#fff",
                padding: "0.2rem 0.55rem", borderRadius: "99px",
                fontSize: "0.68rem", fontWeight: 700,
                zIndex: 2,
              }}>🌫️ AI BLUR</div>
            )}

            {/* NC badge */}
            {ncStatus === "active" && (
              <div style={{
                position: "absolute", top: "12px", right: "12px",
                background: "rgba(34,211,160,0.85)", color: "#fff",
                padding: "0.2rem 0.55rem", borderRadius: "99px",
                fontSize: "0.68rem", fontWeight: 700,
                zIndex: 2,
              }}>🎙️ AI NC</div>
            )}

            {/* Timer bar — color shifts green→yellow→red as time fills up */}
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "4px", background: "rgba(255,255,255,0.15)", borderRadius: "0 0 12px 12px", zIndex: 2 }}>
              <div style={{
                height: "100%",
                width: `${(elapsed / MAX_SECONDS) * 100}%`,
                background: elapsed >= MAX_SECONDS * 0.8
                  ? "var(--danger)"
                  : elapsed >= MAX_SECONDS * 0.6
                  ? "var(--warning)"
                  : "var(--primary)",
                borderRadius: "inherit",
                transition: "width 1s linear, background 0.5s ease",
              }} />
            </div>
          </div>

          {/* Controls below video */}
          <div style={{
            background: "var(--card2)", border: "1px solid var(--border2)",
            borderRadius: 14, padding: "1rem", display: "flex", flexDirection: "column", gap: "0.85rem",
          }}>
            {/* Timer display */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <span style={{
                  width: 10, height: 10, borderRadius: "50%",
                  background: isPaused ? "var(--warning)" : "var(--danger)",
                  animation: isPaused ? "none" : "blink 1s infinite",
                  display: "inline-block",
                  flexShrink: 0,
                }} />
                <span style={{
                  fontSize: "2rem", fontWeight: 800, fontVariantNumeric: "tabular-nums",
                  color: elapsed >= MAX_SECONDS * 0.8
                    ? "var(--danger)"
                    : elapsed >= MAX_SECONDS * 0.5
                    ? "var(--warning)"
                    : "var(--success)",
                  letterSpacing: "0.04em",
                }}>
                  {fmtTime(elapsed)}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.15rem" }}>
                <span style={{ fontSize: "0.75rem", color: "var(--muted)", fontWeight: 500 }}>
                  max {fmtTime(MAX_SECONDS)}
                </span>
                <span style={{ fontSize: "0.7rem", color: elapsed < 60 ? "var(--warning)" : "var(--success)", fontWeight: 600 }}>
                  {elapsed < 60 ? `${60 - elapsed}s to min` : "✓ min reached"}
                </span>
              </div>
            </div>

            {/* Progress bar */}
            <div style={{ background: "var(--bg)", borderRadius: 6, height: 6, overflow: "hidden" }}>
              <div style={{
                height: "100%", width: `${(elapsed / MAX_SECONDS) * 100}%`,
                background: elapsed > MAX_SECONDS * 0.8 ? "var(--danger)" : elapsed > MAX_SECONDS * 0.6 ? "var(--warning)" : "var(--primary)",
                borderRadius: 6, transition: "width 1s linear",
              }} />
            </div>

            {/* Buttons */}
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button onClick={togglePause} style={{
                flex: 1, padding: "0.85rem 0.5rem", borderRadius: 12, fontWeight: 700, fontSize: "1rem",
                background: isPaused ? "rgba(34,211,160,0.15)" : "rgba(245,158,11,0.15)",
                border: `2px solid ${isPaused ? "rgba(34,211,160,0.4)" : "rgba(245,158,11,0.4)"}`,
                color: isPaused ? "var(--success)" : "var(--warning)", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem",
              }}>
                {isPaused ? "▶ Resume" : "⏸ Pause"}
              </button>
              <button onClick={stopRecording} style={{
                flex: 1, padding: "0.85rem 0.5rem", borderRadius: 12, fontWeight: 700, fontSize: "1rem",
                background: "rgba(248,113,113,0.15)", border: "2px solid rgba(248,113,113,0.4)",
                color: "var(--danger)", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem",
              }}>
                ⏹ Stop
              </button>
            </div>

            {/* Live blur controls during recording */}
            <div style={{
              background: "var(--bg)", border: "1px solid var(--border)",
              borderRadius: 12, padding: "0.85rem 1rem",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.65rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text)" }}>
                    🌫️ Background Blur
                  </span>
                  {blurStatus === "active" && backgroundBlur && (
                    <span style={{
                      fontSize: "0.65rem", fontWeight: 700, color: "var(--success)",
                      background: "rgba(34,211,160,0.15)", padding: "0.15rem 0.5rem",
                      borderRadius: 12, border: "1px solid rgba(34,211,160,0.3)",
                    }}>ACTIVE</span>
                  )}
                </div>
                <button onClick={handleBlurToggle} style={{
                  width: "44px", height: "24px", borderRadius: "12px", border: "none", cursor: "pointer",
                  background: backgroundBlur ? "var(--primary)" : "var(--border2)",
                  position: "relative", transition: "background 0.2s", flexShrink: 0,
                }}>
                  <span style={{
                    position: "absolute", top: "3px",
                    left: backgroundBlur ? "22px" : "3px",
                    width: "18px", height: "18px", borderRadius: "50%",
                    background: "#fff", transition: "left 0.2s",
                  }} />
                </button>
              </div>
              
              {/* Blur strength slider - always visible for easy adjustment */}
              {backgroundBlur && (
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.4rem" }}>
                    <label style={{ fontSize: "0.75rem", color: "var(--muted)", fontWeight: 600 }}>
                      Blur Strength
                    </label>
                    <span style={{ fontSize: "0.75rem", color: "var(--primary)", fontWeight: 700 }}>
                      {blurStrength}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="40"
                    step="5"
                    value={blurStrength}
                    onChange={(e) => setBlurStrength(Number(e.target.value))}
                    style={{
                      width: "100%",
                      height: "6px",
                      borderRadius: "3px",
                      background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${((blurStrength - 5) / 35) * 100}%, var(--border2) ${((blurStrength - 5) / 35) * 100}%, var(--border2) 100%)`,
                      outline: "none",
                      cursor: "pointer",
                      WebkitAppearance: "none",
                    }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.25rem", fontSize: "0.65rem", color: "var(--muted)" }}>
                    <span>Light</span>
                    <span>Medium</span>
                    <span>Strong</span>
                  </div>
                </div>
              )}
            </div>

            {/* Min time hint */}
            {elapsed < 60 && (
              <div style={{ fontSize: "0.78rem", color: "var(--muted)", textAlign: "center" }}>
                ⏱️ Keep going — minimum 1 minute required ({60 - elapsed}s left)
              </div>
            )}

            {/* Spacebar hint */}
            <div style={{ fontSize: "0.72rem", color: "var(--muted)", textAlign: "center", opacity: 0.6 }}>
              Press <kbd style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 4, padding: "0.1rem 0.4rem", fontSize: "0.7rem", fontFamily: "monospace" }}>Space</kbd> to pause / resume
            </div>

            {/* Vocabulary chips — visible during recording */}
            {vocabulary.length > 0 && (
              <div style={{ borderTop: "1px solid var(--border2)", paddingTop: "0.75rem" }}>
                <div style={{ fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(124,111,255,0.8)", marginBottom: "0.5rem" }}>
                  📚 Use at least {Math.min(vocabRequiredCount, vocabulary.length)} of {vocabWordCount || vocabulary.length} words
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                  {vocabulary.map((w, i) => (
                    <span key={i} style={{
                      background: "rgba(124,111,255,0.18)",
                      border: "1px solid rgba(124,111,255,0.35)",
                      borderRadius: 20,
                      padding: "0.25rem 0.7rem",
                      fontSize: "0.82rem",
                      fontWeight: 700,
                      color: "#c4b5fd",
                    }}>
                      {w.word}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PREVIEW ── */}
      {step === "preview" && (
        <div>
          {/* Draft-restored banner */}
          {draftRestored && (
            <div style={{
              display:        "flex",
              alignItems:     "center",
              gap:            "0.6rem",
              background:     "rgba(74,222,128,0.1)",
              border:         "1px solid rgba(74,222,128,0.35)",
              borderRadius:   12,
              padding:        "0.7rem 1rem",
              marginBottom:   "0.9rem",
              fontSize:       "0.82rem",
              color:          "#86efac",
              fontWeight:     500,
            }}>
              <span style={{ fontSize: "1.1rem" }}>📼</span>
              <span>
                <strong style={{ color: "#4ade80" }}>Recording restored!</strong>{" "}
                Your video ({fmtTime(elapsed)}) survived the page refresh. Review it below or retake.
              </span>
            </div>
          )}

          <p style={{ color: "var(--muted)", marginBottom: "1rem", fontSize: "0.9rem" }}>
            Review your recording before submitting for analysis.
            {elapsed < 60 && <span style={{ color: "var(--danger)" }}> ⚠️ Too short ({fmtTime(elapsed)}) — minimum 1 minute.</span>}
          </p>

          
          {/* Recording info display */}
          <div style={{ 
            background: "var(--card2)", 
            border: "1px solid var(--border2)", 
            borderRadius: "8px", 
            padding: "0.75rem 1rem", 
            marginBottom: "1rem",
            fontSize: "0.85rem",
            color: "var(--muted)"
          }}>
            📊 Recording: {fmtTime(elapsed)} • {recordedBlob ? `${(recordedBlob.size / (1024 * 1024)).toFixed(1)}MB` : 'Processing...'} • {mimeTypeRef.current || 'Unknown format'}
            
            {/* Corruption warning if blob is too small */}
            {recordedBlob && recordedBlob.size < elapsed * 5000 && (
              <div style={{ 
                marginTop: "0.5rem", 
                padding: "0.5rem", 
                background: "rgba(248,113,113,0.1)", 
                border: "1px solid rgba(248,113,113,0.3)",
                borderRadius: "6px",
                color: "#f87171",
                fontSize: "0.8rem"
              }}>
                ⚠️ Recording may be corrupted (file too small). Consider using Upload option instead.
              </div>
            )}
          </div>
          
          <video ref={previewVideoRef} controls controlsList="nodownload" playsInline
            style={{ width: "100%", borderRadius: "12px", background: "#000", aspectRatio: "16/9", marginBottom: "1rem" }} />
          {recordGate && <SubmitGatePanel gate={recordGate} />}

          {/* Background compression progress — shown while compressing during preview */}
          {bgCompressState === "compressing" && (
            <div style={{
              background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)",
              borderRadius: 10, padding: "0.75rem 1rem", marginBottom: "0.5rem",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", marginBottom: "0.4rem" }}>
                <span style={{ color: "#fbbf24", fontWeight: 600 }}>🗜️ Compressing video in background…</span>
                <span style={{ color: "#fbbf24", fontWeight: 700 }}>{bgCompressProgress}%</span>
              </div>
              <div style={{ background: "rgba(255,255,255,0.1)", borderRadius: 99, height: 5, overflow: "hidden" }}>
                <div style={{
                  height: "100%", width: `${bgCompressProgress}%`,
                  background: "linear-gradient(90deg, #f59e0b, #ef4444)",
                  borderRadius: 99, transition: "width 0.4s ease",
                }} />
              </div>
              <div style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.5)", marginTop: "0.35rem" }}>
                Submit will be instant once done
              </div>
            </div>
          )}
          {bgCompressState === "done" && recordedBlob && recordedBlob.size > COMPRESS_THRESHOLD && (
            <div style={{
              background: "rgba(34,197,94,0.08)", border: "1px solid rgba(74,222,128,0.3)",
              borderRadius: 10, padding: "0.6rem 1rem", marginBottom: "0.5rem",
              fontSize: "0.82rem", color: "#4ade80", display: "flex", alignItems: "center", gap: "0.5rem",
            }}>
              ✅ Compressed: {(recordedBlob.size/1024/1024).toFixed(1)} MB → {(bgCompressedBlobRef.current?.size/1024/1024).toFixed(1)} MB — ready to submit instantly
            </div>
          )}

          {allowPrivateVideos && recordedBlob && (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              margin: "1rem 0",
              background: isPublic ? "rgba(74,222,128,0.05)" : "rgba(248,113,113,0.05)",
              border: `1px solid ${isPublic ? "rgba(74,222,128,0.2)" : "rgba(248,113,113,0.2)"}`,
              borderRadius: "12px",
              padding: "0.75rem 1rem",
              cursor: "pointer",
              transition: "all 0.2s",
            }} onClick={() => setIsPublic(!isPublic)}>
              {/* Toggle switch */}
              <div style={{
                width: 40, height: 22, borderRadius: 99, flexShrink: 0,
                background: isPublic ? "rgba(74,222,128,0.3)" : "rgba(248,113,113,0.3)",
                border: `1px solid ${isPublic ? "rgba(74,222,128,0.5)" : "rgba(248,113,113,0.5)"}`,
                position: "relative", transition: "all 0.2s",
              }}>
                <div style={{
                  width: 16, height: 16, borderRadius: "50%",
                  background: isPublic ? "#4ade80" : "#f87171",
                  position: "absolute", top: 2,
                  left: isPublic ? 20 : 2,
                  transition: "left 0.2s, background 0.2s",
                  boxShadow: `0 0 6px ${isPublic ? "rgba(74,222,128,0.6)" : "rgba(248,113,113,0.6)"}`,
                }} />
              </div>
              <div>
                <span style={{ fontSize: "0.85rem", fontWeight: 600, color: isPublic ? "#4ade80" : "#f87171" }}>
                  {isPublic ? "🌐 Public" : "🔒 Private"}
                </span>
                <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: "0.1rem" }}>
                  {isPublic ? "Visible to everyone in the Community Feed" : "Only you and admin can see this"}
                </div>
              </div>
            </div>
          )}
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button className="btn-secondary" onClick={retake} style={{ flex: 1 }}>🔄 Retake</button>
            <button
              className="btn-primary"
              onClick={isGuest ? () => navigate("/register") : submitRecording}
              disabled={isGuest ? false : (!recordGate?.passed || bgCompressState === "compressing")}
              style={{ flex: 2, opacity: (!isGuest && bgCompressState === "compressing") ? 0.6 : 1 }}
            >
              {isGuest ? "🔒 Register to Submit" : bgCompressState === "compressing" ? `🗜️ Compressing… ${bgCompressProgress}%` : "🚀 Submit for Analysis"}
            </button>
          </div>
          {isGuest && (
            <p style={{ textAlign: "center", fontSize: "0.78rem", color: "var(--muted)", marginTop: "0.4rem" }}>
              <a href="/register" style={{ color: "#7c6fff", textDecoration: "none", fontWeight: 600 }}>Register free →</a> to get AI-powered feedback on your recording
            </p>
          )}
          
          {/* Alternative upload suggestion */}
          <div style={{
            marginTop: "1rem",
            padding: "0.75rem 1rem",
            background: "rgba(14,165,233,0.08)",
            border: "1px solid rgba(56,189,248,0.25)",
            borderRadius: "8px",
            fontSize: "0.8rem",
            color: "rgba(255,255,255,0.7)",
            lineHeight: 1.5,
          }}>
            💡 <strong style={{ color: "#38bdf8" }}>Having issues?</strong> You can also record with your phone's camera app and use the "Upload Video" option above for more reliable results.
          </div>
          
          {error && <div className="error-box" style={{ marginTop: "1rem" }}><p>{error}</p></div>}
        </div>
      )}

      {/* ── UPLOADING ── */}
      {step === "uploading" && (
        <div style={{ padding: "1.5rem 1rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>

          {/* Step label + percentage */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem", fontSize: "0.88rem" }}>
              <span style={{ color: "var(--text)", fontWeight: 600 }}>
                {uploadStage === "compressing" ? "🗜️ Compressing video…" :
                 uploadStage === "hashing" ? "🔍 Extracting frames…" :
                 uploadStage === "uploading-frames" ? "📤 Saving frames…" :
                 uploadStage === "confirming" ? "🤖 Starting analysis…" :
                 uploadProgress < 100 ? "☁️ Uploading to cloud…" : "✅ Upload complete"}
              </span>
              <span style={{ color: "var(--primary)", fontWeight: 700 }}>
                {uploadStage === "compressing" ? `${compressProgress}%` :
                 uploadStage === "hashing" ? `${hashProgress}%` :
                 uploadStage === "confirming" || uploadStage === "uploading-frames" ? "100%" :
                 `${uploadProgress}%`}
              </span>
            </div>
            {/* Progress bar */}
            <div style={{ background: "var(--bg)", borderRadius: "99px", height: "10px", overflow: "hidden", marginBottom: "0.75rem" }}>
              <div style={{
                height: "100%",
                width: uploadStage === "compressing" ? `${compressProgress}%` : uploadStage === "hashing" ? `${hashProgress}%` : uploadStage === "confirming" || uploadStage === "uploading-frames" ? "100%" : `${uploadProgress}%`,
                background: uploadProgress === 100 || uploadStage === "confirming" ? "var(--success)" : uploadStage === "compressing" ? "linear-gradient(90deg, #f59e0b, #ef4444)" : "linear-gradient(90deg, var(--primary), #a78bfa)",
                borderRadius: "99px",
                transition: "width 0.4s ease",
              }} />
            </div>
            {/* Step checklist */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              {[
                ...(recordedBlob && recordedBlob.size > COMPRESS_THRESHOLD ? [{ icon: "🗜️", label: `Compressing video (${(recordedBlob.size/1024/1024).toFixed(0)}MB)`, done: uploadStage !== "compressing" && uploadStage !== "", active: uploadStage === "compressing",
                  sub: uploadStage === "compressing" ? `${compressProgress}%` : null }] : []),
                { icon: "🔍", label: "Extracting video frames", done: uploadStage !== "hashing" && uploadStage !== "compressing", active: uploadStage === "hashing" },
                { icon: "☁️", label: "Uploading to cloud", done: uploadProgress >= 100, active: uploadStage === "uploading" && uploadProgress < 100,
                  sub: uploadStage === "uploading" && uploadProgress < 100
                    ? `${uploadProgress}%${uploadSpeed ? ` · ${uploadSpeed.toFixed(1)} MB/s` : ""}${uploadEta ? ` · ~${uploadEta}s left` : ""}`
                    : null },
                { icon: "📤", label: "Saving frames for AI", done: uploadStage === "confirming", active: uploadStage === "uploading-frames" },
                { icon: "🤖", label: "Starting AI analysis", done: false, active: uploadStage === "confirming" },
              ].map((s, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: "0.6rem",
                  padding: "0.45rem 0.75rem", borderRadius: "8px",
                  background: s.active ? "rgba(124,111,255,0.1)" : s.done ? "rgba(74,222,128,0.07)" : "transparent",
                  border: `1px solid ${s.active ? "rgba(124,111,255,0.3)" : s.done ? "rgba(74,222,128,0.2)" : "transparent"}`,
                }}>
                  <span style={{ fontSize: "0.9rem", width: "1.2rem", textAlign: "center" }}>
                    {s.done ? "✅" : s.active ? "⏳" : "⬜"}
                  </span>
                  <span style={{ fontSize: "0.82rem", color: s.done ? "var(--success)" : s.active ? "var(--text)" : "var(--muted)", fontWeight: s.active ? 600 : 400, flex: 1 }}>
                    {s.icon} {s.label}
                  </span>
                  {s.sub && <span style={{ fontSize: "0.78rem", color: "var(--primary)", fontWeight: 700 }}>{s.sub}</span>}
                  {s.active && <div style={{ width: "12px", height: "12px", borderRadius: "50%", border: "2px solid var(--primary)", borderTopColor: "transparent", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />}
                </div>
              ))}
            </div>
          </div>

          <p style={{ color: "var(--muted)", fontSize: "0.78rem", textAlign: "center" }}>
            ⚠️ Don't close this tab — upload in progress
          </p>
        </div>
      )}

      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.2} }
        @keyframes spin  { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ── Report display ───────────────────────────────────────────────────────────
function ScoreBar({ score }) {
  const filled = Math.round(score || 0);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <div style={{ display: "flex", gap: "2px" }}>
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} style={{ width: "18px", height: "18px", borderRadius: "3px",
            background: i < filled ? "var(--success)" : "var(--bg)", border: "1px solid var(--border)" }} />
        ))}
      </div>
      <span style={{ fontWeight: 700, minWidth: "40px" }}>{score}/10</span>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: "1.25rem" }}>
      <div style={{ borderTop: "1px solid var(--border)", margin: "1rem 0 0.75rem" }} />
      <div style={{ fontWeight: 700, marginBottom: "0.75rem", color: "var(--text)" }}>{title}</div>
      {children}
    </div>
  );
}

function ReportView({ analysis: a, expiresAt, formatTimeRemaining, videoUrl, reportId, onReEvaluated }) {
  const [reEvaluating, setReEvaluating] = useState(false);
  const [reEvalMsg, setReEvalMsg] = useState(null);

  const handleReEvaluate = async () => {
    if (!reportId) return;
    try {
      setReEvaluating(true);
      setReEvalMsg(null);
      const res = await api.post(`/video/report/${reportId}/re-evaluate`);
      if (res.data?.analysis) {
        if (onReEvaluated) onReEvaluated(res.data.analysis);
        setReEvalMsg(`✓ ${res.data.message || "Score re-evaluated successfully!"}`);
      }
    } catch (err) {
      setReEvalMsg(`⚠️ ${err.response?.data?.error || "Re-evaluation failed"}`);
    } finally {
      setReEvaluating(false);
      setTimeout(() => setReEvalMsg(null), 8000);
    }
  };

  const s = a.stats || {};
  const tierColor = {
    excellent: "#4ade80",
    good: "#a78bfa",
    developing: "#fbbf24",
    needs_work: "#f87171",
  };

  // ── Today's composite score breakdown ────────────────────────────────────
  const bd = a.scoreBreakdown || a._scoreBreakdown || null;
  const cs = a.compositeScore ?? a._compositeScore ?? null;
  // Detect picture description from challengeType (new reports) OR bd flag (processed after scoring change)
  const isPictureBd = a.challengeType === "picture_description" || bd?.isPictureDescription === true;
  const isStoryBd = a.challengeType === "story_summary" || bd?.isStorySummary === true;

  // Generate improvement tips based on what's missing from full score
  const improvementTips = [];
  if (bd) {
    if (isPictureBd) {
      // Picture Description tips
      const comGap  = 30 - (bd.communication || 0);
      const conGap  = 40 - (bd.content       || 0);
      const vocGap  = 10 - (bd.vocabulary    || 0);
      const durGap  = 20  - (bd.duration     || 0);
      if (bd.speechMultiplier != null && bd.speechMultiplier < 85) {
        improvementTips.push({ icon: "🎙️", label: "Improve communication", detail: `Speech ratio was ${bd.speechRatio ?? "?"}% — keep a steady speaking flow`, gap: comGap });
      }
      if (comGap > 2)  improvementTips.push({ icon: "🗣️", label: "Improve communication", detail: `+${comGap.toFixed(1)} pts possible — improve fluency, confidence, grammar and flow`, gap: comGap });
      if (conGap > 2)  improvementTips.push({ icon: "🧠", label: "Develop content", detail: `+${conGap.toFixed(1)} pts possible — connect observations and explain the image in more depth`, gap: conGap });
      if (vocGap > 2)  improvementTips.push({ icon: "📚", label: "Richer vocabulary",  detail: `+${vocGap.toFixed(1)} pts possible — use more varied and precise words`, gap: vocGap });
      if (durGap > 0.5) improvementTips.push({ icon: "⏱️", label: "Make a complete attempt", detail: `+${durGap.toFixed(1)} pts possible — speak for a reasonable amount of time`, gap: durGap });
    } else {
      // Normal / Story summary tips
      const lenGap  = (bd.maxLength  || 30) - (bd.length   || 0);
      const vocGap  = (bd.maxVocab   || 30) - (bd.vocabUsed || 0);
      const topGap  = (bd.maxTopic   || 15) - (bd.topic     || 0);
      const comGap  = (bd.maxComm    || 10) - (bd.comm      || 0);
      if (bd.speechMultiplier != null && bd.speechMultiplier < 85) {
        improvementTips.push({ icon: "🎙️", label: "Speak more actively", detail: `Your speech ratio was ${bd.speechRatio ?? "?"}% — keep talking throughout the video for full duration points`, gap: lenGap });
      } else if (lenGap > 2) {
        improvementTips.push({ icon: "⏱️", label: "Record longer", detail: `+${lenGap.toFixed(1)} pts possible — speak closer to the full-score time`, gap: lenGap });
      }
      if (vocGap > 2) {
        const requiredVocabWords = bd.requiredVocabWords || 3;
        const totalVocabWords = bd.totalVocabWords || 5;
        improvementTips.push({ icon: "📚", label: "Use more vocab words", detail: `+${vocGap.toFixed(1)} pts possible — use at least ${requiredVocabWords} of today's ${totalVocabWords} vocabulary words`, gap: vocGap });
      }
      if (!bd.isSpecialDay && topGap > 1) {
        improvementTips.push({
          icon: isStoryBd ? "📖" : "🎯",
          label: isStoryBd ? "Cover key story points" : "Stay on topic",
          detail: isStoryBd
            ? `+${topGap.toFixed(1)} pts possible — retell the story plot, characters, key events, and resolution`
            : `+${topGap.toFixed(1)} pts possible — answer the question more directly`,
          gap: topGap,
        });
      }
      if (comGap > 2)  improvementTips.push({ icon: "🗣️", label: "Improve communication", detail: `+${comGap.toFixed(1)} pts possible — work on fluency, grammar, confidence & eye contact`, gap: comGap });
      const groGap = (bd.maxGrowth || 15) - (bd.growth || 0);
      if (groGap > 2) {
        improvementTips.push({
          icon: "🌱",
          label: "Aim for personal growth",
          detail: `+${groGap.toFixed(1)} pts possible — speak with slightly clearer pacing and sentence structure to beat your ${bd.baselineComm != null ? `${bd.baselineComm.toFixed(1)} ` : ""}average!`,
          gap: groGap,
        });
      }
    }
    improvementTips.sort((x, y) => y.gap - x.gap);
  }

  return (
    <div className="report-content">

      {/* ── Video Player ── */}
      {videoUrl && (
        <div style={{
          marginBottom: "1.5rem",
          padding: "1rem",
          borderRadius: 16,
          border: "1px solid var(--border2)",
          background: "var(--card2)",
          boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
        }}>
          <div style={{ fontSize: "0.85rem", color: "var(--muted)", fontWeight: 700, marginBottom: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            📼 Your Submitted Video
          </div>
          <video 
            src={videoUrl} 
            controls 
            controlsList="nodownload" 
            playsInline
            style={{ 
              width: "100%", 
              borderRadius: "12px", 
              background: "#000", 
              aspectRatio: "16/9",
              display: "block",
              border: "1px solid rgba(255,255,255,0.05)"
            }} 
          />
        </div>
      )}

      {/* ── Sunday bonus banner ── */}
      {a.sundayBonus && (
        <div style={{
          marginBottom: "1rem",
          padding: "0.85rem 1rem",
          borderRadius: 12,
          background: "linear-gradient(135deg, rgba(251,191,36,0.15), rgba(124,111,255,0.1))",
          border: "1px solid rgba(251,191,36,0.45)",
          display: "flex", alignItems: "center", gap: "0.75rem",
        }}>
          <span style={{ fontSize: "1.6rem", flexShrink: 0 }}>🎉</span>
          <div>
            <div style={{ fontWeight: 800, color: "#fbbf24", fontSize: "1rem", marginBottom: "0.2rem" }}>
              Sunday Bonus! Points Doubled
            </div>
            <div style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.75)", lineHeight: 1.5 }}>
              Base score: <strong>{Math.round(a.baseScore ?? 0)} pts</strong> → Bonus score: <strong style={{ color: "#fbbf24" }}>{Math.round(cs ?? 0)} pts</strong>.
              Every Sunday submission earns double points! 🔥
            </div>
          </div>
        </div>
      )}

      {/* ── Score outcome banner for re-submissions ── */}
      {a.scoreOutcome === "dropped" && (
        <div style={{
          marginBottom: "1rem",
          padding: "0.85rem 1rem",
          borderRadius: 12,
          background: "rgba(251,191,36,0.1)",
          border: "1px solid rgba(251,191,36,0.35)",
          display: "flex", alignItems: "flex-start", gap: "0.65rem",
        }}>
          <span style={{ fontSize: "1.4rem", flexShrink: 0 }}>ℹ️</span>
          <div>
            <div style={{ fontWeight: 700, color: "#fbbf24", marginBottom: "0.2rem" }}>
              Previous score kept — {(a.previousScore ?? 0).toFixed(1)} pts
            </div>
            <div style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.7)", lineHeight: 1.5 }}>
              This submission scored <strong>{Math.round(cs ?? 0)} pts</strong>, which is lower than your earlier attempt today.
              Your best score of <strong>{(a.previousScore ?? 0).toFixed(1)} pts</strong> is still counted in your monthly total.
            </div>
          </div>
        </div>
      )}

      {a.scoreOutcome === "improved" && (
        <div style={{
          marginBottom: "1rem",
          padding: "0.85rem 1rem",
          borderRadius: 12,
          background: "rgba(74,222,128,0.1)",
          border: "1px solid rgba(74,222,128,0.35)",
          display: "flex", alignItems: "flex-start", gap: "0.65rem",
        }}>
          <span style={{ fontSize: "1.4rem", flexShrink: 0 }}>📈</span>
          <div>
            <div style={{ fontWeight: 700, color: "#4ade80", marginBottom: "0.2rem" }}>
              New best! Score improved to {Math.round(cs ?? 0)} pts
            </div>
            <div style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.7)", lineHeight: 1.5 }}>
              Your monthly total has been updated — previous score was <strong>{(a.previousScore ?? 0).toFixed(1)} pts</strong>,
              now replaced with <strong>{Math.round(cs ?? 0)} pts</strong> (+{((cs ?? 0) - (a.previousScore ?? 0)).toFixed(1)}).
            </div>
          </div>
        </div>
      )}

      {/* ── Personal Growth Banner ── */}
      {bd?.growthDelta != null && bd.growthDelta > 0 && (bd.growth ?? 0) >= 9 && (
        <div style={{
          marginBottom: "1rem",
          padding: "0.85rem 1rem",
          borderRadius: 12,
          background: "linear-gradient(135deg, rgba(16,185,129,0.15), rgba(74,222,128,0.08))",
          border: "1px solid rgba(16,185,129,0.45)",
          display: "flex", alignItems: "center", gap: "0.75rem",
        }}>
          <span style={{ fontSize: "1.6rem", flexShrink: 0 }}>🌱</span>
          <div>
            <div style={{ fontWeight: 800, color: "#10b981", fontSize: "1rem", marginBottom: "0.2rem" }}>
              Personal Growth Bonus! +{bd.growth} pts
            </div>
            <div style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.75)", lineHeight: 1.5 }}>
              You beat your recent communication baseline ({bd.baselineComm != null ? `${bd.baselineComm.toFixed(1)} avg` : "past attempts"}) by <strong style={{ color: "#34d399" }}>+{bd.growthDelta.toFixed(1)}</strong>! Your progress and effort earned you high-tier leaderboard points. 🔥
            </div>
          </div>
        </div>
      )}

      {/* ── Today's Score Card ── */}
      {cs != null && (
        <div style={{
          marginBottom: "1.25rem",
          borderRadius: 16,
          border: "1px solid rgba(124,111,255,0.35)",
          background: "linear-gradient(135deg, rgba(124,111,255,0.13) 0%, rgba(79,70,229,0.07) 100%)",
          overflow: "hidden",
        }}>
          {/* Header row */}
          <div style={{ padding: "1rem 1.25rem 0.75rem", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
            <div>
              <div style={{ fontSize: "0.68rem", color: "rgba(167,139,250,0.8)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.2rem" }}>
                🏆 Today's Score
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: "0.4rem" }}>
                <span style={{ fontSize: "2.4rem", fontWeight: 900, color: cs >= 80 ? "#4ade80" : cs >= 60 ? "#a78bfa" : cs >= 40 ? "#fbbf24" : "#f87171", lineHeight: 1 }}>{Math.round(cs)}</span>
                <span style={{ fontSize: "1rem", color: "var(--muted)", fontWeight: 600 }}>/100 pts</span>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", flexWrap: "wrap" }}>
              {reportId && (
                <button
                  type="button"
                  onClick={handleReEvaluate}
                  disabled={reEvaluating}
                  style={{
                    padding: "0.45rem 0.85rem",
                    borderRadius: 10,
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    border: "1px solid rgba(167, 139, 250, 0.4)",
                    background: "rgba(124, 111, 255, 0.15)",
                    color: "#c4b5fd",
                    cursor: reEvaluating ? "not-allowed" : "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    transition: "all 0.15s ease",
                  }}
                  title="Re-run vocabulary detection and recalculate score"
                >
                  {reEvaluating ? (
                    <>
                      <span className="spinner-sm" style={{ width: 12, height: 12, borderWidth: 2 }} />
                      <span>Re-evaluating...</span>
                    </>
                  ) : (
                    <>
                      <span>🔄 Re-evaluate Score</span>
                    </>
                  )}
                </button>
              )}

              <div style={{
                background: cs >= 80 ? "rgba(74,222,128,0.15)" : cs >= 60 ? "rgba(124,111,255,0.15)" : cs >= 40 ? "rgba(251,191,36,0.15)" : "rgba(248,113,113,0.15)",
                border: `1px solid ${cs >= 80 ? "rgba(74,222,128,0.4)" : cs >= 60 ? "rgba(124,111,255,0.4)" : cs >= 40 ? "rgba(251,191,36,0.4)" : "rgba(248,113,113,0.4)"}`,
                borderRadius: 12, padding: "0.5rem 1rem", textAlign: "center",
              }}>
                <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--text)" }}>
                  {cs >= 90 ? "🏆 Elite" : cs >= 80 ? "⭐ Excellent" : cs >= 65 ? "✅ Good" : cs >= 50 ? "📈 Developing" : "💪 Keep going"}
                </div>
                <div style={{ fontSize: "0.68rem", color: "var(--muted)", marginTop: "0.15rem" }}>
                  {a.scoreOutcome === "improved"
                    ? `📈 Improved! (was ${(a.previousScore ?? 0).toFixed(1)} pts)`
                    : a.scoreOutcome === "dropped"
                    ? `ℹ️ Previous best kept (${(a.previousScore ?? 0).toFixed(1)} pts)`
                    : "Added to monthly total"}
                </div>
              </div>
            </div>
          </div>

          {reEvalMsg && (
            <div style={{
              margin: "0 1.25rem 0.75rem",
              padding: "0.45rem 0.85rem",
              borderRadius: 8,
              background: reEvalMsg.startsWith("✓") ? "rgba(74, 222, 128, 0.12)" : "rgba(248, 113, 113, 0.12)",
              border: `1px solid ${reEvalMsg.startsWith("✓") ? "rgba(74, 222, 128, 0.3)" : "rgba(248, 113, 113, 0.3)"}`,
              fontSize: "0.76rem",
              fontWeight: 600,
              color: reEvalMsg.startsWith("✓") ? "#4ade80" : "#f87171",
            }}>
              {reEvalMsg}
            </div>
          )}

          {/* Breakdown bars */}
          {bd && (
            <div style={{ padding: "0 1.25rem 1rem", display: "flex", flexDirection: "column", gap: "0.55rem" }}>
              {(isPictureBd ? [
                { label: `🗣️ Communication`, earned: bd.communication || 0, max: bd.maxCommunication || 20, color: "#60a5fa" },
                { label: `🧠 Content & Relevance`,      earned: bd.content       || 0, max: bd.maxContent       || 35, color: "#a78bfa" },
                { label: `📚 Vocabulary`,               earned: bd.vocabulary    || 0, max: bd.maxVocabulary    || 10, color: "#34d399" },
                { label: `⏱️ Duration`,                 earned: bd.duration      || 0, max: bd.maxDuration      || 20, color: "#fbbf24" },
                ...(bd.growth != null || bd.maxGrowth != null ? [{
                  label: "🌱 Personal Growth",
                  earned: bd.growth || 0,
                  max: bd.maxGrowth || 15,
                  color: "#10b981",
                  subtext: bd.isCalibration
                    ? "First submissions — establishing baseline"
                    : bd.growthDelta > 0
                    ? `+${bd.growthDelta.toFixed(1)} vs baseline`
                    : bd.growthDelta === 0
                    ? "Matches baseline"
                    : `${bd.growthDelta.toFixed(1)} vs baseline`,
                }] : []),
              ] : [
                { label: bd.speechRatio != null ? `⏱️ Duration (${bd.speechRatio}% speaking)` : "⏱️ Duration", earned: bd.length || 0, max: bd.maxLength || 30, color: "#60a5fa" },
                { label: "📚 Vocab used",    earned: bd.vocabUsed || 0, max: bd.maxVocab   || 30, color: "#a78bfa" },
                ...(!bd.isSpecialDay ? [{ label: isStoryBd ? "🎯 Story relevance" : "🎯 Topic relevance", earned: bd.topic || 0, max: bd.maxTopic || 15, color: "#34d399" }] : []),
                { label: "🗣️ Communication", earned: bd.comm     || 0, max: bd.maxComm    || (bd.isSpecialDay ? 25 : 10), color: "#fbbf24" },
                ...(bd.growth != null || bd.maxGrowth != null ? [{
                  label: "🌱 Personal Growth",
                  earned: bd.growth || 0,
                  max: bd.maxGrowth || 15,
                  color: "#10b981",
                  subtext: bd.isCalibration
                    ? "First submissions — establishing baseline"
                    : bd.growthDelta > 0
                    ? `+${bd.growthDelta.toFixed(1)} vs baseline`
                    : bd.growthDelta === 0
                    ? "Matches baseline"
                    : `${bd.growthDelta.toFixed(1)} vs baseline`,
                }] : []),
              ]).map(({ label, earned, max, color, subtext }) => (
                <div key={label}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: "0.75rem", marginBottom: "0.2rem" }}>
                    <span style={{ color: "var(--muted)" }}>
                      {label}
                      {subtext && (
                        <span style={{ marginLeft: "0.4rem", color: color, fontSize: "0.7rem", fontWeight: 600 }}>
                          ({subtext})
                        </span>
                      )}
                    </span>
                    <span style={{ color: "var(--text)", fontWeight: 600 }}>{earned.toFixed(1)} / {max.toFixed(1)}</span>
                  </div>
                  <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 99, height: 6, overflow: "hidden" }}>
                    <div style={{
                      height: "100%", width: `${Math.min(100, (earned / max) * 100)}%`,
                      background: color, borderRadius: 99, transition: "width 0.6s ease",
                    }} />
                  </div>
                </div>
              ))}

              {Array.isArray(a.vocabularyUsed) && a.vocabularyUsed.length > 0 && (
                <div style={{
                  marginTop: "0.25rem",
                  padding: "0.45rem 0.75rem",
                  borderRadius: 10,
                  background: "rgba(167, 139, 250, 0.08)",
                  border: "1px solid rgba(167, 139, 250, 0.2)",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.45rem",
                  flexWrap: "wrap",
                  fontSize: "0.74rem",
                }}>
                  <span style={{ color: "#c4b5fd", fontWeight: 700 }}>🎯 Target Words Recognized:</span>
                  {a.vocabularyUsed.map((w, i) => (
                    <span key={i} style={{
                      background: "rgba(74, 222, 128, 0.15)",
                      border: "1px solid rgba(74, 222, 128, 0.35)",
                      color: "#4ade80",
                      padding: "1px 7px",
                      borderRadius: 6,
                      fontWeight: 700,
                      fontSize: "0.72rem",
                    }}>
                      ✓ {w}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Improvement tips */}
          {improvementTips.length > 0 && (
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", padding: "0.85rem 1.25rem" }}>
              <div style={{ fontSize: "0.7rem", color: "rgba(167,139,250,0.8)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.6rem" }}>
                🚀 What to improve for a higher score
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
                {improvementTips.map((tip, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "0.6rem", fontSize: "0.82rem" }}>
                    <span style={{ fontSize: "1rem", flexShrink: 0 }}>{tip.icon}</span>
                    <div>
                      <span style={{ color: "var(--text)", fontWeight: 600 }}>{tip.label}</span>
                      <span style={{ color: "var(--muted)", marginLeft: "0.35rem" }}>{tip.detail}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {a.overallScore != null && (
        <div style={{
          marginBottom: "1rem",
          padding: "1rem 1.25rem",
          borderRadius: 14,
          border: "1px solid rgba(124,111,255,0.35)",
          background: "linear-gradient(135deg, rgba(124,111,255,0.12), rgba(79,70,229,0.06))",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "1rem",
        }}>
          <div>
            <div style={{ fontSize: "0.72rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>Overall score</div>
            <div style={{ fontSize: "2rem", fontWeight: 900, color: tierColor[a.performanceTier] || "var(--text)" }}>{a.overallScore}/10</div>
          </div>
          {a.performanceLabel && (
            <span style={{
              padding: "0.35rem 0.85rem",
              borderRadius: 20,
              background: `${tierColor[a.performanceTier] || "#a78bfa"}22`,
              border: `1px solid ${tierColor[a.performanceTier] || "#a78bfa"}55`,
              color: tierColor[a.performanceTier] || "#a78bfa",
              fontWeight: 700,
              fontSize: "0.85rem",
            }}>{a.performanceLabel}</span>
          )}
          {a.scoreBreakdown && (
            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", fontSize: "0.8rem", color: "var(--muted)" }}>
              {a.scoreBreakdown.speech != null && <span>🗣️ Speech <strong style={{ color: "var(--text)" }}>{a.scoreBreakdown.speech}</strong></span>}
              {a.scoreBreakdown.visual != null && <span>📹 Presence <strong style={{ color: "var(--text)" }}>{a.scoreBreakdown.visual}</strong></span>}
              {a.scoreBreakdown.topic != null && <span>🎯 On-topic <strong style={{ color: "var(--text)" }}>{a.scoreBreakdown.topic}</strong></span>}
            </div>
          )}
        </div>
      )}
      <div style={{ background: "var(--bg-secondary)", borderRadius: "8px", padding: "0.75rem 1rem", marginBottom: "1rem", display: "flex", flexWrap: "wrap", gap: "1rem", fontSize: "0.95rem" }}>
        {s.duration && <span>⏱️ <strong>{s.duration}</strong></span>}
        {s.wpm && <span>📊 <strong>{s.wpm} wpm</strong> {s.wpm < 100 ? "🐢 Slow" : s.wpm <= 150 ? "✅ Good" : "⚡ Fast"}</span>}
        {s.fillerTotal > 0 && <span>🗣️ Filler words: <strong>{Object.entries(s.fillerWords || {}).map(([w, c]) => `"${w}" ×${c}`).join(", ")}</strong></span>}
        {s.pauses > 0 && <span>🔇 Long pauses: <strong>{s.pauses}</strong></span>}
        {s.rhythm?.speechRatio != null && <span>🎵 Speech ratio: <strong>{s.rhythm.speechRatio}%</strong> {s.rhythm.speechRatio >= 75 ? "✅ Good" : s.rhythm.speechRatio >= 55 ? "⚠️ Many pauses" : "❌ Too many silences"}</span>}
      </div>
      {s.rhythm?.rushesAtStart && <p style={{ color: "var(--warning)", marginBottom: "0.5rem" }}>⚡ Tends to rush at the start — slow down your opening.</p>}
      {s.rhythm?.rushesAtEnd   && <p style={{ color: "var(--warning)", marginBottom: "0.5rem" }}>⚡ Speeds up toward the end — maintain steady pace throughout.</p>}
      {a.qualityWarning && <p style={{ color: "var(--warning)", marginBottom: "0.5rem" }}>🔈 {a.qualityWarning}</p>}

      <Section title="🗣️ Speech Scores">
        {[{ icon: "🗣️", label: "Fluency", v: a.fluency }, { icon: "📚", label: "Grammar", v: a.grammar },
          { icon: "🔥", label: "Confidence", v: a.confidence }, { icon: "🧠", label: "Vocabulary", v: a.vocabulary }]
          .map(({ icon, label, v }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "0.6rem" }}>
              <span style={{ width: "110px", color: "var(--muted)" }}>{icon} {label}</span>
              <ScoreBar score={v} />
            </div>
          ))}
        {s.cefrLevel && <p style={{ marginTop: "0.5rem", color: "var(--muted)" }}>🎓 Level: <strong>{s.cefrLevel.level}</strong> — <em>{s.cefrLevel.description}</em></p>}
        {a.topicRelevance != null && (
          <div style={{ marginTop: "0.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "0.4rem" }}>
              <span style={{ width: "110px", color: "var(--muted)" }}>🎯 On-topic</span>
              <ScoreBar score={a.topicRelevance} />
            </div>
            {a.topicFeedback && <p style={{ color: "var(--muted)", fontSize: "0.9rem", fontStyle: "italic" }}>💬 {a.topicFeedback}</p>}
          </div>
        )}
      </Section>

      {(a.pronunciationNote || a.rhythmNote) && (
        <Section title="🎵 Pronunciation & Rhythm">
          {a.pronunciationNote && <p style={{ marginBottom: "0.4rem" }}>🗣️ {a.pronunciationNote}</p>}
          {a.rhythmNote        && <p>🎵 {a.rhythmNote}</p>}
        </Section>
      )}

      {a.eyeContact != null && (
        <Section title="📹 Visual Presence">
          {[{ icon: "👁️", label: "Eye Contact", v: a.eyeContact }, { icon: "🧍", label: "Body Language", v: a.bodyLanguage },
            { icon: "😊", label: "Expression", v: a.facialExpression }, { icon: "✨", label: "Presence", v: a.overallPresence }]
            .map(({ icon, label, v }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "0.6rem" }}>
                <span style={{ width: "120px", color: "var(--muted)" }}>{icon} {label}</span>
                <ScoreBar score={v} />
              </div>
            ))}
        </Section>
      )}

      {a.grammarErrors?.length > 0 && (
        <Section title="❌ Grammar Issues">
          {a.grammarErrors.map((e, i) => (
            <div key={i} style={{ marginBottom: "0.6rem", paddingLeft: "0.5rem", borderLeft: "3px solid var(--danger)" }}>
              <span style={{ color: "var(--muted)", fontStyle: "italic" }}>"{e.original}"</span>{" → "}
              <strong style={{ color: "var(--success)" }}>"{e.correction}"</strong>
              {e.rule && <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}> ({e.rule})</span>}
            </div>
          ))}
        </Section>
      )}

      {a.strongPoints?.length > 0 && (
        <Section title="✅ What You Did Well">
          <ul style={{ paddingLeft: "1.25rem", margin: 0 }}>
            {a.strongPoints.map((p, i) => <li key={i} style={{ marginBottom: "0.3rem" }}>{p}</li>)}
          </ul>
        </Section>
      )}

      {(a.eyeContactNote || a.bodyLanguageNote || a.expressionNote || a.visualStrengths?.length > 0) && (
        <Section title="📹 Visual Observations">
          {a.eyeContactNote   && <p style={{ marginBottom: "0.4rem" }}>👁️ {a.eyeContactNote}</p>}
          {a.bodyLanguageNote && <p style={{ marginBottom: "0.4rem" }}>🧍 {a.bodyLanguageNote}</p>}
          {a.expressionNote   && <p style={{ marginBottom: "0.4rem" }}>😊 {a.expressionNote}</p>}
          {a.visualStrengths?.map((s, i) => <p key={i} style={{ marginBottom: "0.3rem" }}>✅ {s}</p>)}
        </Section>
      )}

      {(a.vocabularyHighlights?.strong?.length > 0 || a.vocabularyHighlights?.weak?.length > 0) && (
        <Section title="📖 Vocabulary">
          {a.vocabularyHighlights.strong?.length > 0 && <p style={{ marginBottom: "0.4rem" }}>💎 Good words used: <strong>{a.vocabularyHighlights.strong.join(", ")}</strong></p>}
          {a.vocabularyHighlights.weak?.length > 0   && <p>📖 Words to upgrade: <strong>{a.vocabularyHighlights.weak.join(", ")}</strong></p>}
        </Section>
      )}

      {a.suggestions?.length > 0 && (
        <Section title="💡 Speaking Tips">
          <ul style={{ paddingLeft: "1.25rem", margin: 0 }}>
            {a.suggestions.map((t, i) => <li key={i} style={{ marginBottom: "0.3rem" }}>{t}</li>)}
          </ul>
        </Section>
      )}

      {a.visualSuggestions?.length > 0 && (
        <Section title="🎬 Presentation Tips">
          <ul style={{ paddingLeft: "1.25rem", margin: 0 }}>
            {a.visualSuggestions.map((t, i) => <li key={i} style={{ marginBottom: "0.3rem" }}>{t}</li>)}
          </ul>
        </Section>
      )}

      {a.overallComment && (
        <Section title="📝 Overall Feedback">
          <p style={{ lineHeight: 1.7 }}>{a.overallComment}</p>
        </Section>
      )}

      <div style={{ marginTop: "1.5rem", padding: "0.75rem 1rem", background: "var(--bg-secondary)", borderRadius: "8px", color: "var(--muted)", fontSize: "0.85rem" }}>
        ⏰ Auto-deletes in {formatTimeRemaining(expiresAt)}
      </div>
    </div>
  );
}
