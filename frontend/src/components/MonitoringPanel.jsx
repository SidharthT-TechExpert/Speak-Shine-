import { useState, useEffect } from "react";
import api from "../api/client.js";

export default function MonitoringPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const load = async () => {
    try {
      const res = await api.get("/monitoring");
      setData(res.data);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to load monitoring data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <div className="spinner-wrap"><div className="spinner"/><p style={{color:"var(--muted)"}}>Loading…</p></div>;
  if (error) return <div className="error-box"><p>{error}</p><button className="btn-primary" style={{marginTop:"0.75rem"}} onClick={load}>Retry</button></div>;
  if (!data) return null;

  const { system, videos, queue, api: apiStats, activeUsers } = data;
  const cpuColor = system.cpuPercent > 80 ? "#f87171" : system.cpuPercent > 60 ? "#fbbf24" : "#4ade80";
  const memColor = system.memPercent > 85 ? "#f87171" : system.memPercent > 65 ? "#fbbf24" : "#4ade80";
  const isIdle = videos.processing === 0 && videos.queued === 0;

  return (
    <div style={{display:"grid",gap:"1rem"}}>

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:"0.5rem"}}>
        <div className="section-title" style={{margin:0}}>🖥️ System Monitor</div>
        <div style={{display:"flex",alignItems:"center",gap:"0.75rem"}}>
          <div style={{display:"flex",alignItems:"center",gap:"0.4rem"}}>
            <span style={{width:7,height:7,borderRadius:"50%",background:"#4ade80",display:"inline-block",boxShadow:"0 0 6px #4ade80"}}/>
            <span style={{color:"var(--muted)",fontSize:"0.78rem"}}>
              {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}` : "Live"}
            </span>
          </div>
          <button className="btn-secondary" style={{padding:"0.3rem 0.8rem",fontSize:"0.8rem"}} onClick={load}>↻ Refresh</button>
        </div>
      </div>

      {/* Row 1: 3 stat tiles */}
      <div className="grid-cols-3">
        <MonStat icon="👥" label="Active Users" value={activeUsers} accent="#7c6fff" />
        <MonStat icon="✅" label="Done Today" value={videos.completedToday} accent="#4ade80" />
        <MonStat icon="❌" label="Failed Today" value={videos.failedToday} accent={videos.failedToday > 0 ? "#f87171" : "#4ade80"} />
      </div>

      {/* Row 2: 3 stat tiles */}
      <div className="grid-cols-3">
        <MonStat icon="🎬" label="Processing Now" value={isIdle ? "Idle" : `${videos.activeCount ?? videos.processing} / ${videos.maxConcurrent ?? queue?.maxConcurrent ?? 15}`} accent="#38bdf8" />
        <MonStat icon="⏱️" label="Avg Process Time" value={queue?.avgProcessingMin ? `${queue.avgProcessingMin} min` : "—"} accent="#fbbf24" />
        <MonStat icon="🌐" label="Avg API Response" value={apiStats.avgResponseMs ? `${apiStats.avgResponseMs}ms` : "—"} accent="#fb923c" />
      </div>

      {/* Server Resources */}
      <div className="card">
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1.25rem"}}>
          <span style={{fontWeight:600,fontSize:"0.95rem"}}>💻 Server Resources</span>
          <span style={{color:"var(--muted)",fontSize:"0.78rem"}}>Uptime: {system.uptimeHours}h</span>
        </div>
        <div style={{display:"grid",gap:"1.1rem"}}>
          <ResourceBar label="CPU" value={system.cpuPercent} unit="%" color={cpuColor} />
          <ResourceBar
            label="Memory"
            value={system.memPercent}
            unit="%"
            color={memColor}
            sublabel={`${system.memUsedMB} MB / ${system.memTotalMB} MB`}
          />
        </div>
      </div>

      {/* Queue + Errors — errors full width when there are security events */}
      <div className="grid-cols-2">

        {/* Queue */}
        <div className="card">
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem"}}>
            <span style={{fontWeight:600,fontSize:"0.95rem"}}>🚦 Video Queue</span>
            <span style={{fontSize:"0.72rem",background:"rgba(124,111,255,0.15)",color:"#7c6fff",borderRadius:99,padding:"0.15rem 0.55rem",fontWeight:600}}>
              ⚡ {videos.maxConcurrent ?? queue?.maxConcurrent ?? 15} concurrent
            </span>
          </div>
          {isIdle ? (
            <div style={{display:"flex",alignItems:"center",gap:"0.5rem",color:"#4ade80",fontWeight:500,fontSize:"0.9rem"}}>
              <span style={{fontSize:"1.1rem"}}>✅</span> Queue empty — all slots free
            </div>
          ) : (
            <div style={{display:"grid",gap:"0.6rem",fontSize:"0.88rem"}}>
              <QueueRow
                label="Active now"
                value={`${videos.activeCount ?? (videos.activeJobId ? 1 : 0)} / ${videos.maxConcurrent ?? queue?.maxConcurrent ?? 15}`}
                valueColor="#fbbf24"
              />
              <QueueRow label="Waiting" value={`${videos.queued} video${videos.queued !== 1 ? "s" : ""}`} />
              <QueueRow label="Est. wait" value={queue?.avgProcessingMin ? `~${queue.avgProcessingMin} min` : "~2.5 min"} />
            </div>
          )}
          <div className="grid-cols-2" style={{marginTop:"1rem",paddingTop:"0.75rem",borderTop:"1px solid var(--border)",gap:"0.5rem",fontSize:"0.82rem",color:"var(--muted)"}}>
            <span>Total processed: <strong style={{color:"var(--text)"}}>{queue?.totalProcessed || 0}</strong></span>
            <span>Total failed: <strong style={{color: (queue?.totalFailed || 0) > 0 ? "#f87171" : "var(--text)"}}>{queue?.totalFailed || 0}</strong></span>
          </div>
        </div>

        {/* Errors */}
        <div className="card">
          <div style={{fontWeight:600,fontSize:"0.95rem",marginBottom:"1rem"}}>
            ⚠️ Errors Today
            {(queue?.errorsToday || 0) > 0 && (
              <span style={{marginLeft:"0.5rem",background:"rgba(248,113,113,0.15)",color:"#f87171",borderRadius:99,padding:"0.1rem 0.5rem",fontSize:"0.75rem"}}>
                {queue.errorsToday}
              </span>
            )}
          </div>
          {!queue?.recentErrors || queue.recentErrors.length === 0 ? (
            <div style={{display:"flex",alignItems:"center",gap:"0.5rem",color:"#4ade80",fontWeight:500,fontSize:"0.9rem"}}>
              <span style={{fontSize:"1.1rem"}}>✅</span> No errors today
            </div>
          ) : (
            <div style={{display:"grid",gap:"0.5rem",maxHeight:320,overflowY:"auto"}}>
              {(queue?.recentErrors || []).map((e, i) => (
                <div key={i} style={{
                  background: e.type?.includes("Virus") || e.type?.includes("Content") || e.type?.includes("Codec")
                    ? "rgba(251,146,60,0.07)" : "rgba(248,113,113,0.07)",
                  border: `1px solid ${e.type?.includes("Virus") || e.type?.includes("Content") || e.type?.includes("Codec")
                    ? "rgba(251,146,60,0.25)" : "rgba(248,113,113,0.18)"}`,
                  borderRadius: 10,
                  padding: "0.65rem 0.85rem",
                }}>
                  {/* Top row: type badge + time */}
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"0.35rem",gap:"0.5rem",flexWrap:"wrap"}}>
                    <span style={{
                      fontSize:"0.72rem", fontWeight:700, padding:"0.15rem 0.5rem",
                      borderRadius:99,
                      background: e.type?.includes("Virus") || e.type?.includes("Content") || e.type?.includes("Codec")
                        ? "rgba(251,146,60,0.18)" : "rgba(248,113,113,0.15)",
                      color: e.type?.includes("Virus") || e.type?.includes("Content") || e.type?.includes("Codec")
                        ? "#fb923c" : "#f87171",
                    }}>
                      {e.type || "⚙️ Processing"}
                    </span>
                    <span style={{color:"var(--muted)",fontSize:"0.72rem",whiteSpace:"nowrap"}}>
                      {new Date(e.at).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}
                    </span>
                  </div>
                  {/* User info */}
                  <div style={{display:"flex",alignItems:"center",gap:"0.5rem",marginBottom:"0.3rem"}}>
                    <span style={{fontSize:"0.8rem",fontWeight:600,color:"var(--text)"}}>
                      👤 {e.userName || "Unknown"}
                    </span>
                    {e.phone && e.phone !== "—" && (
                      <span style={{fontSize:"0.75rem",color:"var(--muted)"}}>· {e.phone}</span>
                    )}
                  </div>
                  {/* Error message */}
                  <div style={{color:"var(--muted)",fontSize:"0.78rem",lineHeight:1.5}}>{e.error}</div>
                  {/* Report ID */}
                  <div style={{color:"rgba(255,255,255,0.2)",fontSize:"0.68rem",marginTop:"0.25rem"}}>
                    ID: {String(e.reportId).slice(-8)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// ── Small helpers ────────────────────────────────────────────────────────────
function MonStat({ icon, label, value, accent }) {
  return (
    <div style={{
      background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,
      padding:"1rem",display:"flex",flexDirection:"column",gap:"0.35rem",
      borderTop:`3px solid ${accent}`,
    }}>
      <div style={{fontSize:"1.4rem",lineHeight:1}}>{icon}</div>
      <div style={{fontSize:"0.72rem",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.05em",fontWeight:600}}>{label}</div>
      <div style={{fontSize:"1.35rem",fontWeight:700,color:"var(--text)",lineHeight:1}}>{value}</div>
    </div>
  );
}

function ResourceBar({ label, value, unit, color, sublabel }) {
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:"0.4rem"}}>
        <span style={{fontSize:"0.85rem",color:"var(--muted)"}}>{label}</span>
        <div style={{textAlign:"right"}}>
          <span style={{fontWeight:700,color,fontSize:"0.9rem"}}>{value}{unit}</span>
          {sublabel && <span style={{color:"var(--muted)",fontSize:"0.75rem",marginLeft:"0.4rem"}}>({sublabel})</span>}
        </div>
      </div>
      <div style={{background:"rgba(255,255,255,0.06)",borderRadius:99,height:8,overflow:"hidden"}}>
        <div style={{height:"100%",width:`${Math.min(value,100)}%`,background:color,borderRadius:99,transition:"width 0.6s ease",boxShadow:`0 0 8px ${color}55`}}/>
      </div>
    </div>
  );
}

function QueueRow({ label, value, valueColor }) {
  return (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <span style={{color:"var(--muted)"}}>{label}</span>
      <span style={{fontWeight:600,color:valueColor||"var(--text)"}}>{value}</span>
    </div>
  );
}

// ── Manual Questions Panel ────────────────────────────────────────────────────
