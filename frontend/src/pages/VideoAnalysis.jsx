import { useState, useEffect } from "react";
import Layout from "../components/Layout.jsx";
import Modal from "../components/Modal.jsx";
import api from "../api/client.js";

export default function VideoAnalysis() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [reportId, setReportId] = useState(null);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [myReports, setMyReports] = useState([]);
  const [progressStage, setProgressStage] = useState("");
  const [modal, setModal] = useState(null); // { type, title, message, onConfirm }

  useEffect(() => { loadMyReports(); }, []);

  // SSE for real-time progress (only when processing)
  useEffect(() => {
    if (!reportId || !report || report.status !== "processing") return;

    const token = localStorage.getItem("token");
    const evtSource = new EventSource(`/api/video/progress/${reportId}?token=${token}`);

    evtSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.stage) setProgressStage(data.stage);
        if (data.status === "completed" || data.status === "failed") {
          evtSource.close();
          api.get(`/video/report/${reportId}`).then(r => {
            setReport(r.data);
            loadMyReports();
          });
        }
      } catch {}
    };

    evtSource.onerror = () => {
      evtSource.close();
      // Fallback poll
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

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 350 * 1024 * 1024) {
      setError("File size must be less than 350MB");
      return;
    }
    setFile(f);
    setError(null);
  };

  const handleUpload = async () => {
    if (!file) { setError("Please select a video file"); return; }

    setUploading(true);
    setUploadProgress(0);
    setError(null);
    setReport(null);
    setReportId(null);
    setProgressStage("");

    try {
      const formData = new FormData();
      formData.append("video", file);

      const res = await api.post("/video/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (e) => {
          if (e.total) setUploadProgress(Math.round((e.loaded / e.total) * 100));
        },
        // No timeout for large uploads
        timeout: 0,
      });

      setReportId(res.data.reportId);
      setReport({ status: "processing" });
      setFile(null);
      document.getElementById("video-input").value = "";

    } catch (err) {
      setError(err.response?.data?.error || "Upload failed");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // View button — fetch report directly
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
      type: "danger",
      title: "Delete Report",
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

  const scoreColor = (v) => v >= 7 ? "var(--success)" : v >= 5 ? "var(--warning)" : "var(--danger)";

  return (
    <Layout title="Video Analysis">
      {modal && (
        <Modal
          type={modal.type}
          title={modal.title}
          message={modal.message}
          confirmText={modal.confirmText}
          onConfirm={modal.onConfirm}
          onCancel={modal.type !== "alert" ? () => setModal(null) : undefined}
        />
      )}
      <div className="video-analysis-page">

        {/* Upload Card */}
        <div className="card">
          <div className="section-title">📹 Upload Video for Analysis</div>
          <p style={{ color: "var(--muted)", marginBottom: "1rem" }}>
            Minimum 1 minute · Max 5 minutes · Up to 350MB · MP4, MOV, AVI, WEBM, 3GP · Reports stored 12 hours
          </p>

          <div className="upload-area">
            <input
              id="video-input"
              type="file"
              accept="video/mp4,video/quicktime,video/x-msvideo,video/webm,video/mpeg,video/3gpp,video/x-flv,video/x-ms-wmv"
              onChange={handleFileChange}
              disabled={uploading}
              style={{ marginBottom: "1rem" }}
            />

            {file && !uploading && (
              <div style={{ color: "var(--muted)", marginBottom: "1rem", fontSize: "0.9rem" }}>
                📄 {file.name} — {(file.size / 1024 / 1024).toFixed(1)} MB
              </div>
            )}

            {/* Upload progress bar */}
            {uploading && (
              <div style={{ marginBottom: "1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4rem", fontSize: "0.9rem", color: "var(--muted)" }}>
                  <span>{uploadProgress < 100 ? "Uploading…" : "Processing upload…"}</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div style={{ background: "var(--bg)", borderRadius: "6px", height: "8px", overflow: "hidden" }}>
                  <div style={{
                    height: "100%",
                    width: `${uploadProgress}%`,
                    background: "var(--primary)",
                    borderRadius: "6px",
                    transition: "width 0.3s ease",
                  }} />
                </div>
              </div>
            )}

            <button
              className="btn-primary"
              onClick={handleUpload}
              disabled={!file || uploading}
              style={{ width: "100%" }}
            >
              {uploading ? `Uploading ${uploadProgress}%…` : "Upload & Analyze"}
            </button>
          </div>

          {error && <div className="error-box" style={{ marginTop: "1rem" }}><p>{error}</p></div>}
        </div>

        {/* Report Section */}
        {report && (
          <div id="report-section" className="card" style={{ marginTop: "1rem" }}>
            <div className="section-title">
              {report.status === "loading"     && "⏳ Loading…"}
              {report.status === "processing"  && "⏳ Analysing your video…"}
              {report.status === "completed"   && "✅ Analysis Complete"}
              {report.status === "failed"      && "❌ Analysis Failed"}
            </div>

            {(report.status === "loading" || report.status === "processing") && (
              <div className="spinner-wrap">
                <div className="spinner" />
                <p style={{ color: "var(--muted)" }}>
                  {report.status === "loading" ? "Loading report…" : (progressStage || "Starting analysis…")}
                </p>
                {report.status === "processing" && (
                  <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: "0.5rem" }}>
                    Usually takes 2–3 minutes
                  </p>
                )}
              </div>
            )}

            {report.status === "failed" && (
              <div className="error-box">
                <p>{report.errorMessage || "Analysis failed. Please try again."}</p>
              </div>
            )}

            {report.status === "completed" && report.analysis && (
              <ReportView analysis={report.analysis} expiresAt={report.expiresAt} formatTimeRemaining={formatTimeRemaining} scoreColor={scoreColor} />
            )}
          </div>
        )}

        {/* Recent Reports Table */}
        {myReports.length > 0 && (
          <div className="card" style={{ marginTop: "1rem" }}>
            <div className="section-title">📋 Recent Reports (Last 12 Hours)</div>
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
                        <button className="btn-secondary" onClick={() => viewReport(r._id)}
                          disabled={r.status !== "completed"} style={{ marginRight: "0.5rem" }}>
                          View
                        </button>
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

// ── Report display component ─────────────────────────────────────────────────
function ScoreBar({ score }) {
  const filled = Math.round(score || 0);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <div style={{ display: "flex", gap: "2px" }}>
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} style={{
            width: "18px", height: "18px", borderRadius: "3px",
            background: i < filled ? "var(--success)" : "var(--bg)",
            border: "1px solid var(--border)",
          }} />
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

function ReportView({ analysis: a, expiresAt, formatTimeRemaining, scoreColor }) {
  const s = a.stats || {};

  return (
    <div className="report-content">

      {/* ── Stats bar ── */}
      <div style={{ background: "var(--bg-secondary)", borderRadius: "8px", padding: "0.75rem 1rem", marginBottom: "1rem", display: "flex", flexWrap: "wrap", gap: "1rem", fontSize: "0.95rem" }}>
        {s.duration && <span>⏱️ <strong>{s.duration}</strong></span>}
        {s.wpm && (
          <span>📊 <strong>{s.wpm} wpm</strong> {s.wpm < 100 ? "🐢 Slow" : s.wpm <= 150 ? "✅ Good" : "⚡ Fast"}</span>
        )}
        {s.fillerTotal > 0 && (
          <span>🗣️ Filler words: <strong>{Object.entries(s.fillerWords || {}).map(([w, c]) => `"${w}" ×${c}`).join(", ")}</strong></span>
        )}
        {s.pauses > 0 && <span>🔇 Long pauses: <strong>{s.pauses}</strong></span>}
        {s.rhythm?.speechRatio != null && (
          <span>🎵 Speech ratio: <strong>{s.rhythm.speechRatio}%</strong> {s.rhythm.speechRatio >= 75 ? "✅ Good" : s.rhythm.speechRatio >= 55 ? "⚠️ Many pauses" : "❌ Too many silences"}</span>
        )}
      </div>

      {/* Rhythm warnings */}
      {s.rhythm?.rushesAtStart && <p style={{ color: "var(--warning)", marginBottom: "0.5rem" }}>⚡ Tends to rush at the start — slow down your opening.</p>}
      {s.rhythm?.rushesAtEnd   && <p style={{ color: "var(--warning)", marginBottom: "0.5rem" }}>⚡ Speeds up toward the end — maintain steady pace throughout.</p>}
      {a.qualityWarning && <p style={{ color: "var(--warning)", marginBottom: "0.5rem" }}>🔈 {a.qualityWarning}</p>}

      {/* ── Speech Scores ── */}
      <Section title="🗣️ Speech Scores">
        {[
          { icon: "🗣️", label: "Fluency",    v: a.fluency },
          { icon: "📚", label: "Grammar",    v: a.grammar },
          { icon: "🔥", label: "Confidence", v: a.confidence },
          { icon: "🧠", label: "Vocabulary", v: a.vocabulary },
        ].map(({ icon, label, v }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "0.6rem" }}>
            <span style={{ width: "110px", color: "var(--muted)" }}>{icon} {label}</span>
            <ScoreBar score={v} />
          </div>
        ))}
        {s.cefrLevel && (
          <p style={{ marginTop: "0.5rem", color: "var(--muted)" }}>
            🎓 Level: <strong>{s.cefrLevel.level}</strong> — <em>{s.cefrLevel.description}</em>
          </p>
        )}
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

      {/* ── Pronunciation & Rhythm notes ── */}
      {(a.pronunciationNote || a.rhythmNote) && (
        <Section title="🎵 Pronunciation & Rhythm">
          {a.pronunciationNote && <p style={{ marginBottom: "0.4rem" }}>🗣️ {a.pronunciationNote}</p>}
          {a.rhythmNote        && <p>🎵 {a.rhythmNote}</p>}
        </Section>
      )}

      {/* ── Visual Scores ── */}
      {a.eyeContact != null && (
        <Section title="📹 Visual Presence">
          {[
            { icon: "�️", label: "Eye Contact",   v: a.eyeContact },
            { icon: "🧍", label: "Body Language", v: a.bodyLanguage },
            { icon: "😊", label: "Expression",    v: a.facialExpression },
            { icon: "✨", label: "Presence",      v: a.overallPresence },
          ].map(({ icon, label, v }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "0.6rem" }}>
              <span style={{ width: "120px", color: "var(--muted)" }}>{icon} {label}</span>
              <ScoreBar score={v} />
            </div>
          ))}
        </Section>
      )}

      {/* ── Grammar Issues ── */}
      {a.grammarErrors?.length > 0 && (
        <Section title="❌ Grammar Issues">
          {a.grammarErrors.map((e, i) => (
            <div key={i} style={{ marginBottom: "0.6rem", paddingLeft: "0.5rem", borderLeft: "3px solid var(--danger)" }}>
              <span style={{ color: "var(--muted)", fontStyle: "italic" }}>"{e.original}"</span>
              {" → "}
              <strong style={{ color: "var(--success)" }}>"{e.correction}"</strong>
              {e.rule && <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}> ({e.rule})</span>}
            </div>
          ))}
        </Section>
      )}

      {/* ── What you did well ── */}
      {a.strongPoints?.length > 0 && (
        <Section title="✅ What You Did Well">
          <ul style={{ paddingLeft: "1.25rem", margin: 0 }}>
            {a.strongPoints.map((p, i) => <li key={i} style={{ marginBottom: "0.3rem" }}>{p}</li>)}
          </ul>
        </Section>
      )}

      {/* ── Visual Observations ── */}
      {(a.eyeContactNote || a.bodyLanguageNote || a.expressionNote || a.visualStrengths?.length > 0) && (
        <Section title="📹 Visual Observations">
          {a.eyeContactNote   && <p style={{ marginBottom: "0.4rem" }}>👁️ {a.eyeContactNote}</p>}
          {a.bodyLanguageNote && <p style={{ marginBottom: "0.4rem" }}>🧍 {a.bodyLanguageNote}</p>}
          {a.expressionNote   && <p style={{ marginBottom: "0.4rem" }}>😊 {a.expressionNote}</p>}
          {a.visualStrengths?.map((s, i) => <p key={i} style={{ marginBottom: "0.3rem" }}>✅ {s}</p>)}
        </Section>
      )}

      {/* ── Vocabulary ── */}
      {(a.vocabularyHighlights?.strong?.length > 0 || a.vocabularyHighlights?.weak?.length > 0) && (
        <Section title="📖 Vocabulary">
          {a.vocabularyHighlights.strong?.length > 0 && (
            <p style={{ marginBottom: "0.4rem" }}>💎 Good words used: <strong>{a.vocabularyHighlights.strong.join(", ")}</strong></p>
          )}
          {a.vocabularyHighlights.weak?.length > 0 && (
            <p>📖 Words to upgrade: <strong>{a.vocabularyHighlights.weak.join(", ")}</strong></p>
          )}
        </Section>
      )}

      {/* ── Speaking Tips ── */}
      {a.suggestions?.length > 0 && (
        <Section title="💡 Speaking Tips">
          <ul style={{ paddingLeft: "1.25rem", margin: 0 }}>
            {a.suggestions.map((t, i) => <li key={i} style={{ marginBottom: "0.3rem" }}>{t}</li>)}
          </ul>
        </Section>
      )}

      {/* ── Presentation Tips ── */}
      {a.visualSuggestions?.length > 0 && (
        <Section title="🎬 Presentation Tips">
          <ul style={{ paddingLeft: "1.25rem", margin: 0 }}>
            {a.visualSuggestions.map((t, i) => <li key={i} style={{ marginBottom: "0.3rem" }}>{t}</li>)}
          </ul>
        </Section>
      )}

      {/* ── Overall Comment ── */}
      {a.overallComment && (
        <Section title="📝 Overall Feedback">
          <p style={{ lineHeight: 1.7 }}>{a.overallComment}</p>
        </Section>
      )}

      {/* Expiry */}
      <div style={{ marginTop: "1.5rem", padding: "0.75rem 1rem", background: "var(--bg-secondary)", borderRadius: "8px", color: "var(--muted)", fontSize: "0.85rem" }}>
        ⏰ Auto-deletes in {formatTimeRemaining(expiresAt)}
      </div>
    </div>
  );
}

