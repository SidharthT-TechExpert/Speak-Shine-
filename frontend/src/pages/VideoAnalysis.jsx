import { useState, useEffect, useRef, useCallback } from "react";
import Layout from "../components/Layout.jsx";
import Modal from "../components/Modal.jsx";
import api from "../api/client.js";
import { useNoiseCancellation } from "../hooks/useNoiseCancellation.js";
import { useVideoFrameHash } from "../hooks/useVideoFrameHash.js";

// ── Mode toggle ──────────────────────────────────────────────────────────────
// "upload"  → existing file-upload flow
// "record"  → new live-record flow

export default function VideoAnalysis() {
  const [mode, setMode] = useState("upload"); // "upload" | "record"
  const [todayQuestion, setTodayQuestion] = useState(null);
  const [isMonthlyReflection, setIsMonthlyReflection] = useState(false);
  const [isMonthlyGoals, setIsMonthlyGoals] = useState(false);
  const [isWeeklyReflection, setIsWeeklyReflection] = useState(false);

  // shared state
  const [reportId, setReportId]       = useState(null);
  const [report, setReport]           = useState(null);
  const [progressStage, setProgressStage] = useState("");
  const [queueInfo, setQueueInfo]     = useState(null);
  const [myReports, setMyReports]     = useState([]);
  const [modal, setModal]             = useState(null);

  useEffect(() => {
    loadMyReports();
    // Fetch today's question for the top card
    api.get("/dashboard/me").then(r => {
      const t = r.data?.today;
      if (t?.question) setTodayQuestion({ question: t.question, topic: t.topic, category: t.category });
      if (t?.isMonthlyReflection) setIsMonthlyReflection(true);
      if (t?.isMonthlyGoals) setIsMonthlyGoals(true);
      if (t?.isWeeklyReflection) setIsWeeklyReflection(true);
    }).catch(() => {});
  }, []);

  // Auto-refresh reports table when there are processing reports
  useEffect(() => {
    const hasProcessing = myReports.some(r => r.status === "processing");
    if (!hasProcessing) return;

    const interval = setInterval(() => {
      loadMyReports();
    }, 3000); // Refresh every 3 seconds

    return () => clearInterval(interval);
  }, [myReports]);

  // SSE for real-time progress
  useEffect(() => {
    if (!reportId || !report || report.status !== "processing") return;
    const token = localStorage.getItem("token");
    const evtSource = new EventSource(`/api/video/progress/${reportId}?token=${token}`);
    evtSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.status === "queued") {
          setQueueInfo({ position: data.position, queueLength: data.queueLength, estimatedWait: data.estimatedWait });
          setProgressStage(`Position #${data.position} in queue…`);
          return;
        }
        if (data.stage) { setProgressStage(data.stage); setQueueInfo(null); }
        if (data.status === "completed" || data.status === "failed") {
          evtSource.close();
          setQueueInfo(null);
          api.get(`/video/report/${reportId}`).then(r => {
            setReport(r.data); loadMyReports();
          });
        }
      } catch {}
    };
    evtSource.onerror = () => {
      evtSource.close();
      setTimeout(() => {
        api.get(`/video/report/${reportId}`).then(r => {
          setReport(r.data);
          if (r.data.status !== "processing") loadMyReports();
        }).catch(() => {});
      }, 5000);
    };
    return () => evtSource.close();
  }, [reportId, report?.status]);

  const loadMyReports = async () => {
    try {
      const res = await api.get("/video/my-reports");
      setMyReports(res.data.reports || []);
    } catch {}
  };

  const onAnalysisStarted = (id) => {
    setReportId(id);
    setReport({ status: "processing" });
    setProgressStage("");
    setQueueInfo(null);
    loadMyReports();
    setTimeout(() => document.getElementById("report-section")?.scrollIntoView({ behavior: "smooth" }), 200);
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

        {/* ── Weekly Reflection Card (Sunday) ── */}
        {isWeeklyReflection && (
          <div style={{
            background: "linear-gradient(135deg, #0c1a2e 0%, #0f2d4a 50%, #0c1a2e 100%)",
            border: "2px solid rgba(56,189,248,0.45)",
            borderRadius: 18,
            padding: "1.5rem",
            marginBottom: "1rem",
            position: "relative",
            overflow: "hidden",
            boxShadow: "0 8px 40px rgba(14,165,233,0.2)",
          }}>
            <div style={{ position:"absolute", top:-60, right:-60, width:200, height:200, borderRadius:"50%", background:"radial-gradient(circle, rgba(56,189,248,0.18) 0%, transparent 70%)", pointerEvents:"none" }} />
            <div style={{ display:"flex", alignItems:"center", gap:"0.75rem", marginBottom:"1.25rem" }}>
              <div style={{ fontSize:"2.5rem" }}>📅</div>
              <div>
                <div style={{ fontSize:"0.7rem", color:"rgba(56,189,248,0.8)", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em" }}>Sunday — End of Week</div>
                <div style={{ fontSize:"1.3rem", fontWeight:800, color:"#fff", lineHeight:1.2 }}>Weekly Reflection</div>
                <div style={{ fontSize:"0.8rem", color:"rgba(255,255,255,0.6)", marginTop:"0.2rem" }}>Speak your weekly review &amp; learnings</div>
              </div>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:"0.6rem", marginBottom:"1.25rem" }}>
              {[
                { n:"1", q:"Did you attend your review this week? If yes, did you pass or fail? Why?" },
                { n:"2", q:"How many days did you submit your speaking video this week?" },
                { n:"3", q:"What was the best speaking moment you had this week?" },
                { n:"4", q:"What was the most difficult part of speaking this week?" },
                { n:"5", q:"What new word or phrase did you learn and use this week?" },
                { n:"6", q:"What is your focus for next week — in both review preparation and communication?" },
              ].map(({ n, q }) => (
                <div key={n} style={{ display:"flex", gap:"0.75rem", alignItems:"flex-start", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(56,189,248,0.2)", borderRadius:12, padding:"0.75rem 1rem" }}>
                  <div style={{ minWidth:26, height:26, borderRadius:"50%", background:"rgba(14,165,233,0.25)", border:"1px solid rgba(56,189,248,0.5)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"0.75rem", fontWeight:800, color:"#38bdf8", flexShrink:0 }}>{n}</div>
                  <div style={{ fontSize:"0.88rem", color:"rgba(255,255,255,0.9)", lineHeight:1.5 }}>{q}</div>
                </div>
              ))}
            </div>
            <div style={{ background:"rgba(14,165,233,0.1)", border:"1px solid rgba(56,189,248,0.25)", borderRadius:10, padding:"0.75rem 1rem", fontSize:"0.8rem", color:"rgba(255,255,255,0.7)", lineHeight:1.5 }}>
              💡 <strong style={{ color:"#38bdf8" }}>Tip:</strong> Be honest about your week. Reflection is how you grow — speak clearly and specifically!
            </div>
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

        {/* ── Today's Question Card — regular days only ── */}
        {todayQuestion && !isMonthlyReflection && !isMonthlyGoals && !isWeeklyReflection && (
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
          </div>
        )}

        {/* Mode switcher */}
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
          <button
            className={`tab-btn${mode === "upload" ? " active" : ""}`}
            onClick={() => setMode("upload")}
          >📁 Upload Video</button>
          <button
            className={`tab-btn${mode === "record" ? " active" : ""}`}
            onClick={() => setMode("record")}
          >🎥 Record Now</button>
        </div>

        {mode === "upload"
          ? <UploadCard onAnalysisStarted={onAnalysisStarted} isMonthlyReflection={isMonthlyReflection} isMonthlyGoals={isMonthlyGoals} isWeeklyReflection={isWeeklyReflection} />
          : <RecordCard  onAnalysisStarted={onAnalysisStarted} question={todayQuestion} isMonthlyReflection={isMonthlyReflection} isMonthlyGoals={isMonthlyGoals} isWeeklyReflection={isWeeklyReflection} />
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
            {(report.status === "loading" || report.status === "processing") && (
              <ProcessingProgress
                stage={progressStage}
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
                      setProgressStage("Retrying analysis...");
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
              <ReportView analysis={report.analysis} expiresAt={report.expiresAt} formatTimeRemaining={formatTimeRemaining} />
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
                      <td>{r.videoFileName}</td>
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
  { key: "download",   match: /downloading/i,        icon: "⬇️", label: "Downloading video" },
  { key: "virus",      match: /virus|scanning/i,     icon: "🔍", label: "Virus scan" },
  { key: "codec",      match: /codec|validating/i,   icon: "🎬", label: "Codec validation" },
  { key: "moderation", match: /content|safety/i,     icon: "🛡️", label: "Content safety check" },
  { key: "queuing",    match: /queuing|queue/i,       icon: "⏳", label: "Queued for AI" },
  { key: "audio",      match: /audio|extract/i,       icon: "🎵", label: "Extracting audio" },
  { key: "analysis",   match: /analys|video/i,        icon: "🎥", label: "Analysing video" },
  { key: "speech",     match: /speech|scoring/i,      icon: "🗣️", label: "Scoring speech" },
  { key: "feedback",   match: /feedback|generating/i, icon: "📝", label: "Generating feedback" },
];

function ProcessingProgress({ stage, queueInfo, isLoading }) {
  // Determine which step is currently active
  const activeIdx = stage
    ? PIPELINE_STEPS.findIndex(s => s.match.test(stage))
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

  return (
    <div style={{ padding: "1rem 0" }}>
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
          const isDone    = activeIdx > i;
          const isActive  = activeIdx === i;
          const isPending = activeIdx < i;
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

// ── Upload Card (direct-to-R2 flow) ─────────────────────────────────────────
function UploadCard({ onAnalysisStarted, isMonthlyReflection, isMonthlyGoals, isWeeklyReflection }) {
  const [file, setFile]           = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress]   = useState(0);
  const [stage, setStage]         = useState(""); // "hashing" | "uploading" | "confirming"
  const [error, setError]         = useState(null);
  const { generateHashAndFrames, cacheResult, isHashing, hashProgress } = useVideoFrameHash();

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 350 * 1024 * 1024) { setError("File size must be less than 350MB."); return; }
    if (f.size > 110 * 1024 * 1024) {
      setError(`⚠️ This file is ${(f.size/1024/1024).toFixed(0)}MB. Maximum allowed is 110MB. Please record a shorter or lower-quality video.`);
      return;
    }
    setFile(f);
  };

  const handleUpload = async () => {
    if (!file) { setError("Please select a video file"); return; }
    setUploading(true); setProgress(0); setError(null);

    try {
      const fileToUpload = file;
      
      // Step 0: Extract frames and generate hash
      setStage("hashing");
      let videoHash = null;
      let frames = null;
      let cachedResult = null;
      try {
        const result = await Promise.race([
          generateHashAndFrames(fileToUpload),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Frame extraction timeout")), 15000))
        ]);
        videoHash = result.hash;
        frames = result.frames; // 16 high-quality frame blobs
        cachedResult = result.cachedResult;
        
        if (result.cached) {
          console.log('[Upload] ⚡ Video previously checked - security checks will be skipped');
        }
        console.log(`[Upload] Extracted ${frames.length} frames for AI analysis`);
      } catch (hashErr) {
        console.warn('[Upload] Frame extraction failed/timed out, continuing without:', hashErr.message);
        // Continue without frames - server will extract them
      }
      
      setStage("uploading");

      // Step 1: Get presigned URL from our server
      const { data: presign } = await api.get("/video/presign", {
        params: { filename: fileToUpload.name, mimeType: fileToUpload.type || "video/mp4" },
      });

      // Step 2: Upload directly to R2 — Railway never touches the file
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", presign.uploadUrl);
        xhr.setRequestHeader("Content-Type", fileToUpload.type || "video/mp4");
        xhr.upload.onprogress = (e) => {
          if (e.total) setProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`R2 upload failed: ${xhr.status}`));
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.send(fileToUpload);
      });

      // Step 3: Upload frames if extracted (optional - server can fall back to extracting from video)
      let frameKeys = null;
      if (frames && frames.length > 0) {
        try {
          setStage("uploading-frames");
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
      }

      // Step 4: Tell our server the upload is done — start analysis
      setStage("confirming");
      const { data } = await api.post("/video/confirm", {
        key:       presign.key,
        publicUrl: presign.publicUrl,
        mimeType:  fileToUpload.type || "video/mp4",
        isPublic:  true,
        videoHash: videoHash, // Send hash for cache checking
        frameKeys: frameKeys, // Send frame keys if uploaded
      });
      
      // Cache successful result for future uploads
      if (videoHash && data.success) {
        cacheResult(videoHash, { passed: true });
      }

      onAnalysisStarted(data.reportId);
      setFile(null);
      document.getElementById("video-input").value = "";
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Upload failed");
    } finally {
      setUploading(false); setProgress(0); setStage("");
    }
  };

  return (
    <div className="card">
      <div className="section-title">📹 Upload Video for Analysis</div>
      <p style={{ color: "var(--muted)", marginBottom: "1rem" }}>
        Minimum 1 minute · Max {isMonthlyReflection || isMonthlyGoals ? "10" : isWeeklyReflection ? "7" : "5"} minutes · Up to 110MB · MP4, MOV, AVI, WEBM, 3GP · Reports stored 18 hours
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
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4rem", fontSize: "0.9rem", color: "var(--muted)" }}>
              <span>
                {stage === "hashing" ? "🔍 Analyzing video frames…" :
                 stage === "uploading-frames" ? "📤 Uploading frames…" :
                 stage === "confirming" ? "Starting analysis…" :
                 progress < 100 ? "☁️ Uploading to cloud…" : "Finalising…"}
              </span>
              {stage === "hashing" && <span>{hashProgress}%</span>}
              {stage === "uploading" && <span>{progress}%</span>}
            </div>
            <div style={{ background: "var(--bg)", borderRadius: "6px", height: "8px", overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: stage === "hashing" ? `${hashProgress}%` : stage === "confirming" ? "100%" : `${progress}%`,
                background: "var(--primary)",
                borderRadius: "6px",
                transition: "width 0.3s ease"
              }} />
            </div>
          </div>
        )}
        <button className="btn-primary" onClick={handleUpload} disabled={!file || uploading} style={{ width: "100%" }}>
          {uploading ?
            (stage === "hashing" ? `Analyzing ${hashProgress}%…` :
             stage === "uploading-frames" ? "Uploading frames…" :
             stage === "confirming" ? "Starting analysis…" : `Uploading ${progress}%…`) :
            "Upload & Analyze"}
        </button>
      </div>
      {error && <div className="error-box" style={{ marginTop: "1rem" }}><p>{error}</p></div>}
    </div>
  );
}



// ── Record Card ──────────────────────────────────────────────────────────────
// States: "setup" → "countdown" → "recording" → "preview" → "uploading"

function RecordCard({ onAnalysisStarted, question, isMonthlyReflection, isMonthlyGoals, isWeeklyReflection }) {
  const [step, setStep]             = useState("setup");
  const [cameras, setCameras]       = useState([]);
  const { generateHashAndFrames, cacheResult, isHashing, hashProgress } = useVideoFrameHash();
  const [mics, setMics]             = useState([]);
  const [camId, setCamId]           = useState("");
  const [micId, setMicId]           = useState("");
  const [countdown, setCountdown]   = useState(3);
  const [elapsed, setElapsed]       = useState(0);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [error, setError]           = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isPaused, setIsPaused]     = useState(false);
  const [noiseCancel, setNoiseCancel] = useState(true);
  const [ncStatus, setNcStatus]     = useState("idle");

  const { applyNoiseCancellation, cleanupNC } = useNoiseCancellation();

  const liveVideoRef    = useRef(null);
  const previewVideoRef = useRef(null);
  const streamRef       = useRef(null);
  const recorderRef     = useRef(null);
  const chunksRef       = useRef([]);
  const timerRef        = useRef(null);
  const countdownRef    = useRef(null);
  const pendingBlobRef  = useRef(null); // holds blob until preview video mounts
  const mimeTypeRef     = useRef("video/webm"); // store the actual MIME type used

  // Dynamic time limits based on question type
  const MAX_SECONDS = isMonthlyReflection || isMonthlyGoals 
    ? 600  // 10 minutes for monthly reflection/goals
    : isWeeklyReflection 
    ? 420  // 7 minutes for weekly reflection
    : 300; // 5 minutes for regular daily questions

  // Enumerate devices on mount
  useEffect(() => {
    (async () => {
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

  // Attach stream to live video once countdown/recording step renders the element
  useEffect(() => {
    if ((step === "countdown" || step === "recording") && liveVideoRef.current && streamRef.current) {
      liveVideoRef.current.srcObject = streamRef.current;
      liveVideoRef.current.play().catch(() => {});
    }
  }, [step]);

  // Attach blob URL to preview video once preview step renders the element
  useEffect(() => {
    if (step === "preview" && previewVideoRef.current && pendingBlobRef.current) {
      const url = URL.createObjectURL(pendingBlobRef.current);
      previewVideoRef.current.src = url;
      previewVideoRef.current.load();
      pendingBlobRef.current = null;
    }
  }, [step]);

  const cleanup = useCallback(() => {
    clearInterval(timerRef.current);
    clearInterval(countdownRef.current);
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    cleanupNC();
    setNcStatus("idle");
  }, [cleanupNC]);

  const startCountdown = async () => {
    setError(null);
    
    // Check MediaRecorder support
    if (!window.MediaRecorder) {
      setError("Your browser doesn't support video recording. Please use the upload option or try a different browser.");
      return;
    }
    
    try {
      // ── Option 1: browser-level noise suppression via getUserMedia constraints ──
      const isMobile = window.innerWidth < 600;
      const constraints = {
        video: {
          ...(camId ? { deviceId: { exact: camId } } : {}),
          width:  isMobile ? { ideal: 1080 } : { ideal: 1920, min: 1280 },
          height: isMobile ? { ideal: 1920 } : { ideal: 1080, min: 720 },
          aspectRatio: { ideal: isMobile ? 9/16 : 16/9 },
          frameRate: { ideal: 30, min: 24 },
          facingMode: isMobile ? "user" : "user",
        },
        audio: {
          ...(micId ? { deviceId: { exact: micId } } : {}),
          echoCancellation: true,
          noiseSuppression: true,   // browser built-in
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 1,
        },
      };
      const rawStream = await navigator.mediaDevices.getUserMedia(constraints);

      let finalStream = rawStream;

      // ── Option 2: RNNoise WASM AI noise cancellation on top ──
      if (noiseCancel) {
        setNcStatus("loading");
        finalStream = await applyNoiseCancellation(rawStream);
        setNcStatus(finalStream !== rawStream ? "active" : "fallback");
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

    // Use the most basic MediaRecorder configuration possible for maximum compatibility
    let recorder;
    try {
      // Try the most basic configuration first - no codec specification
      recorder = new MediaRecorder(stream);
      console.log(`[Recording] Using basic MediaRecorder (no codec specified)`);
    } catch (err) {
      console.error(`[Recording] Basic MediaRecorder failed:`, err);
      setError("Your browser doesn't support video recording. Please use a different browser.");
      setStep("setup");
      cleanup();
      return;
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
      
      // More aggressive size validation
      const expectedMinSize = elapsed * 3000; // ~3KB per second (very conservative)
      const expectedMaxSize = elapsed * 500000; // ~500KB per second (generous)
      
      if (totalSize < expectedMinSize) {
        console.error(`[Recording] File too small: ${totalSize} bytes for ${elapsed}s (expected min: ${expectedMinSize})`);
        setError(`Recording corrupted - file too small (${Math.round(totalSize/1024)}KB for ${elapsed}s). Try a different browser.`);
        setStep("setup");
        cleanup();
        return;
      }
      
      if (totalSize > expectedMaxSize) {
        console.warn(`[Recording] File very large: ${totalSize} bytes for ${elapsed}s (expected max: ${expectedMaxSize})`);
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
      
      pendingBlobRef.current = blob;
      setRecordedBlob(blob);
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
    setElapsed(0);
    setIsPaused(false);
    timerRef.current = setInterval(() => {
      setElapsed(prev => {
        if (prev + 1 >= MAX_SECONDS) { stopRecording(); return prev + 1; }
        return prev + 1;
      });
    }, 1000);
  };

  const stopRecording = () => {
    clearInterval(timerRef.current);
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      console.log(`[Recording] Stopping recorder in state: ${recorderRef.current.state}`);
      try {
        recorderRef.current.stop();
      } catch (err) {
        console.error(`[Recording] Error stopping recorder:`, err);
        setError("Error stopping recording. Please try again.");
        setStep("setup");
        cleanup();
      }
    }
  };

  const togglePause = () => {
    if (!recorderRef.current) return;
    if (recorderRef.current.state === "recording") {
      recorderRef.current.pause();
      clearInterval(timerRef.current);
      setIsPaused(true);
    } else if (recorderRef.current.state === "paused") {
      recorderRef.current.resume();
      timerRef.current = setInterval(() => {
        setElapsed(prev => {
          if (prev + 1 >= MAX_SECONDS) { stopRecording(); return prev + 1; }
          return prev + 1;
        });
      }, 1000);
      setIsPaused(false);
    }
  };

  const retake = () => {
    setRecordedBlob(null);
    setElapsed(0);
    setStep("setup");
    cleanup();
  };

  const submitRecording = async () => {
    if (!recordedBlob) return;
    if (elapsed < 60) { setError("Recording must be at least 1 minute. Please record again."); return; }
    
    // Additional blob validation before upload
    console.log(`[Upload] Validating blob - size: ${recordedBlob.size}, type: ${recordedBlob.type}, elapsed: ${elapsed}s`);
    
    // Check if blob size is reasonable for the duration
    const expectedMinSize = elapsed * 8000; // ~8KB per second minimum (very conservative)
    const expectedMaxSize = elapsed * 200000; // ~200KB per second maximum (generous)
    
    if (recordedBlob.size < expectedMinSize) {
      console.error(`[Upload] Blob too small: ${recordedBlob.size} bytes for ${elapsed}s (expected min: ${expectedMinSize})`);
      setError(`Recording seems corrupted (too small: ${Math.round(recordedBlob.size/1024)}KB for ${elapsed}s). Please record again.`);
      return;
    }
    
    if (recordedBlob.size > expectedMaxSize) {
      console.warn(`[Upload] Blob very large: ${recordedBlob.size} bytes for ${elapsed}s (expected max: ${expectedMaxSize})`);
    }
    
    setStep("uploading");
    setUploadProgress(0);
    setError(null);
    try {
      // Use the stored MIME type from recording (fallback to blob.type, then default)
      let mimeType = mimeTypeRef.current || recordedBlob.type || "video/webm";
      
      // Ensure it's a video type
      if (!mimeType.startsWith("video/")) {
        console.warn(`[Upload] Invalid MIME type detected: ${mimeType}, forcing to video/webm`);
        mimeType = "video/webm";
      }
      
      const ext = mimeType.includes("mp4") ? "mp4" : "webm";
      const file = new File([recordedBlob], `recording.${ext}`, { type: mimeType });
      
      console.log(`[Upload] Created file - name: ${file.name}, size: ${file.size}, type: ${file.type}`);

      // Step 0: Generate frame hash for cache checking
      let videoHash = null;
      let frames = null;
      try {
        setUploadProgress(5);
        // Wrap in a timeout — frame extraction can hang on some browsers with recorded blobs
        const hashResult = await Promise.race([
          generateHashAndFrames(file),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Frame extraction timeout")), 15000))
        ]);
        videoHash = hashResult.hash;
        frames = hashResult.frames;
        
        if (hashResult.cached) {
          console.log('[Upload] ⚡ Video previously checked - security checks will be skipped');
        }
        console.log(`[Upload] Extracted ${frames.length} frames for AI analysis`);
        setUploadProgress(10);
      } catch (hashErr) {
        console.warn('[Upload] Frame extraction failed/timed out, continuing without:', hashErr.message);
        setUploadProgress(10);
        // Continue without frames - server will extract them
      }

      // Step 1: Get presigned URL
      const { data: presign } = await api.get("/video/presign", {
        params: { filename: file.name, mimeType: file.type },
      });

      // Step 2: Upload directly to R2
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", presign.uploadUrl);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.upload.onprogress = (e) => { 
          if (e.total) {
            // Reserve 10% for hashing, 90% for upload
            const uploadPercent = Math.round((e.loaded / e.total) * 90);
            const progress = 10 + uploadPercent;
            setUploadProgress(progress);
            console.log(`[Upload] Progress: ${progress}% (${e.loaded}/${e.total})`);
          }
        };
        xhr.onload = () => {
          console.log(`[Upload] XHR completed with status: ${xhr.status}`);
          xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`));
        };
        xhr.onerror = () => {
          console.error(`[Upload] XHR error`);
          reject(new Error("Network error during upload"));
        };
        xhr.ontimeout = () => {
          console.error(`[Upload] XHR timeout`);
          reject(new Error("Upload timeout"));
        };
        xhr.timeout = 300000; // 5 minute timeout for large files
        xhr.send(file);
      });

      // Step 2.5: Upload frames if extracted (optional - server can fall back to extracting from video)
      let frameKeys = null;
      if (frames && frames.length > 0) {
        try {
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
      }

      // Step 3: Confirm with server
      const { data } = await api.post("/video/confirm", {
        key:       presign.key,
        publicUrl: presign.publicUrl,
        mimeType:  file.type,
        isPublic:  true,
        recordedDuration: elapsed, // Pass the actual recorded duration from frontend timer
        videoHash: videoHash, // Send hash for cache checking
        frameKeys: frameKeys, // Send frame keys if uploaded
      });
      
      // Cache successful result for future uploads
      if (videoHash && data.success) {
        cacheResult(videoHash, { passed: true });
      }

      console.log(`[Upload] Analysis started with reportId: ${data.reportId}`);
      onAnalysisStarted(data.reportId);
      setStep("setup");
      setRecordedBlob(null);
      setElapsed(0);
    } catch (err) {
      console.error("[Upload] Error:", err);
      setError(err.response?.data?.error || err.message || "Upload failed");
      setStep("preview");
    }
  };

  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="card">
      <div className="section-title">🎥 Record Video for Analysis</div>

      {/* ── SETUP ── */}
      {step === "setup" && (
        <div>
          <p style={{ color: "var(--muted)", marginBottom: "1.25rem", fontSize: "0.9rem" }}>
            Minimum 1 min · Max {isMonthlyReflection || isMonthlyGoals ? "10" : isWeeklyReflection ? "7" : "5"} min · Speak clearly to the camera
          </p>
          
          {/* Recording stability notice for long recordings */}
          {(isMonthlyReflection || isMonthlyGoals || isWeeklyReflection) && (
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

          {/* Weekly reflection reminder inside record card */}
          {isWeeklyReflection && (
            <div style={{
              background: "rgba(14,165,233,0.08)", border: "1px solid rgba(56,189,248,0.3)",
              borderRadius: 12, padding: "0.85rem 1rem", marginBottom: "1.25rem",
              fontSize: "0.82rem", color: "rgba(255,255,255,0.8)", lineHeight: 1.6,
            }}>
              📅 <strong style={{ color: "#38bdf8" }}>Weekly Reflection Sunday!</strong> Answer all 6 questions:
              <ol style={{ marginTop: "0.5rem", paddingLeft: "1.2rem", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <li>Did you attend your review this week? Pass or fail? Why?</li>
                <li>How many days did you submit this week?</li>
                <li>Best speaking moment this week?</li>
                <li>Most difficult part of speaking this week?</li>
                <li>New word or phrase you learned this week?</li>
                <li>Focus for next week — review prep &amp; communication?</li>
              </ol>
            </div>
          )}

          {/* Device selectors */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1.25rem" }}>
            <div>
              <label className="form-label">📷 Camera</label>
              <select className="form-input" value={camId} onChange={e => setCamId(e.target.value)}>
                <option value="">Default camera</option>
                {cameras.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0,6)}`}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">🎙️ Microphone</label>
              <select className="form-input" value={micId} onChange={e => setMicId(e.target.value)}>
                <option value="">Default mic</option>
                {mics.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Mic ${d.deviceId.slice(0,6)}`}</option>)}
              </select>
            </div>
          </div>

          {/* Noise cancellation toggle */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: "var(--card2)", border: "1px solid var(--border2)",
            borderRadius: "10px", padding: "0.75rem 1rem", marginBottom: "1.25rem",
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
            style={{ width: "100%", maxWidth: "480px", borderRadius: "12px", background: "#000", aspectRatio: "16/9", objectFit: "cover" }} />
          <div style={{ fontSize: "5rem", fontWeight: 900, color: "var(--primary)", lineHeight: 1 }}>{countdown}</div>
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
          <p style={{ color: "var(--muted)" }}>Get ready…</p>
        </div>
      )}

      {/* ── RECORDING ── */}
      {step === "recording" && (
        <div>
          {/* Video — 9:16 on mobile, 16:9 on desktop */}
          <div style={{ position: "relative", marginBottom: "0.85rem" }}>
            <video ref={liveVideoRef} autoPlay muted playsInline
              style={{
                width: "100%",
                borderRadius: "12px",
                background: "#000",
                objectFit: "cover",
                display: "block",
                aspectRatio: window.innerWidth < 600 ? "9/16" : "16/9",
                maxHeight: window.innerWidth < 600 ? "70vh" : "none",
              }} />

            {/* REC badge */}
            <div style={{
              position: "absolute", top: "12px", left: "12px",
              background: isPaused ? "rgba(245,158,11,0.9)" : "rgba(248,113,113,0.9)",
              color: "#fff", padding: "0.25rem 0.65rem", borderRadius: "99px",
              fontSize: "0.75rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.4rem",
            }}>
              <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#fff",
                animation: isPaused ? "none" : "blink 1s infinite" }} />
              {isPaused ? "PAUSED" : "REC"}
            </div>

            {/* NC badge */}
            {ncStatus === "active" && (
              <div style={{
                position: "absolute", top: "12px", right: "12px",
                background: "rgba(34,211,160,0.85)", color: "#fff",
                padding: "0.2rem 0.55rem", borderRadius: "99px",
                fontSize: "0.68rem", fontWeight: 700,
              }}>🎙️ AI NC</div>
            )}

            {/* Timer bar */}
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "4px", background: "rgba(255,255,255,0.15)", borderRadius: "0 0 12px 12px" }}>
              <div style={{ height: "100%", width: `${(elapsed / MAX_SECONDS) * 100}%`,
                background: elapsed > 240 ? "var(--danger)" : "var(--primary)", borderRadius: "inherit", transition: "width 1s linear" }} />
            </div>
          </div>

          {/* Controls below video */}
          <div style={{
            background: "var(--card2)", border: "1px solid var(--border2)",
            borderRadius: 14, padding: "1rem", display: "flex", flexDirection: "column", gap: "0.85rem",
          }}>
            {/* Timer display */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{
                  width: 10, height: 10, borderRadius: "50%",
                  background: isPaused ? "var(--warning)" : "var(--danger)",
                  animation: isPaused ? "none" : "blink 1s infinite",
                  display: "inline-block",
                }} />
                <span style={{ fontSize: "1.5rem", fontWeight: 800, fontVariantNumeric: "tabular-nums", color: elapsed > 240 ? "var(--danger)" : "var(--text)" }}>
                  {fmtTime(elapsed)}
                </span>
              </div>
              <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>/ {fmtTime(MAX_SECONDS)} max</span>
            </div>

            {/* Progress bar */}
            <div style={{ background: "var(--bg)", borderRadius: 6, height: 6, overflow: "hidden" }}>
              <div style={{
                height: "100%", width: `${(elapsed / MAX_SECONDS) * 100}%`,
                background: elapsed > 240 ? "var(--danger)" : "var(--primary)",
                borderRadius: 6, transition: "width 1s linear",
              }} />
            </div>

            {/* Buttons */}
            <div style={{ display: "flex", gap: "0.6rem" }}>
              <button onClick={togglePause} style={{
                flex: 1, padding: "0.75rem", borderRadius: 10, fontWeight: 700, fontSize: "0.9rem",
                background: isPaused ? "rgba(34,211,160,0.15)" : "rgba(245,158,11,0.15)",
                border: `1px solid ${isPaused ? "rgba(34,211,160,0.3)" : "rgba(245,158,11,0.3)"}`,
                color: isPaused ? "var(--success)" : "var(--warning)", cursor: "pointer",
              }}>
                {isPaused ? "▶ Resume" : "⏸ Pause"}
              </button>
              <button onClick={stopRecording} style={{
                flex: 1, padding: "0.75rem", borderRadius: 10, fontWeight: 700, fontSize: "0.9rem",
                background: "rgba(248,113,113,0.15)", border: "1px solid rgba(248,113,113,0.3)",
                color: "var(--danger)", cursor: "pointer",
              }}>
                ⏹ Stop & Preview
              </button>
            </div>

            {/* Min time hint */}
            {elapsed < 60 && (
              <div style={{ fontSize: "0.78rem", color: "var(--muted)", textAlign: "center" }}>
                ⏱️ Keep going — minimum 1 minute required ({60 - elapsed}s left)
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PREVIEW ── */}
      {step === "preview" && (
        <div>
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
            📊 Recording: {fmtTime(elapsed)} • {recordedBlob ? `${Math.round(recordedBlob.size / 1024)}KB` : 'Processing...'} • {mimeTypeRef.current || 'Unknown format'}
            
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
          
          <video ref={previewVideoRef} controls playsInline
            style={{ width: "100%", borderRadius: "12px", background: "#000", aspectRatio: "16/9", marginBottom: "1rem" }} />
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button className="btn-secondary" onClick={retake} style={{ flex: 1 }}>🔄 Retake</button>
            <button className="btn-primary" onClick={submitRecording} disabled={elapsed < 60} style={{ flex: 2 }}>
              🚀 Submit for Analysis
            </button>
          </div>
          
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
        <div style={{ padding: "2rem", textAlign: "center" }}>
          <div className="spinner" style={{ margin: "0 auto 1rem" }} />
          <p style={{ color: "var(--muted)", marginBottom: "0.75rem" }}>Uploading recording…</p>
          <div style={{ background: "var(--bg)", borderRadius: "6px", height: "8px", overflow: "hidden", maxWidth: "300px", margin: "0 auto" }}>
            <div style={{ height: "100%", width: `${uploadProgress}%`, background: "var(--primary)", borderRadius: "6px", transition: "width 0.3s ease" }} />
          </div>
          <p style={{ color: "var(--muted)", fontSize: "0.8rem", marginTop: "0.5rem" }}>{uploadProgress}%</p>
        </div>
      )}

      <style>{`@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.2} }`}</style>
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

function ReportView({ analysis: a, expiresAt, formatTimeRemaining }) {
  const s = a.stats || {};
  return (
    <div className="report-content">
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
