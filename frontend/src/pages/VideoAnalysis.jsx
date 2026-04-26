import { useState, useEffect, useRef, useCallback } from "react";
import Layout from "../components/Layout.jsx";
import Modal from "../components/Modal.jsx";
import api from "../api/client.js";

// ── Mode toggle ──────────────────────────────────────────────────────────────
// "upload"  → existing file-upload flow
// "record"  → new live-record flow

export default function VideoAnalysis() {
  const [mode, setMode] = useState("upload"); // "upload" | "record"

  // shared state
  const [reportId, setReportId]       = useState(null);
  const [report, setReport]           = useState(null);
  const [progressStage, setProgressStage] = useState("");
  const [myReports, setMyReports]     = useState([]);
  const [modal, setModal]             = useState(null);

  useEffect(() => { loadMyReports(); }, []);

  // SSE for real-time progress
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
          ? <UploadCard onAnalysisStarted={onAnalysisStarted} />
          : <RecordCard  onAnalysisStarted={onAnalysisStarted} />
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
              <div className="spinner-wrap">
                <div className="spinner" />
                <p style={{ color: "var(--muted)" }}>
                  {report.status === "loading" ? "Loading report…" : (progressStage || "Starting analysis…")}
                </p>
                {report.status === "processing" && (
                  <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: "0.5rem" }}>Usually takes 2–3 minutes</p>
                )}
              </div>
            )}
            {report.status === "failed" && (
              <div className="error-box"><p>{report.errorMessage || "Analysis failed. Please try again."}</p></div>
            )}
            {report.status === "completed" && report.analysis && (
              <ReportView analysis={report.analysis} expiresAt={report.expiresAt} formatTimeRemaining={formatTimeRemaining} />
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
                          disabled={r.status !== "completed"} style={{ marginRight: "0.5rem" }}>View</button>
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

// ── Upload Card (original flow) ──────────────────────────────────────────────
function UploadCard({ onAnalysisStarted }) {
  const [file, setFile]           = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress]   = useState(0);
  const [error, setError]         = useState(null);

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 350 * 1024 * 1024) { setError("File size must be less than 350MB"); return; }
    setFile(f); setError(null);
  };

  const handleUpload = async () => {
    if (!file) { setError("Please select a video file"); return; }
    setUploading(true); setProgress(0); setError(null);
    try {
      const formData = new FormData();
      formData.append("video", file);
      const res = await api.post("/video/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (e) => { if (e.total) setProgress(Math.round((e.loaded / e.total) * 100)); },
        timeout: 0,
      });
      onAnalysisStarted(res.data.reportId);
      setFile(null);
      document.getElementById("video-input").value = "";
    } catch (err) {
      setError(err.response?.data?.error || "Upload failed");
    } finally {
      setUploading(false); setProgress(0);
    }
  };

  return (
    <div className="card">
      <div className="section-title">📹 Upload Video for Analysis</div>
      <p style={{ color: "var(--muted)", marginBottom: "1rem" }}>
        Minimum 1 minute · Max 5 minutes · Up to 350MB · MP4, MOV, AVI, WEBM, 3GP · Reports stored 12 hours
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
              <span>{progress < 100 ? "Uploading…" : "Processing upload…"}</span>
              <span>{progress}%</span>
            </div>
            <div style={{ background: "var(--bg)", borderRadius: "6px", height: "8px", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${progress}%`, background: "var(--primary)", borderRadius: "6px", transition: "width 0.3s ease" }} />
            </div>
          </div>
        )}
        <button className="btn-primary" onClick={handleUpload} disabled={!file || uploading} style={{ width: "100%" }}>
          {uploading ? `Uploading ${progress}%…` : "Upload & Analyze"}
        </button>
      </div>
      {error && <div className="error-box" style={{ marginTop: "1rem" }}><p>{error}</p></div>}
    </div>
  );
}

// ── Record Card ──────────────────────────────────────────────────────────────
// States: "setup" → "countdown" → "recording" → "preview" → "uploading"

function RecordCard({ onAnalysisStarted }) {
  const [step, setStep]             = useState("setup"); // setup|countdown|recording|preview|uploading
  const [cameras, setCameras]       = useState([]);
  const [mics, setMics]             = useState([]);
  const [camId, setCamId]           = useState("");
  const [micId, setMicId]           = useState("");
  const [countdown, setCountdown]   = useState(3);
  const [elapsed, setElapsed]       = useState(0);   // seconds recorded
  const [question, setQuestion]     = useState(null);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [error, setError]           = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isPaused, setIsPaused]     = useState(false);

  const liveVideoRef    = useRef(null);
  const previewVideoRef = useRef(null);
  const streamRef       = useRef(null);
  const recorderRef     = useRef(null);
  const chunksRef       = useRef([]);
  const timerRef        = useRef(null);
  const countdownRef    = useRef(null);
  const pendingBlobRef  = useRef(null); // holds blob until preview video mounts

  const MAX_SECONDS = 300; // 5 min hard cap

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

  // Fetch today's question from dashboard (same one sent to WhatsApp group)
  useEffect(() => {
    api.get("/dashboard").then(r => {
      const t = r.data?.today;
      if (t?.question) {
        setQuestion({ question: t.question, topic: t.topic, category: t.topic, posterImage: t.posterImage });
      }
    }).catch(() => {});
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
  }, []);

  const startCountdown = async () => {
    setError(null);
    try {
      const constraints = {
        video: {
          ...(camId ? { deviceId: { exact: camId } } : {}),
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 360 },
          aspectRatio: { ideal: 16 / 9 },
          frameRate: { ideal: 30, min: 15 },
          facingMode: "user",
        },
        audio: {
          ...(micId ? { deviceId: { exact: micId } } : {}),
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
        },
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      // Don't touch liveVideoRef here — it doesn't exist yet.
      // The useEffect above will attach it once the step re-renders.
      setStep("countdown");
      setCountdown(3);
      let c = 3;
      countdownRef.current = setInterval(() => {
        c--;
        setCountdown(c);
        if (c <= 0) { clearInterval(countdownRef.current); startRecording(stream); }
      }, 1000);
    } catch (err) {
      setError("Could not access camera/mic: " + err.message);
    }
  };

  const startRecording = (stream) => {
    chunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus"
      : MediaRecorder.isTypeSupported("video/webm")
      ? "video/webm"
      : "video/mp4";

    const recorder = new MediaRecorder(stream, { mimeType });
    recorderRef.current = recorder;
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      pendingBlobRef.current = blob; // store for useEffect to pick up after render
      setRecordedBlob(blob);
      setStep("preview");
      cleanup();
    };
    recorder.start(1000); // collect chunks every 1s
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
      recorderRef.current.stop();
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
    setStep("uploading");
    setUploadProgress(0);
    setError(null);
    try {
      const ext = recordedBlob.type.includes("mp4") ? "mp4" : "webm";
      const file = new File([recordedBlob], `recording.${ext}`, { type: recordedBlob.type });
      const formData = new FormData();
      formData.append("video", file);
      const res = await api.post("/video/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (e) => { if (e.total) setUploadProgress(Math.round((e.loaded / e.total) * 100)); },
        timeout: 0,
      });
      onAnalysisStarted(res.data.reportId);
      setStep("setup");
      setRecordedBlob(null);
      setElapsed(0);
    } catch (err) {
      setError(err.response?.data?.error || "Upload failed");
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
            Minimum 1 min · Max 5 min · Speak clearly to the camera
          </p>

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

          {/* Today's question + poster */}
          {question && (
            <div style={{ display: "grid", gridTemplateColumns: question.posterImage ? "1fr 200px" : "1fr", gap: "1rem", marginBottom: "1.25rem", alignItems: "start" }}>
              <div className="today-card" style={{ margin: 0 }}>
                <div className="today-label">📅 Today's Question</div>
                {question.topic && (
                  <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginBottom: "0.4rem", fontWeight: 500 }}>
                    Topic: <span style={{ color: "var(--text2)" }}>{question.topic}</span>
                  </div>
                )}
                <div className="today-q">{question.question}</div>
                {question.category && <span className="today-topic">{question.category}</span>}
              </div>
              {question.posterImage && (
                <img src={question.posterImage} alt="Today's poster"
                  style={{ width: "100%", borderRadius: "10px", border: "1px solid var(--border)", objectFit: "contain" }} />
              )}
            </div>
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
            style={{ width: "100%", maxWidth: "480px", borderRadius: "12px", background: "#000", aspectRatio: "16/9", objectFit: "cover" }} />
          <div style={{ fontSize: "5rem", fontWeight: 900, color: "var(--primary)", lineHeight: 1 }}>{countdown}</div>
          <p style={{ color: "var(--muted)" }}>Get ready…</p>
        </div>
      )}

      {/* ── RECORDING ── */}
      {step === "recording" && (
        <div className="rec-layout" style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "1rem", alignItems: "start" }}>
          {/* Camera feed */}
          <div style={{ position: "relative" }}>
            <video ref={liveVideoRef} autoPlay muted playsInline
              style={{ width: "100%", borderRadius: "12px", background: "#000", aspectRatio: "16/9", objectFit: "cover", display: "block" }} />
            {/* REC badge */}
            <div style={{
              position: "absolute", top: "12px", left: "12px",
              background: isPaused ? "rgba(245,158,11,0.9)" : "rgba(248,113,113,0.9)",
              color: "#fff", padding: "0.25rem 0.65rem", borderRadius: "99px",
              fontSize: "0.75rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.4rem",
            }}>
              <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#fff",
                animation: isPaused ? "none" : "blink 1s infinite" }} />
              {isPaused ? "PAUSED" : "REC"} {fmtTime(elapsed)}
            </div>
            {/* Timer bar */}
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "4px", background: "rgba(255,255,255,0.15)", borderRadius: "0 0 12px 12px" }}>
              <div style={{ height: "100%", width: `${(elapsed / MAX_SECONDS) * 100}%`,
                background: elapsed > 240 ? "var(--danger)" : "var(--primary)", borderRadius: "inherit", transition: "width 1s linear" }} />
            </div>
          </div>

          {/* Question panel */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {question && (
              <div style={{ background: "var(--card2)", border: "1px solid var(--border2)", borderRadius: "12px", padding: "1rem" }}>
                <div style={{ fontSize: "0.65rem", color: "var(--primary)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.4rem" }}>
                  📅 Today's Question
                </div>
                {question.topic && (
                  <div style={{ fontSize: "0.7rem", color: "var(--muted)", marginBottom: "0.5rem" }}>
                    Topic: <span style={{ color: "var(--text2)", fontWeight: 600 }}>{question.topic}</span>
                  </div>
                )}
                <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text)", lineHeight: 1.5, marginBottom: "0.6rem" }}>
                  {question.question}
                </div>
                {question.category && (
                  <span style={{ fontSize: "0.65rem", background: "rgba(124,111,255,0.18)", color: "var(--primary)", padding: "0.2rem 0.55rem", borderRadius: "99px", border: "1px solid rgba(124,111,255,0.25)" }}>
                    {question.category}
                  </span>
                )}
              </div>
            )}

            {/* Poster thumbnail during recording */}
            {question?.posterImage && (
              <img src={question.posterImage} alt="Today's poster"
                style={{ width: "100%", borderRadius: "10px", border: "1px solid var(--border)", objectFit: "contain" }} />
            )}

            <div style={{ background: "var(--card2)", border: "1px solid var(--border2)", borderRadius: "12px", padding: "1rem" }}>
              <div style={{ fontSize: "0.65rem", color: "var(--success)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.5rem" }}>
                💡 Tips
              </div>
              <ul style={{ paddingLeft: "1.1rem", margin: 0, fontSize: "0.82rem", color: "var(--text2)", lineHeight: 1.7 }}>
                <li>Speak clearly and at a steady pace</li>
                <li>Look directly at the camera</li>
                <li>Sit up straight, good posture</li>
                <li>Aim for 1–3 minutes</li>
              </ul>
            </div>

            <div style={{ textAlign: "center", fontSize: "0.82rem", color: elapsed > 240 ? "var(--danger)" : "var(--muted)" }}>
              {fmtTime(elapsed)} / {fmtTime(MAX_SECONDS)}
            </div>

            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button onClick={togglePause} style={{
                flex: 1, padding: "0.65rem", borderRadius: "10px", fontWeight: 600, fontSize: "0.875rem",
                background: isPaused ? "rgba(34,211,160,0.15)" : "rgba(245,158,11,0.15)",
                border: `1px solid ${isPaused ? "rgba(34,211,160,0.3)" : "rgba(245,158,11,0.3)"}`,
                color: isPaused ? "var(--success)" : "var(--warning)", cursor: "pointer",
              }}>
                {isPaused ? "▶ Resume" : "⏸ Pause"}
              </button>
              <button onClick={stopRecording} style={{
                flex: 1, padding: "0.65rem", borderRadius: "10px", fontWeight: 600, fontSize: "0.875rem",
                background: "rgba(248,113,113,0.15)", border: "1px solid rgba(248,113,113,0.3)",
                color: "var(--danger)", cursor: "pointer",
              }}>
                ⏹ Stop
              </button>
            </div>
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
          <video ref={previewVideoRef} controls playsInline
            style={{ width: "100%", borderRadius: "12px", background: "#000", aspectRatio: "16/9", marginBottom: "1rem" }} />
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button className="btn-secondary" onClick={retake} style={{ flex: 1 }}>🔄 Retake</button>
            <button className="btn-primary" onClick={submitRecording} disabled={elapsed < 60} style={{ flex: 2 }}>
              🚀 Submit for Analysis
            </button>
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
