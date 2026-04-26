import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import api from "../api/client.js";

export default function VideoAnalysis() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [reportId, setReportId] = useState(null);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [myReports, setMyReports] = useState([]);
  const navigate = useNavigate();

  // Load user's recent reports on mount
  useEffect(() => {
    loadMyReports();
  }, []);

  // Poll for report status if we have a reportId
  useEffect(() => {
    if (!reportId) return;

    const interval = setInterval(async () => {
      try {
        const res = await api.get(`/video/report/${reportId}`);
        setReport(res.data);
        
        if (res.data.status === "completed" || res.data.status === "failed") {
          clearInterval(interval);
          loadMyReports(); // Refresh the list
        }
      } catch (err) {
        console.error("Poll error:", err);
        clearInterval(interval);
      }
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(interval);
  }, [reportId]);

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

  const viewReport = (id) => {
    setReportId(id);
    setReport(null);
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
            Upload a video (30 seconds - 5 minutes) to get instant AI feedback on your speaking skills.
            Supported formats: MP4, MOV, AVI, WEBM, MPEG, 3GP, FLV, WMV. Max file size: 350MB. Reports are stored for 12 hours only.
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
          <div className="card" style={{ marginTop: "1rem" }}>
            <div className="section-title">
              {report.status === "processing" && "⏳ Processing..."}
              {report.status === "completed" && "✅ Analysis Complete"}
              {report.status === "failed" && "❌ Analysis Failed"}
            </div>

            {report.status === "processing" && (
              <div className="spinner-wrap">
                <div className="spinner" />
                <p style={{ color: "var(--muted)" }}>
                  Analyzing your video... This usually takes 2-3 minutes.
                </p>
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
