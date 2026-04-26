import { useState, useEffect } from "react";
import Layout from "../components/Layout.jsx";
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
    if (!confirm("Delete this report?")) return;
    try {
      await api.delete(`/video/report/${id}`);
      loadMyReports();
      if (reportId === id) { setReportId(null); setReport(null); }
    } catch { alert("Failed to delete report"); }
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
function ReportView({ analysis: a, expiresAt, formatTimeRemaining, scoreColor }) {
  const scores = [
    { icon: "🗣️", label: "Fluency",    value: a.fluency },
    { icon: "📚", label: "Grammar",    value: a.grammar },
    { icon: "🔥", label: "Confidence", value: a.confidence },
    { icon: "🧠", label: "Vocabulary", value: a.vocabulary },
  ];
  const visualScores = a.eyeContact ? [
    { icon: "👁️", label: "Eye Contact",   value: a.eyeContact },
    { icon: "🧍", label: "Body Language", value: a.bodyLanguage },
    { icon: "😊", label: "Expression",    value: a.facialExpression },
    { icon: "✨", label: "Presence",      value: a.overallPresence },
  ] : [];

  return (
    <div className="report-content">
      {/* Speech scores */}
      <div className="stat-grid" style={{ marginBottom: "1.5rem" }}>
        {scores.map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-icon">{s.icon}</div>
            <div className="stat-value" style={{ color: scoreColor(s.value) }}>{s.value}/10</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Visual scores */}
      {visualScores.length > 0 && (
        <div className="stat-grid" style={{ marginBottom: "1.5rem" }}>
          {visualScores.map(s => (
            <div key={s.label} className="stat-card">
              <div className="stat-icon">{s.icon}</div>
              <div className="stat-value" style={{ color: scoreColor(s.value) }}>{s.value}/10</div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Stats bar */}
      {(a.stats?.wpm || a.stats?.duration || a.stats?.cefrLevel) && (
        <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", marginBottom: "1.5rem", padding: "1rem", background: "var(--bg-secondary)", borderRadius: "8px" }}>
          {a.stats.duration && <span>⏱️ <strong>{a.stats.duration}</strong></span>}
          {a.stats.wpm && <span>📊 <strong>{a.stats.wpm} wpm</strong></span>}
          {a.stats.cefrLevel && <span>🎓 <strong>{a.stats.cefrLevel.level}</strong> — {a.stats.cefrLevel.description}</span>}
          {a.stats.fillerTotal > 0 && <span>🗣️ <strong>{a.stats.fillerTotal}</strong> filler words</span>}
        </div>
      )}

      {/* Overall comment */}
      {a.overallComment && (
        <div className="feedback-section">
          <h3>📝 Overall Feedback</h3>
          <p>{a.overallComment}</p>
        </div>
      )}

      {/* Strong points */}
      {a.strongPoints?.length > 0 && (
        <div className="feedback-section">
          <h3>✅ What You Did Well</h3>
          <ul>{a.strongPoints.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </div>
      )}

      {/* Grammar errors */}
      {a.grammarErrors?.length > 0 && (
        <div className="feedback-section">
          <h3>❌ Grammar Issues</h3>
          <ul>
            {a.grammarErrors.map((e, i) => (
              <li key={i}>
                <em>"{e.original}"</em> → <strong>"{e.correction}"</strong>
                {e.rule && <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}> ({e.rule})</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Suggestions */}
      {a.suggestions?.length > 0 && (
        <div className="feedback-section">
          <h3>💡 Speaking Tips</h3>
          <ul>{a.suggestions.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </div>
      )}

      {/* Visual suggestions */}
      {a.visualSuggestions?.length > 0 && (
        <div className="feedback-section">
          <h3>🎬 Presentation Tips</h3>
          <ul>{a.visualSuggestions.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </div>
      )}

      {/* Vocabulary */}
      {(a.vocabularyHighlights?.strong?.length > 0 || a.vocabularyHighlights?.weak?.length > 0) && (
        <div className="feedback-section">
          <h3>📖 Vocabulary</h3>
          {a.vocabularyHighlights.strong?.length > 0 && <p>💎 Good words: <strong>{a.vocabularyHighlights.strong.join(", ")}</strong></p>}
          {a.vocabularyHighlights.weak?.length > 0 && <p>📖 Upgrade: <strong>{a.vocabularyHighlights.weak.join(", ")}</strong></p>}
        </div>
      )}

      {/* Expiry notice */}
      <div style={{ marginTop: "1.5rem", padding: "0.75rem 1rem", background: "var(--bg-secondary)", borderRadius: "8px", color: "var(--muted)", fontSize: "0.85rem" }}>
        ⏰ Auto-deletes in {formatTimeRemaining(expiresAt)}
      </div>
    </div>
  );
}

export default function VideoAnalysis() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [reportId, setReportId] = useState(null);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [myReports, setMyReports] = useState([]);
  const [progressStage, setProgressStage] = useState("");
  const navigate = useNavigate();

  // Load user's recent reports on mount
  useEffect(() => {
    loadMyReports();
  }, []);

  // SSE subscription for real-time progress when we have a reportId
  useEffect(() => {
    if (!reportId || !report || report.status === "completed" || report.status === "failed") return;

    const token = localStorage.getItem("token");
    const evtSource = new EventSource(
      `/api/video/progress/${reportId}?token=${token}`
    );

    evtSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.stage) setProgressStage(data.stage);
        if (data.status === "completed" || data.status === "failed") {
          evtSource.close();
          // Fetch the full report now
          api.get(`/video/report/${reportId}`).then(r => {
            setReport(r.data);
            loadMyReports();
          });
        }
      } catch {}
    };

    evtSource.onerror = () => {
      evtSource.close();
      // Fallback: poll once after 5s
      setTimeout(() => {
        api.get(`/video/report/${reportId}`).then(r => {
          setReport(r.data);
          if (r.data.status === "completed" || r.data.status === "failed") loadMyReports();
        }).catch(() => {});
      }, 5000);
    };

    return () => evtSource.close();
  }, [reportId, report?.status]);

  const loadMyReports = async () => {
    try {
      const res = await api.get("/video/my-reports");
      setMyReports(res.data.reports || []);
    } catch (err) {
      console.error("Failed to load reports:", err);
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      // Validate file size (max 350MB)
      if (selectedFile.size > 350 * 1024 * 1024) {
        setError("File size must be less than 350MB");
        return;
      }
      setFile(selectedFile);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError("Please select a video file");
      return;
    }

    setUploading(true);
    setError(null);
    setReport(null);
    setReportId(null);

    try {
      const formData = new FormData();
      formData.append("video", file);

      const res = await api.post("/video/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setReportId(res.data.reportId);
      setReport({ status: "processing" });
      setFile(null);
      
      // Reset file input
      document.getElementById("video-input").value = "";

    } catch (err) {
      setError(err.response?.data?.error || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const viewReport = async (id) => {
    setReportId(id);
    setReport({ status: "loading" });
    // Scroll to report section
    setTimeout(() => document.getElementById("report-section")?.scrollIntoView({ behavior: "smooth" }), 100);
    try {
      const res = await api.get(`/video/report/${id}`);
      setReport(res.data);
    } catch (err) {
      setReport({ status: "failed", errorMessage: "Failed to load report" });
    }
  };

  const deleteReport = async (id) => {
    if (!confirm("Delete this report?")) return;
    
    try {
      await api.delete(`/video/report/${id}`);
      loadMyReports();
      if (reportId === id) {
        setReportId(null);
        setReport(null);
      }
    } catch (err) {
      alert("Failed to delete report");
    }
  };

  const formatTimeRemaining = (expiresAt) => {
    const now = new Date();
    const expires = new Date(expiresAt);
    const diff = expires - now;
    
    if (diff <= 0) return "Expired";
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) return `${hours}h ${minutes}m remaining`;
    return `${minutes}m remaining`;
  };

  return (
    <Layout title="Video Analysis">
      <div className="video-analysis-page">
        {/* Upload Section */}
        <div className="card">
          <div className="section-title">📹 Upload Video for Analysis</div>
          <p style={{ color: "var(--muted)", marginBottom: "1rem" }}>
            Upload a video (1 minute - 5 minutes) to get instant AI feedback on your speaking skills.
            Supported formats: MP4, MOV, AVI, WEBM, MPEG, 3GP, FLV, WMV. File size: Any size up to 350MB. Reports are stored for 12 hours only.
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
            
            {file && (
              <div style={{ color: "var(--muted)", marginBottom: "1rem" }}>
                Selected: {file.name} ({(file.size / (1024 * 1024)).toFixed(2)} MB)
                {file.size < 1024 * 1024 && <span style={{ color: "var(--success)" }}> ✓ Small file - faster processing!</span>}
              </div>
            )}

            <button
              className="btn-primary"
              onClick={handleUpload}
              disabled={!file || uploading}
              style={{ width: "100%" }}
            >
              {uploading ? "Uploading..." : "Upload & Analyze"}
            </button>
          </div>

          {error && (
            <div className="error-box" style={{ marginTop: "1rem" }}>
              <p>{error}</p>
            </div>
          )}
        </div>

        {/* Current Report Status */}
        {report && (
          <div id="report-section" className="card" style={{ marginTop: "1rem" }}>
            <div className="section-title">
              {report.status === "loading" && "⏳ Loading..."}
              {report.status === "processing" && "⏳ Processing..."}
              {report.status === "completed" && "✅ Analysis Complete"}
              {report.status === "failed" && "❌ Analysis Failed"}
            </div>

            {(report.status === "loading" || report.status === "processing") && (
              <div className="spinner-wrap">
                <div className="spinner" />
                <p style={{ color: "var(--muted)" }}>
                  {report.status === "loading" ? "Loading report…" : (progressStage || "Uploading and preparing video…")}
                </p>
                {report.status === "processing" && (
                  <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: "0.5rem" }}>
                    This usually takes 2-3 minutes
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
              <div className="report-content">
                {/* Scores Grid */}
                <div className="stat-grid" style={{ marginBottom: "1.5rem" }}>
                  <div className="stat-card">
                    <div className="stat-icon">🗣️</div>
                    <div className="stat-value">{report.analysis.fluency}/10</div>
                    <div className="stat-label">Fluency</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon">📚</div>
                    <div className="stat-value">{report.analysis.grammar}/10</div>
                    <div className="stat-label">Grammar</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon">🔥</div>
                    <div className="stat-value">{report.analysis.confidence}/10</div>
                    <div className="stat-label">Confidence</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon">🧠</div>
                    <div className="stat-value">{report.analysis.vocabulary}/10</div>
                    <div className="stat-label">Vocabulary</div>
                  </div>
                </div>

                {/* Visual Scores (if available) */}
                {report.analysis.eyeContact && (
                  <div className="stat-grid" style={{ marginBottom: "1.5rem" }}>
                    <div className="stat-card">
                      <div className="stat-icon">👁️</div>
                      <div className="stat-value">{report.analysis.eyeContact}/10</div>
                      <div className="stat-label">Eye Contact</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-icon">🧍</div>
                      <div className="stat-value">{report.analysis.bodyLanguage}/10</div>
                      <div className="stat-label">Body Language</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-icon">😊</div>
                      <div className="stat-value">{report.analysis.facialExpression}/10</div>
                      <div className="stat-label">Expression</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-icon">✨</div>
                      <div className="stat-value">{report.analysis.overallPresence}/10</div>
                      <div className="stat-label">Presence</div>
                    </div>
                  </div>
                )}

                {/* Overall Comment */}
                {report.analysis.overallComment && (
                  <div className="feedback-section">
                    <h3>📝 Overall Feedback</h3>
                    <p>{report.analysis.overallComment}</p>
                  </div>
                )}

                {/* Strong Points */}
                {report.analysis.strongPoints?.length > 0 && (
                  <div className="feedback-section">
                    <h3>✅ What You Did Well</h3>
                    <ul>
                      {report.analysis.strongPoints.map((point, i) => (
                        <li key={i}>{point}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Suggestions */}
                {report.analysis.suggestions?.length > 0 && (
                  <div className="feedback-section">
                    <h3>💡 Speaking Tips</h3>
                    <ul>
                      {report.analysis.suggestions.map((tip, i) => (
                        <li key={i}>{tip}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Visual Suggestions */}
                {report.analysis.visualSuggestions?.length > 0 && (
                  <div className="feedback-section">
                    <h3>🎬 Presentation Tips</h3>
                    <ul>
                      {report.analysis.visualSuggestions.map((tip, i) => (
                        <li key={i}>{tip}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Stats */}
                {report.analysis.stats && (
                  <div className="feedback-section">
                    <h3>📊 Statistics</h3>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "1rem" }}>
                      {report.analysis.stats.duration && (
                        <div>
                          <strong>Duration:</strong> {report.analysis.stats.duration}
                        </div>
                      )}
                      {report.analysis.stats.wpm && (
                        <div>
                          <strong>Pace:</strong> {report.analysis.stats.wpm} wpm
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div style={{ marginTop: "1.5rem", padding: "1rem", background: "var(--bg-secondary)", borderRadius: "8px", color: "var(--muted)", fontSize: "0.9rem" }}>
                  ⏰ This report will be automatically deleted {formatTimeRemaining(report.expiresAt)}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Recent Reports */}
        {myReports.length > 0 && (
          <div className="card" style={{ marginTop: "1rem" }}>
            <div className="section-title">📋 Recent Reports (Last 12 Hours)</div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Submitted</th>
                    <th>File</th>
                    <th>Status</th>
                    <th>Expires</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {myReports.map((r) => (
                    <tr key={r._id}>
                      <td style={{ color: "var(--muted)" }}>
                        {new Date(r.submittedAt).toLocaleString("en-IN", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td>{r.videoFileName}</td>
                      <td>
                        {r.status === "processing" && "⏳ Processing"}
                        {r.status === "completed" && "✅ Ready"}
                        {r.status === "failed" && "❌ Failed"}
                      </td>
                      <td style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
                        {formatTimeRemaining(r.expiresAt)}
                      </td>
                      <td>
                        <button
                          className="btn-secondary"
                          onClick={() => viewReport(r._id)}
                          disabled={r.status !== "completed"}
                          style={{ marginRight: "0.5rem" }}
                        >
                          View
                        </button>
                        <button
                          className="btn-danger"
                          onClick={() => deleteReport(r._id)}
                        >
                          Delete
                        </button>
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
