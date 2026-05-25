import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import StatCard from "../components/StatCard.jsx";
import Modal from "../components/Modal.jsx";
import RoleSelector from "../components/RoleSelector.jsx";
import SubmissionControls from "../components/SubmissionControls.jsx";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import { useToast } from "../components/Toast.jsx";
import api from "../api/client.js";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";

const CATS = ["Daily Life","Opinion","Personal Experience","English Growth","Future Goals","Fun Topic","Free Talk"];
const PIE_COLORS = ["#7c6fff","#4ade80","#fbbf24","#ff6b9d","#38bdf8","#fb923c","#a78bfa"];
const tt = { background:"#16162a", border:"1px solid #252545", borderRadius:10, fontSize:12 };
const TABS = [{id:"overview",l:"📊 Overview"},{id:"today",l:"📅 Today"},{id:"users",l:"👥 Users"},{id:"registrations",l:"📋 Registrations"},{id:"reports",l:"📈 Reports"},{id:"fines",l:"💸 Fines"},{id:"submissions",l:"📝 Submissions"},{id:"questions",l:"❓ Questions"},{id:"manual-questions",l:"📝 Manual Questions"},{id:"live",l:"🎥 Live Sessions"},{id:"monitoring",l:"🖥️ Monitor"},{id:"settings",l:"⚙️ Settings"}];

export default function AdminDashboard() {
  const [tab, setTab] = useState("overview");
  const [dash, setDash] = useState(null);
  const [users, setUsers] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [weekly, setWeekly] = useState([]);
  const [monthly, setMonthly] = useState([]);
  const [qForm, setQForm] = useState({ category:"", topic:"", question:"" });
  const [editQ, setEditQ] = useState(null);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState(null);
  const [search, setSearch] = useState("");
  const [qSearch, setQSearch] = useState("");
  const [qActionBusy, setQActionBusy] = useState(""); // "generating" | "cleaning" | ""
  const [qCat, setQCat] = useState("");
  const [modal, setModal] = useState(null);
  const [fineInput, setFineInput] = useState("");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [settings, setSettings] = useState({ posterSendTime: "08:00", questionGenerateTime: "07:00" });
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [resetting, setResetting] = useState("");
  const [publishQ, setPublishQ] = useState(null); // selected question for webapp publish
  const [publishCustom, setPublishCustom] = useState({ topic:"", question:"", category:"" }); // manual entry
  const [newMember, setNewMember] = useState({ name:"", phone:"", password:"", role:"user" });
  const [newMemberLoading, setNewMemberLoading] = useState(false);
  // Admin OTP verification state for adding members
  const [adminOtpStep, setAdminOtpStep] = useState("idle"); // "idle" | "sent" | "verified"
  const [adminOtp, setAdminOtp] = useState("");
  const [adminOtpLoading, setAdminOtpLoading] = useState(false);
  const [adminOtpError, setAdminOtpError] = useState("");
  const [adminActionToken, setAdminActionToken] = useState("");
  const [pendingRegs, setPendingRegs] = useState([]);
  const [pendingRegsLoading, setPendingRegsLoading] = useState(false);

  // Lazy loading flags to track what's been loaded
  const [dataLoaded, setDataLoaded] = useState({
    dashboard: false,
    users: false,
    questions: false,
    reports: false,
    settings: false,
  });

  // Load only essential data on mount (dashboard overview)
  const loadInitial = async () => {
    setLoading(true);
    try {
      // Load dashboard + questions + weekly + users together for a complete overview
      const [d, q, w, u] = await Promise.all([
        api.get("/dashboard"),
        api.get("/questions?limit=200"),
        api.get("/dashboard/report/weekly"),
        api.get("/users"),
      ]);
      setDash(d.data);
      setDataLoaded(prev => ({ ...prev, dashboard: true }));
      if (q.data.questions) {
        setQuestions(q.data.questions);
        setDataLoaded(prev => ({ ...prev, questions: true }));
      }
      setWeekly(w.data);
      setUsers(u.data);
      setDataLoaded(prev => ({ ...prev, reports: true, users: true }));
    } catch (err) {
      console.error("Failed to load dashboard:", err);
      try {
        const d = await api.get("/dashboard");
        setDash(d.data);
        setDataLoaded(prev => ({ ...prev, dashboard: true }));
      } catch {}
      msg(err?.response?.data?.error || "Failed to load dashboard", "danger");
    } finally {
      setLoading(false);
    }
  };

  // Load users data (for Users, Today, Submissions tabs)
  const loadUsers = async () => {
    if (dataLoaded.users) return; // Already loaded
    try {
      const u = await api.get("/users");
      setUsers(u.data);
      setDataLoaded(prev => ({ ...prev, users: true }));
    } catch (err) {
      console.error("Failed to load users:", err);
      msg("Failed to load users", "danger");
    }
  };

  // Load questions data (for Questions tab)
  const loadQuestions = async () => {
    if (dataLoaded.questions) return; // Already loaded
    try {
      const q = await api.get("/questions?limit=50"); // Reduced from 200 to 50
      setQuestions(q.data.questions);
      setDataLoaded(prev => ({ ...prev, questions: true }));
    } catch (err) {
      console.error("Failed to load questions:", err);
      msg("Failed to load questions", "danger");
    }
  };

  // Force-refresh questions regardless of dataLoaded flag
  const refreshQuestions = async () => {
    try {
      const q = await api.get("/questions?limit=50");
      setQuestions(q.data.questions);
      setDataLoaded(prev => ({ ...prev, questions: true }));
    } catch (err) {
      console.error("Failed to refresh questions:", err);
      msg("Failed to refresh questions", "danger");
    }
  };

  // Load reports data (for Reports tab)
  const loadReports = async () => {
    if (dataLoaded.reports) return; // Already loaded
    try {
      const [w, m] = await Promise.all([
        api.get("/dashboard/report/weekly"),
        api.get("/dashboard/report/monthly"),
      ]);
      setWeekly(w.data);
      setMonthly(m.data);
      setDataLoaded(prev => ({ ...prev, reports: true }));
    } catch (err) {
      console.error("Failed to load reports:", err);
      msg("Failed to load reports", "danger");
    }
  };

  // Load pending registrations
  const loadPendingRegs = async () => {
    setPendingRegsLoading(true);
    try {
      const r = await api.get("/auth/pending");
      setPendingRegs(r.data);
    } catch (err) {
      msg("Failed to load pending registrations", "danger");
    } finally {
      setPendingRegsLoading(false);
    }
  };

  // Load settings data (for Settings tab)
  const loadSettings = async () => {
    if (dataLoaded.settings) return; // Already loaded
    try {
      const s = await api.get("/dashboard/settings");
      setSettings({
        posterSendTime: s.data.posterSendTime || "08:00",
        questionGenerateTime: s.data.questionGenerateTime || "07:00",
      });
      setDataLoaded(prev => ({ ...prev, settings: true }));
    } catch (err) {
      console.error("Failed to load settings:", err);
      msg("Failed to load settings", "danger");
    }
  };

  // Load initial data on mount
  useEffect(() => {
    loadInitial();
  }, []);

  // Load data based on active tab
  useEffect(() => {
    if (tab === "overview") {
      // Overview needs dashboard data (already loaded)
    } else if (tab === "today" || tab === "users" || tab === "submissions" || tab === "fines") {
      loadUsers();
    } else if (tab === "questions" || tab === "manual-questions") {
      loadQuestions();
    } else if (tab === "reports") {
      loadReports();
    } else if (tab === "registrations") {
      loadPendingRegs();
    } else if (tab === "settings") {
      loadSettings();
    }
  }, [tab]);

  const msg = (text, type="success") => { setFlash({text,type}); setTimeout(()=>setFlash(null),3000); };
  
  // Smart reload - only reload what's currently visible/needed
  const reload = async (dataTypes = []) => {
    const promises = [];
    
    if (dataTypes.includes('dashboard') || dataTypes.length === 0) {
      promises.push(api.get("/dashboard").then(d => setDash(d.data)));
    }
    if (dataTypes.includes('users') || dataTypes.length === 0) {
      promises.push(api.get("/users").then(u => setUsers(u.data)));
    }
    if (dataTypes.includes('questions')) {
      promises.push(api.get("/questions?limit=50").then(q => setQuestions(q.data.questions)));
    }
    if (dataTypes.includes('reports')) {
      promises.push(
        Promise.all([
          api.get("/dashboard/report/weekly"),
          api.get("/dashboard/report/monthly"),
        ]).then(([w, m]) => {
          setWeekly(w.data);
          setMonthly(m.data);
        })
      );
    }
    
    if (promises.length > 0) {
      await Promise.all(promises).catch(err => {
        console.error("Reload failed:", err);
      });
    }
  };
  
  const toggleUser = async (phone) => { 
    await api.patch(`/users/${phone}/toggle`); 
    msg("Status toggled"); 
    reload(['users']); // Only reload users
  };
  
  const viewStudentDetail = (user) => {
    setSelectedStudent(user);
    setTab("student-detail");
  };

  const handleSubmissionUpdate = (type, newValue) => {
    if (!selectedStudent) return;
    // Update the selected student's submission count
    setSelectedStudent(prev => ({
      ...prev,
      [`${type}Submissions`]: newValue
    }));
    // Also update in the users list
    setUsers(prev => prev.map(u => 
      u.phone === selectedStudent.phone 
        ? { ...u, [`${type}Submissions`]: newValue }
        : u
    ));
  };

  const deleteUser = async (phone) => {
    setModal({
      type: "danger", title: "Remove User",
      message: "This user will be permanently removed. Are you sure?",
      confirmText: "Remove",
      onConfirm: async () => { 
        setModal(null); 
        await api.delete(`/users/${phone}`); 
        msg("Removed","danger"); 
        reload(['users', 'dashboard']); // Reload users and dashboard stats
      },
    });
  };
  const adjustFine = (phone, cur) => {
    setFineInput("0");
    setModal({
      type: "confirm", title: "Adjust Fine",
      message: `Current fine: ₹${cur}. Enter amount to add (negative to deduct):`,
      confirmText: "Apply",
      isFineInput: true,
      phone,
    });
  };
  const resetFine = async (phone) => {
    setModal({
      type: "danger", title: "Reset Fine",
      message: "Reset this user's fine to ₹0?",
      confirmText: "Reset",
      onConfirm: async () => {
        setModal(null);
        const u = users.find(x=>x.phone===phone);
        if (!u) return;
        await api.patch(`/users/${phone}/fine`,{amount:-(u.fine||0)});
        msg("Fine reset"); 
        reload(['users', 'dashboard']); // Reload users and dashboard stats
      },
    });
  };
  const saveQ = async (e) => { 
    e.preventDefault(); 
    if(editQ){
      await api.patch(`/questions/${editQ._id}`,qForm);
      setEditQ(null);
      msg("Updated!");
    }else{
      await api.post("/questions",qForm);
      msg("Added!");
    } 
    setQForm({category:"",topic:"",question:""}); 
    reload(['questions']); // Only reload questions
  };
  const deleteQ = async (id) => {
    setModal({
      type: "danger", title: "Delete Question",
      message: "This question will be permanently deleted.",
      confirmText: "Delete",
      onConfirm: async () => { 
        setModal(null); 
        await api.delete(`/questions/${id}`); 
        msg("Deleted","danger"); 
        reload(['questions']); // Only reload questions
      },
    });
  };
  const startEdit = (q) => { setEditQ(q); setQForm({category:q.category,topic:q.topic,question:q.question}); window.scrollTo({top:0,behavior:"smooth"}); };

  const saveSettings = async (e) => {
    e.preventDefault();
    setSettingsSaving(true);
    try {
      await api.patch("/dashboard/settings", settings);
      msg("Schedule times saved! Bot will apply changes within 1 minute.");
    } catch (err) {
      msg(err?.response?.data?.error || "Failed to save settings", "danger");
    } finally {
      setSettingsSaving(false);
    }
  };

  const resetWeekly = () => {
    setModal({
      type: "danger", title: "Reset Weekly Submissions",
      message: "This will reset ALL users' weekly submission count and weekly fines to 0. Are you sure?",
      confirmText: "Reset Weekly",
      onConfirm: async () => {
        setModal(null);
        setResetting("weekly");
        try {
          await api.post("/users/reset/weekly");
          msg("Weekly submissions + fines reset for all users");
          reload(['users', 'dashboard', 'reports']); // Reload affected data
        } catch (err) {
          msg(err?.response?.data?.error || "Reset failed", "danger");
        } finally { setResetting(""); }
      },
    });
  };

  const resetMonthly = () => {
    setModal({
      type: "danger", title: "Reset Monthly Submissions",
      message: "This will reset ALL users' monthly submission count to 0. Are you sure?",
      confirmText: "Reset Monthly",
      onConfirm: async () => {
        setModal(null);
        setResetting("monthly");
        try {
          await api.post("/users/reset/monthly");
          msg("Monthly submissions reset for all users");
          reload(['users', 'dashboard', 'reports']); // Reload affected data
        } catch (err) {
          msg(err?.response?.data?.error || "Reset failed", "danger");
        } finally { setResetting(""); }
      },
    });
  };

  const filteredUsers = useMemo(()=>users.filter(u=>{const s=search.toLowerCase();return(u.registeredName||u.name||"").toLowerCase().includes(s)||(u.phone||"").includes(s)}),[users,search]);
  const filteredQ = useMemo(()=>questions.filter(q=>(qCat?q.category===qCat:true)&&(q.question.toLowerCase().includes(qSearch.toLowerCase())||q.topic.toLowerCase().includes(qSearch.toLowerCase()))),[questions,qSearch,qCat]);

  const pieSub = [{name:"Submitted",value:dash?.stats?.completed||0,color:"#4ade80"},{name:"Pending",value:dash?.stats?.pending||0,color:"#f87171"}];
  const catCount = questions.reduce((a,q)=>{a[q.category]=(a[q.category]||0)+1;return a},{});
  const catPie = Object.entries(catCount).map(([name,value])=>({name,value}));
  const fineBar = [...users].filter(u=>(u.fine||0)>0).sort((a,b)=>(b.fine||0)-(a.fine||0)).slice(0,10).map(u=>({name:(u.registeredName||u.name||"?").slice(0,8),fine:u.fine||0}));

  if (loading) return <Layout title="Admin Dashboard"><div className="spinner-wrap"><div className="spinner"/></div></Layout>;

  return (
    <Layout title="Admin Dashboard">
      {modal && (
        <Modal
          type={modal.type}
          title={modal.title}
          message={
            modal.isFineInput ? (
              <div>
                <p style={{ marginBottom: "0.75rem", color: "var(--muted)", fontSize: "0.9rem" }}>{modal.message}</p>
                <input
                  className="form-input"
                  type="number"
                  value={fineInput}
                  onChange={e => setFineInput(e.target.value)}
                  style={{ textAlign: "center", fontSize: "1.1rem" }}
                  autoFocus
                />
              </div>
            ) : modal.message
          }
          confirmText={modal.confirmText}
          onConfirm={modal.isFineInput ? async () => {
            if (isNaN(+fineInput)) return;
            setModal(null);
            await api.patch(`/users/${modal.phone}/fine`, { amount: +fineInput });
            msg(`Fine adjusted ₹${fineInput}`); 
            reload(['users', 'dashboard']); // Reload users and dashboard stats
          } : modal.onConfirm}
          onCancel={() => setModal(null)}
        />
      )}
      {flash && <div className={`flash ${flash.type}`}>{flash.text}</div>}

      <div className="stat-grid">
        <StatCard icon="👥" label="Total Users"     value={dash?.stats?.total||0}     color="#7c6fff"/>
        <StatCard icon="✅" label="Submitted Today" value={dash?.stats?.completed||0} color="#4ade80"/>
        <StatCard icon="❌" label="Pending Today"   value={dash?.stats?.pending||0}   color="#f87171"/>
        <StatCard icon="💸" label="Total Fines"     value={`₹${dash?.stats?.totalFines||0}`} color="#fbbf24"/>
      </div>

      <div className="tab-bar">
        {TABS.map(t=><button key={t.id} className={`tab-btn${tab===t.id?" active":""}`} onClick={()=>setTab(t.id)}>{t.l}</button>)}
        {selectedStudent&&<button className={`tab-btn${tab==="student-detail"?" active":""}`} onClick={()=>setTab("student-detail")}>👤 {(selectedStudent.registeredName||selectedStudent.name||"").slice(0,12)}</button>}
      </div>

      {/* OVERVIEW */}
      {tab==="overview" && (
        <>
          {/* ── Today's question banner ── */}
          {dash?.today?.question ? (
            <div style={{
              background: "linear-gradient(135deg, rgba(124,111,255,0.12), rgba(79,70,229,0.06))",
              border: "1px solid rgba(124,111,255,0.25)",
              borderRadius: 16, padding: "1rem 1.25rem",
              marginBottom: "1rem",
              display: "flex", alignItems: "flex-start", gap: "0.75rem",
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                background: "rgba(124,111,255,0.2)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "1.1rem",
              }}>📌</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "0.65rem", fontWeight: 700, color: "#a78bfa", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.3rem" }}>
                  Today's Question · {dash.today.category || dash.today.topic || "General"}
                </div>
                <div style={{ fontSize: "0.92rem", fontWeight: 600, color: "var(--text)", lineHeight: 1.45 }}>
                  {dash.today.question}
                </div>
              </div>
              <div style={{
                flexShrink: 0, fontSize: "0.72rem", fontWeight: 700,
                padding: "0.25rem 0.65rem", borderRadius: 20,
                background: "rgba(74,222,128,0.15)", color: "#4ade80",
                border: "1px solid rgba(74,222,128,0.3)",
              }}>✅ Live</div>
            </div>
          ) : (
            <div style={{
              background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.2)",
              borderRadius: 16, padding: "0.85rem 1.25rem",
              marginBottom: "1rem", fontSize: "0.85rem", color: "#fbbf24",
              display: "flex", alignItems: "center", gap: "0.5rem",
            }}>
              ⏳ No question published yet today
            </div>
          )}

          {/* ── Row 1: Submission donut + Streak leaderboard ── */}
          <div className="grid-cols-2" style={{ marginBottom: "1rem" }}>

            {/* Submission donut — redesigned */}
            <div className="card" style={{ display: "flex", flexDirection: "column" }}>
              <div className="section-title" style={{ marginBottom: "0.5rem" }}>📊 Today's Submissions</div>
              <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "1.5rem" }}>
                <div style={{ position: "relative", width: 120, height: 120, flexShrink: 0 }}>
                  <ResponsiveContainer width={120} height={120}>
                    <PieChart>
                      <Pie data={pieSub} dataKey="value" cx="50%" cy="50%" innerRadius={38} outerRadius={56} paddingAngle={3} startAngle={90} endAngle={-270}>
                        {pieSub.map((e,i)=><Cell key={i} fill={e.color}/>)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Center label */}
                  <div style={{
                    position: "absolute", inset: 0,
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  }}>
                    <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--text)", lineHeight: 1 }}>
                      {dash?.stats?.total ? Math.round((dash.stats.completed / dash.stats.total) * 100) : 0}%
                    </div>
                    <div style={{ fontSize: "0.6rem", color: "var(--muted)", fontWeight: 600 }}>done</div>
                  </div>
                </div>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                  {[
                    { label: "Submitted", value: dash?.stats?.completed || 0, color: "#4ade80" },
                    { label: "Pending",   value: dash?.stats?.pending   || 0, color: "#f87171" },
                    { label: "Total",     value: dash?.stats?.total     || 0, color: "#7c6fff" },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                      <span style={{ fontSize: "0.78rem", color: "var(--muted)", flex: 1 }}>{label}</span>
                      <span style={{ fontSize: "0.9rem", fontWeight: 700, color }}>{value}</span>
                    </div>
                  ))}
                  <div style={{ marginTop: "0.25rem" }}>
                    <div style={{ height: 6, background: "var(--border)", borderRadius: 99, overflow: "hidden" }}>
                      <div style={{
                        height: "100%", borderRadius: 99,
                        background: "linear-gradient(90deg, #4ade80, #22c55e)",
                        width: `${dash?.stats?.total ? (dash.stats.completed / dash.stats.total) * 100 : 0}%`,
                        transition: "width 0.6s ease",
                      }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Streak leaderboard — redesigned */}
            <div className="card">
              <div className="section-title" style={{ marginBottom: "0.75rem" }}>🏆 Top Streaks</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {(dash?.topStreak || []).map((u, i) => {
                  const medals = ["🥇","🥈","🥉"];
                  const pct = dash.topStreak[0]?.streak ? Math.round((u.streak / dash.topStreak[0].streak) * 100) : 0;
                  return (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: "0.75rem",
                      padding: "0.5rem 0.75rem",
                      background: i === 0 ? "rgba(251,191,36,0.06)" : "rgba(255,255,255,0.02)",
                      borderRadius: 10,
                      border: i === 0 ? "1px solid rgba(251,191,36,0.15)" : "1px solid transparent",
                    }}>
                      <span style={{ fontSize: i < 3 ? "1.1rem" : "0.8rem", fontWeight: 700, color: "var(--muted)", width: 24, textAlign: "center", flexShrink: 0 }}>
                        {medals[i] || `${i+1}`}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
                          {u.name || u.userId?.split("@")[0]}
                        </div>
                        <div style={{ height: 3, background: "var(--border)", borderRadius: 99, marginTop: "0.3rem", overflow: "hidden" }}>
                          <div style={{ height: "100%", borderRadius: 99, background: i === 0 ? "#fbbf24" : i === 1 ? "#94a3b8" : i === 2 ? "#cd7f32" : "#7c6fff", width: `${pct}%` }} />
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexShrink: 0 }}>
                        <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#f97316" }}>🔥 {u.streak}</span>
                        <span style={{ fontSize: "0.72rem", color: "var(--muted)", background: "var(--bg-secondary)", padding: "0.15rem 0.4rem", borderRadius: 6 }}>{u.weeklySubmissions}/7</span>
                      </div>
                    </div>
                  );
                })}
                {(!dash?.topStreak || dash.topStreak.length === 0) && (
                  <div style={{ textAlign: "center", color: "var(--muted)", fontSize: "0.82rem", padding: "1rem" }}>No streak data yet</div>
                )}
              </div>
            </div>
          </div>

          {/* ── Row 2: Weekly bar + Fine bar + Category pie ── */}
          <div className="grid-cols-3" style={{ gap: "1rem" }}>

            {/* Weekly submissions bar */}
            <div className="card">
              <div className="section-title">📅 Weekly Submissions</div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={weekly.slice(0,8).map(u=>({name:(u.name||"?").slice(0,6),days:u.weeklySubmissions||0}))} margin={{top:4,right:4,left:-20,bottom:20}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false}/>
                  <XAxis dataKey="name" stroke="#55557a" fontSize={9} tickLine={false} axisLine={false} angle={-30} textAnchor="end" interval={0}/>
                  <YAxis domain={[0,7]} stroke="#55557a" fontSize={10} tickLine={false} axisLine={false}/>
                  <Tooltip contentStyle={tt} cursor={{fill:"rgba(124,111,255,0.06)"}}/>
                  <Bar dataKey="days" radius={[6,6,0,0]}>
                    {weekly.slice(0,8).map((u,i)=>(
                      <Cell key={i} fill={(u.weeklySubmissions||0)>=5?"#4ade80":(u.weeklySubmissions||0)>=3?"#7c6fff":"#f87171"}/>
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Pending Submissions */}
            <div className="card">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                <div className="section-title" style={{ margin: 0 }}>⏳ Pending Today</div>
                <span style={{
                  fontSize: "0.72rem", fontWeight: 700,
                  padding: "0.15rem 0.5rem", borderRadius: 20,
                  background: "rgba(248,113,113,0.12)",
                  color: "#f87171",
                }}>
                  {users.filter(u => !u.completed).length} left
                </span>
              </div>
              {users.filter(u => !u.completed).length === 0 ? (
                <div style={{ textAlign: "center", color: "var(--muted)", fontSize: "0.82rem", padding: "1.5rem 0" }}>
                  🎉 Everyone submitted today!
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", maxHeight: 200, overflowY: "auto" }}>
                  {users.filter(u => !u.completed).map((u, i) => (
                    <div key={u.userId || u.phone} style={{
                      display: "flex", alignItems: "center", gap: "0.5rem",
                      padding: "0.35rem 0.5rem", borderRadius: 8,
                      background: "rgba(248,113,113,0.05)",
                      border: "1px solid rgba(248,113,113,0.1)",
                    }}>
                      <div style={{
                        width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                        background: "rgba(248,113,113,0.15)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "0.65rem", fontWeight: 700, color: "#f87171",
                      }}>
                        {(u.registeredName || u.name || "?")[0]?.toUpperCase()}
                      </div>
                      <span style={{
                        flex: 1, fontSize: "0.78rem", color: "var(--text)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        minWidth: 0,
                      }}>
                        {u.registeredName || u.name || u.phone}
                      </span>
                      <span style={{ fontSize: "0.68rem", color: "#f97316", flexShrink: 0 }}>
                        🔥{u.streak || 0}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Questions by category */}
            <div className="card">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                <div className="section-title" style={{ margin: 0 }}>❓ Question Bank</div>
                <span style={{
                  fontSize: "0.72rem", fontWeight: 700,
                  padding: "0.15rem 0.5rem", borderRadius: 20,
                  background: questions.length <= 7 ? "rgba(248,113,113,0.15)" : questions.length <= 14 ? "rgba(251,191,36,0.15)" : "rgba(74,222,128,0.15)",
                  color: questions.length <= 7 ? "#f87171" : questions.length <= 14 ? "#fbbf24" : "#4ade80",
                }}>
                  {questions.length} total
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {CATS.map((cat, i) => {
                  const count = questions.filter(q => q.category === cat).length;
                  const maxCat = Math.max(...CATS.map(c => questions.filter(q => q.category === c).length), 1);
                  const pct = Math.round((count / maxCat) * 100);
                  const color = count === 0 ? "#f87171" : count <= 1 ? "#fbbf24" : PIE_COLORS[i % PIE_COLORS.length];
                  return (
                    <div key={cat} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: "0.72rem", color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cat}</span>
                      <div style={{ width: 50, height: 4, background: "var(--border)", borderRadius: 99, overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: 99, background: color, width: `${pct}%` }} />
                      </div>
                      <span style={{ fontSize: "0.75rem", fontWeight: 700, color, width: 16, textAlign: "right", flexShrink: 0 }}>{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

      {/* TODAY */}
      {tab==="today" && (
        <>
          {dash?.today?.question
            ? <div className="today-card"><div className="today-label">📌 Today's Question</div><div className="today-q">{dash.today.question}</div>{dash.today.topic && <span className="today-topic">{dash.today.topic}</span>}</div>
            : <div className="warn-box"><p>⏳ No question set for today yet.</p></div>}

          {/* Publish question to webapp */}
          <div className="card" style={{marginBottom:"1rem"}}>
            <div className="section-title">📢 Publish Question to Webapp</div>
            <p style={{color:"var(--muted)",fontSize:"0.85rem",marginBottom:"1rem"}}>Set today's question so all webapp users can see and submit their video.</p>

            {/* Pick from bank */}
            <div style={{marginBottom:"1rem"}}>
              <label className="form-label">Pick from Question Bank</label>
              <div style={{display:"flex",gap:"0.5rem",flexWrap:"wrap"}}>
                <select className="form-input" style={{flex:1,minWidth:200}}
                  value={publishQ?._id||""}
                  onChange={e=>{
                    const q=questions.find(x=>x._id===e.target.value);
                    setPublishQ(q||null);
                    if(q) setPublishCustom({topic:q.topic,question:q.question,category:q.category});
                  }}>
                  <option value="">— Select a question —</option>
                  {questions.map(q=>(
                    <option key={q._id} value={q._id}>[{q.category}] {q.topic}: {q.question.slice(0,55)}…</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Or type manually */}
            <div style={{marginBottom:"1rem"}}>
              <label className="form-label">Or Enter Manually</label>
              <input className="form-input" style={{marginBottom:"0.5rem"}} placeholder="Topic (e.g. Future Goals)"
                value={publishCustom.topic} onChange={e=>{ setPublishQ(null); setPublishCustom(p=>({...p,topic:e.target.value})); }}/>
              <textarea className="form-input" rows={2} placeholder="Question text…"
                style={{resize:"vertical"}}
                value={publishCustom.question} onChange={e=>{ setPublishQ(null); setPublishCustom(p=>({...p,question:e.target.value})); }}/>
            </div>

            {/* Preview */}
            {publishCustom.question && (
              <div style={{padding:"0.75rem",background:"var(--bg-secondary)",borderRadius:8,fontSize:"0.9rem",marginBottom:"1rem",border:"1px solid var(--border)"}}>
                <div style={{color:"var(--muted)",fontSize:"0.75rem",marginBottom:"0.25rem"}}>Preview:</div>
                <strong>{publishCustom.topic}</strong>{publishCustom.topic?" — ":""}{publishCustom.question}
              </div>
            )}

            <button className="btn-primary" onClick={async()=>{
              if(!publishCustom.question.trim()){msg("Enter or select a question first","danger");return;}
              try{
                await api.patch("/dashboard/today-question",{
                  topic:publishCustom.topic,
                  question:publishCustom.question,
                  category:publishCustom.category||"General"
                });
                msg("✅ Question published! Users can now see it.");
                setPublishQ(null);
                setPublishCustom({topic:"",question:"",category:""});
                reload(['dashboard']); // Reload dashboard to show new question
              }catch(e){msg(e?.response?.data?.error||"Failed","danger");}
            }}>📢 Publish to Webapp</button>
          </div>

          <div className="card">
            <div className="section-title">Submission Status</div>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Name</th><th>Phone</th><th>Streak</th><th>Status</th><th>Fine</th></tr></thead>
                <tbody>{users.map(u=>(
                  <tr key={u.userId}>
                    <td style={{fontWeight:500}}>{u.registeredName||u.name||"—"}</td>
                    <td style={{color:"var(--muted)"}}>{u.phone}</td>
                    <td>🔥 {u.streak||0}</td>
                    <td><span style={{color:u.completed?"var(--success)":"var(--danger)",fontWeight:600}}>{u.completed?"✅ Submitted":"⏳ Pending"}</span></td>
                    <td style={{color:u.fine>0?"var(--danger)":"var(--muted)"}}>₹{u.fine||0}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* USERS */}
      {tab==="users" && (
        <>
          {/* Add Member — requires admin OTP verification first */}
          <div className="card" style={{marginBottom:"1rem"}}>
            <div className="section-title">➕ Add New Member</div>

            {/* Step 1: Admin identity verification */}
            {adminOtpStep === "idle" && (
              <div>
                <p style={{color:"var(--muted)",fontSize:"0.85rem",marginBottom:"1rem"}}>
                  To add a member, first verify your identity via OTP sent to your registered phone.
                </p>
                {adminOtpError && (
                  <div style={{color:"#f87171",fontSize:"0.82rem",marginBottom:"0.75rem"}}>❌ {adminOtpError}</div>
                )}
                <button className="btn-primary" disabled={adminOtpLoading} onClick={async()=>{
                  setAdminOtpLoading(true); setAdminOtpError("");
                  try {
                    await api.post("/users/admin-send-otp");
                    setAdminOtpStep("sent");
                  } catch(e) {
                    setAdminOtpError(e?.response?.data?.error || "Failed to send OTP");
                  } finally { setAdminOtpLoading(false); }
                }}>
                  {adminOtpLoading ? "Sending…" : "🔐 Verify My Identity (Send OTP)"}
                </button>
              </div>
            )}

            {/* Step 2: Enter OTP */}
            {adminOtpStep === "sent" && (
              <div>
                <p style={{color:"var(--muted)",fontSize:"0.85rem",marginBottom:"1rem"}}>
                  Enter the 6-digit OTP sent to your registered phone number.
                </p>
                {adminOtpError && (
                  <div style={{color:"#f87171",fontSize:"0.82rem",marginBottom:"0.75rem"}}>❌ {adminOtpError}</div>
                )}
                <div style={{display:"flex",gap:"0.5rem",alignItems:"center",flexWrap:"wrap"}}>
                  <input className="form-input" style={{width:160,letterSpacing:"0.2em",textAlign:"center",fontSize:"1.1rem"}}
                    type="text" inputMode="numeric" maxLength={6} placeholder="000000"
                    value={adminOtp} onChange={e=>setAdminOtp(e.target.value.replace(/\D/g,"").slice(0,6))}/>
                  <button className="btn-primary" disabled={adminOtpLoading||adminOtp.length!==6} onClick={async()=>{
                    setAdminOtpLoading(true); setAdminOtpError("");
                    try {
                      const {data} = await api.post("/users/admin-verify-otp",{otp:adminOtp});
                      setAdminActionToken(data.actionToken);
                      setAdminOtpStep("verified");
                      setAdminOtp("");
                    } catch(e) {
                      setAdminOtpError(e?.response?.data?.error || "Invalid OTP");
                      setAdminOtp("");
                    } finally { setAdminOtpLoading(false); }
                  }}>
                    {adminOtpLoading ? "Verifying…" : "Verify OTP"}
                  </button>
                  <button className="btn-ghost" onClick={()=>{setAdminOtpStep("idle");setAdminOtp("");setAdminOtpError("");}}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Add member form (identity verified) */}
            {adminOtpStep === "verified" && (
              <form onSubmit={async (e) => {
                e.preventDefault();
                setNewMemberLoading(true);
                try {
                  await api.post("/users/admin-create", { ...newMember, actionToken: adminActionToken });
                  msg(`✅ Account created for ${newMember.name}`);
                  setNewMember({ name:"", phone:"", password:"", role:"user" });
                  setAdminOtpStep("idle");
                  setAdminActionToken("");
                  reload(['users', 'dashboard']); // Reload users and dashboard stats
                } catch (err) {
                  const errMsg = err?.response?.data?.error || "Failed to create account";
                  // If token expired, reset to idle
                  if (errMsg.includes("expired") || errMsg.includes("token")) {
                    setAdminOtpStep("idle");
                    setAdminActionToken("");
                    msg("Session expired. Please re-verify your identity.", "danger");
                  } else {
                    msg(errMsg, "danger");
                  }
                } finally {
                  setNewMemberLoading(false);
                }
              }}>
                <div style={{display:"flex",alignItems:"center",gap:"0.5rem",marginBottom:"1rem",color:"#4ade80",fontSize:"0.85rem"}}>
                  ✅ Identity verified — you can now add a member
                  <button type="button" className="btn-ghost" style={{fontSize:"0.75rem",padding:"0.2rem 0.5rem"}}
                    onClick={()=>{setAdminOtpStep("idle");setAdminActionToken("");}}>
                    Re-verify
                  </button>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Full Name</label>
                    <input className="form-input" placeholder="Member name" value={newMember.name}
                      onChange={e=>setNewMember(p=>({...p,name:e.target.value}))} required minLength={2}/>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Phone (10 digits)</label>
                    <input className="form-input" placeholder="9876543210" type="tel" value={newMember.phone}
                      onChange={e=>setNewMember(p=>({...p,phone:e.target.value}))} required maxLength={13}/>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Password</label>
                    <input className="form-input" placeholder="Min 8 chars, upper+lower+number+symbol" type="password" value={newMember.password}
                      onChange={e=>setNewMember(p=>({...p,password:e.target.value}))} required minLength={8}/>
                    <div style={{fontSize:"0.72rem",color:"var(--muted)",marginTop:"0.3rem"}}>
                      Must contain: uppercase, lowercase, number, special character (!@#$%^&*)
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Role</label>
                    <select className="form-input" value={newMember.role}
                      onChange={e=>setNewMember(p=>({...p,role:e.target.value}))}>
                      <option value="user">User</option>
                      <option value="trainer">Trainer</option>
                      <option value="admin">Admin</option>
                      <option value="viewer">Viewer (read-only)</option>
                    </select>
                  </div>
                </div>
                <button type="submit" className="btn-primary" disabled={newMemberLoading}>
                  {newMemberLoading ? "Creating…" : "Create Account"}
                </button>
              </form>
            )}
          </div>

          <div className="card">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1rem",flexWrap:"wrap",gap:"0.5rem"}}>
              <div className="section-title" style={{margin:0}}>All Users ({filteredUsers.length})</div>
              <input className="form-input" style={{width:220}} placeholder="Search name or phone…" value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Name</th><th>Phone</th><th>Role</th><th>Streak</th><th>Weekly</th><th>Monthly</th><th>Fine</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>{filteredUsers.map(u=>(
                <tr key={u.userId}>
                  <td style={{fontWeight:500,whiteSpace:"nowrap"}}>{u.registeredName||u.name||"—"}</td>
                  <td style={{color:"var(--muted)"}}>{u.phone}</td>
                  <td>
                    <RoleSelector 
                      phone={u.phone} 
                      currentRole={u.role || "user"}
                      onRoleChange={() => reload(['users'])} // Only reload users
                    />
                  </td>
                  <td>🔥 {u.streak||0}</td>
                  <td>{u.weeklySubmissions||0}/7</td>
                  <td>{u.monthlySubmissions||0}</td>
                  <td style={{color:u.fine>0?"var(--danger)":"var(--muted)",fontWeight:u.fine>0?600:400}}>₹{u.fine||0}</td>
                  <td><span style={{color:u.isActive?"var(--success)":"var(--danger)",fontSize:"0.8rem"}}>{u.isActive?"Active":"Disabled"}</span></td>
                  <td style={{whiteSpace:"nowrap"}}>
                    <button className="btn-ghost" style={{marginRight:3}} onClick={()=>viewStudentDetail(u)}>View</button>
                    <button className="btn-ghost" style={{marginRight:3}} onClick={()=>adjustFine(u.phone,u.fine)}>±Fine</button>
                    <button className="btn-ghost" style={{marginRight:3}} onClick={()=>resetFine(u.phone)}>Reset</button>
                    <button className="btn-ghost" style={{marginRight:3}} onClick={()=>toggleUser(u.phone)}>{u.isActive?"Disable":"Enable"}</button>
                    <button className="btn-ghost" style={{marginRight:3}} onClick={async()=>{
                      try {
                        await api.post(`/video/admin/reset-limit/${u._id || u.userId}`);
                        msg(`Upload limit reset for ${u.registeredName||u.name||u.phone}`);
                      } catch(e) { msg(e?.response?.data?.error||"Reset failed","danger"); }
                    }}>🔄 Limit</button>
                    <button className="btn-ghost danger" onClick={()=>deleteUser(u.phone)}>Remove</button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
        </>
      )}

      {/* REPORTS */}
      {tab==="reports" && (
        <>
          <div style={{display:"flex",gap:"0.75rem",marginBottom:"1rem",flexWrap:"wrap"}}>
            <button className="btn-ghost danger" onClick={resetWeekly} disabled={resetting==="weekly"} style={{display:"flex",alignItems:"center",gap:"0.4rem"}}>
              {resetting==="weekly" ? "Resetting…" : "🔄 Reset Weekly Submissions"}
            </button>
            <button className="btn-ghost danger" onClick={resetMonthly} disabled={resetting==="monthly"} style={{display:"flex",alignItems:"center",gap:"0.4rem"}}>
              {resetting==="monthly" ? "Resetting…" : "🔄 Reset Monthly Submissions"}
            </button>
          </div>
          <div className="card" style={{marginBottom:"1rem"}}>
            <div className="section-title">📅 Weekly Report</div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={weekly.slice(0,15).map(u=>({name:(u.name||"?").slice(0,8),days:u.weeklySubmissions||0,streak:u.streak||0}))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#252545"/>
                <XAxis dataKey="name" stroke="#8888aa" fontSize={11}/>
                <YAxis domain={[0,7]} stroke="#8888aa" fontSize={11}/>
                <Tooltip contentStyle={tt}/><Legend/>
                <Bar dataKey="days" name="Days" fill="#7c6fff" radius={[4,4,0,0]}/>
                <Bar dataKey="streak" name="Streak" fill="#fbbf24" radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
            <div className="table-wrap" style={{marginTop:"1rem"}}>
              <table className="data-table">
                <thead><tr><th>#</th><th>Name</th><th>Days</th><th>Streak</th><th>Weekly Fine</th></tr></thead>
                <tbody>{weekly.map((u,i)=>(
                  <tr key={i}>
                    <td style={{color:"var(--muted)"}}>{i+1}</td>
                    <td style={{fontWeight:500}}>{u.name||u.userId?.split("@")[0]}</td>
                    <td style={{color:(u.weeklySubmissions||0)>=7?"var(--success)":(u.weeklySubmissions||0)>=4?"var(--warning)":"var(--danger)",fontWeight:600}}>{u.weeklySubmissions||0}/7</td>
                    <td>🔥 {u.streak||0}</td>
                    <td style={{color:"var(--danger)"}}>₹{u.weeklyFine||0}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
          <div className="card">
            <div className="section-title">📆 Monthly Report</div>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>#</th><th>Name</th><th>Monthly</th><th>Streak</th><th>Total Fine</th></tr></thead>
                <tbody>{monthly.map((u,i)=>(
                  <tr key={i}>
                    <td style={{color:"var(--muted)"}}>{i+1}</td>
                    <td style={{fontWeight:500}}>{u.name||u.userId?.split("@")[0]}</td>
                    <td>{u.monthlySubmissions||0}</td>
                    <td>🔥 {u.streak||0}</td>
                    <td style={{color:u.fine>0?"var(--danger)":"var(--muted)"}}>₹{u.fine||0}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* FINES */}
      {tab==="fines" && (
        <>
          <div className="stat-grid" style={{marginBottom:"1rem"}}>
            <StatCard icon="💸" label="Total Outstanding" value={"\u20B9" + users.reduce((s,u)=>s+Math.max(0,u.fine||0),0)} color="#f87171"/>
            <StatCard icon="⚠️" label="Users with Fines"  value={users.filter(u=>(u.fine||0)>0).length}      color="#fbbf24"/>
            <StatCard icon="✅" label="Fine-Free Users"   value={users.filter(u=>(u.fine||0)<=0).length}    color="#4ade80"/>
            <StatCard icon="📊" label="Avg Fine"          value={"\u20B9" + (()=>{const pos=users.filter(u=>(u.fine||0)>0);return pos.length?Math.round(pos.reduce((s,u)=>s+(u.fine||0),0)/pos.length):0})()} color="#7c6fff"/>
          </div>
          {fineBar.length>0 && (
            <div className="card" style={{marginBottom:"1rem"}}>
              <div className="section-title">Top Fine Holders</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={fineBar}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#252545"/>
                  <XAxis dataKey="name" stroke="#8888aa" fontSize={11}/>
                  <YAxis stroke="#8888aa" fontSize={11}/>
                  <Tooltip contentStyle={tt}/>
                  <Bar dataKey="fine" fill="#f87171" radius={[4,4,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="card">
            <div className="section-title">Fine Management</div>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Name</th><th>Phone</th><th>Total Fine</th><th>Weekly Fine</th><th>Actions</th></tr></thead>
                <tbody>{[...users].sort((a,b)=>(b.fine||0)-(a.fine||0)).map(u=>(
                  <tr key={u.userId}>
                    <td style={{fontWeight:500}}>{u.registeredName||u.name||"—"}</td>
                    <td style={{color:"var(--muted)"}}>{u.phone}</td>
                    <td style={{color:u.fine>0?"var(--danger)":u.fine<0?"#4ade80":"var(--success)",fontWeight:600}}>
                      {u.fine < 0 ? "-\u20B9" + Math.abs(u.fine) + " credit" : "\u20B9" + (u.fine ?? 0)}
                    </td>
                    <td style={{color:"var(--muted)"}}>₹{u.weeklyFine||0}</td>
                    <td>
                      <button className="btn-ghost" style={{marginRight:3}} onClick={()=>adjustFine(u.phone,u.fine)}>±Adjust</button>
                      <button className="btn-ghost danger" onClick={()=>resetFine(u.phone)}>Reset</button>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* QUESTIONS */}
      {tab==="questions" && (
        <>
          {/* Low stock warning + Generate Now */}
          {questions.length <= 14 && (
            <div style={{
              background: questions.length <= 7 ? "rgba(248,113,113,0.08)" : "rgba(251,191,36,0.08)",
              border: `1px solid ${questions.length <= 7 ? "rgba(248,113,113,0.3)" : "rgba(251,191,36,0.3)"}`,
              borderRadius: 12, padding: "0.85rem 1.1rem",
              marginBottom: "1rem",
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap",
            }}>
              <div>
                <span style={{ fontWeight: 700, color: questions.length <= 7 ? "#f87171" : "#fbbf24", fontSize: "0.9rem" }}>
                  {questions.length <= 7 ? "⚠️ Question bank is critically low!" : "ℹ️ Question bank is running low"}
                </span>
                <div style={{ color: "var(--muted)", fontSize: "0.78rem", marginTop: "0.2rem" }}>
                  {questions.length} question{questions.length !== 1 ? "s" : ""} remaining — auto-generate runs at the scheduled time, or generate now.
                </div>
              </div>
              <button
                className="btn-primary"
                style={{ whiteSpace: "nowrap", fontSize: "0.85rem", padding: "0.5rem 1rem", opacity: qActionBusy ? 0.6 : 1 }}
                disabled={!!qActionBusy}
                onClick={async () => {
                  setQActionBusy("generating");
                  msg("🤖 Generating questions… please wait (30–60s)");
                  try {
                    const res = await api.post("/questions/generate-now", { count: 14 }, { timeout: 95000 });
                    await refreshQuestions();
                    setQActionBusy("");
                    msg(`✅ ${res.data.message}`);
                  } catch (e) {
                    setQActionBusy("");
                    await refreshQuestions(); // still refresh — some may have been inserted
                    if (e?.code === "ECONNABORTED" || e?.message?.includes("timeout")) {
                      msg("⚠️ Request timed out — questions may still be generating. Check the bank in a moment.", "danger");
                    } else {
                      msg(e?.response?.data?.error || "Generation failed", "danger");
                    }
                  }
                }}
              >
                {qActionBusy === "generating" ? "⏳ Generating…" : "🤖 Generate Now"}
              </button>
            </div>
          )}

          <div className="card" style={{marginBottom:"1rem"}}>
            <div className="section-title">{editQ?"✏️ Edit Question":"➕ Add Question"}</div>
            <form onSubmit={saveQ}>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <select className="form-input" value={qForm.category} onChange={e=>setQForm({...qForm,category:e.target.value})} required>
                    <option value="">Select category</option>
                    {CATS.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Topic</label>
                  <input className="form-input" placeholder="e.g. Morning routines" value={qForm.topic} onChange={e=>setQForm({...qForm,topic:e.target.value})} required/>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Question</label>
                <textarea className="form-input" style={{resize:"vertical",minHeight:80}} placeholder="Write the question…" value={qForm.question} onChange={e=>setQForm({...qForm,question:e.target.value})} required/>
              </div>
              <div style={{display:"flex",gap:"0.5rem"}}>
                <button type="submit" className="btn-primary">{editQ?"Update":"Add Question"}</button>
                {editQ && <button type="button" className="btn-ghost" onClick={()=>{setEditQ(null);setQForm({category:"",topic:"",question:""});}}>Cancel</button>}
              </div>
            </form>
          </div>
          <div className="card">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1rem",flexWrap:"wrap",gap:"0.5rem"}}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div className="section-title" style={{margin:0}}>Question Bank ({filteredQ.length}/{questions.length})</div>
                {/* Generate button */}
                <button
                  className="btn-ghost"
                  style={{ fontSize: "0.78rem", padding: "0.3rem 0.7rem", opacity: qActionBusy ? 0.6 : 1 }}
                  disabled={!!qActionBusy}
                  onClick={async () => {
                    setQActionBusy("generating");
                    msg("🤖 Generating questions… please wait (30–60s)");
                    try {
                      const res = await api.post("/questions/generate-now", { count: 14 }, { timeout: 95000 });
                      await refreshQuestions();
                      setQActionBusy("");
                      msg(`✅ ${res.data.message}`);
                    } catch (e) {
                      setQActionBusy("");
                      await refreshQuestions(); // still refresh — some may have been inserted
                      if (e?.code === "ECONNABORTED" || e?.message?.includes("timeout")) {
                        msg("⚠️ Request timed out — questions may still be generating. Check the bank in a moment.", "danger");
                      } else {
                        msg(e?.response?.data?.error || "Generation failed", "danger");
                      }
                    }
                  }}
                >
                  {qActionBusy === "generating" ? "⏳ Generating…" : "🤖 Generate"}
                </button>

                {/* Clean Generic button */}
                <button
                  className="btn-ghost danger"
                  style={{ fontSize: "0.78rem", padding: "0.3rem 0.7rem", opacity: qActionBusy ? 0.6 : 1 }}
                  disabled={!!qActionBusy}
                  onClick={async () => {
                    setQActionBusy("cleaning");
                    try {
                      const res = await api.post("/questions/clean-generic");
                      await refreshQuestions();
                      setQActionBusy("");
                      if (res.data.deleted === 0) {
                        msg("✅ Bank is clean — no generic questions found");
                      } else {
                        msg(`🗑️ Removed ${res.data.deleted} generic question${res.data.deleted !== 1 ? "s" : ""}. Bank refreshed.`, "danger");
                      }
                    } catch (e) {
                      setQActionBusy("");
                      msg(e?.response?.data?.error || "Clean failed", "danger");
                    }
                  }}
                >
                  {qActionBusy === "cleaning" ? "⏳ Cleaning…" : "🗑️ Clean Generic"}
                </button>
              </div>
              <div style={{display:"flex",gap:"0.5rem",flexWrap:"wrap"}}>
                <select className="form-input" style={{width:"auto"}} value={qCat} onChange={e=>setQCat(e.target.value)}>
                  <option value="">All Categories</option>
                  {CATS.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
                <input className="form-input" style={{width:180}} placeholder="Search…" value={qSearch} onChange={e=>setQSearch(e.target.value)}/>
              </div>
            </div>

            {/* Category balance bars */}
            {(() => {
              const maxCount = Math.max(...CATS.map(c => questions.filter(q => q.category === c).length), 1);
              return (
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                  gap: "0.5rem",
                  marginBottom: "1rem",
                  padding: "0.75rem",
                  background: "var(--bg-secondary)",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                }}>
                  {CATS.map(cat => {
                    const count = questions.filter(q => q.category === cat).length;
                    const pct = Math.round((count / maxCount) * 100);
                    const color = count === 0 ? "#f87171" : count <= 1 ? "#fbbf24" : "#4ade80";
                    return (
                      <div key={cat} style={{ fontSize: "0.72rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.2rem" }}>
                          <span style={{ color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "80%" }}>{cat}</span>
                          <span style={{ fontWeight: 700, color, flexShrink: 0 }}>{count}</span>
                        </div>
                        <div style={{ height: 4, background: "var(--border)", borderRadius: 99 }}>
                          <div style={{
                            height: "100%", borderRadius: 99,
                            width: `${pct}%`,
                            background: color,
                            transition: "width 0.4s ease",
                            minWidth: count > 0 ? 4 : 0,
                          }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Category</th><th>Topic</th><th>Question</th><th>Actions</th></tr></thead>
                <tbody>{filteredQ.map(q=>(
                  <tr key={q._id}>
                    <td><span className="badge badge-purple">{q.category}</span></td>
                    <td style={{color:"var(--muted)",whiteSpace:"nowrap"}}>{q.topic}</td>
                    <td style={{maxWidth:320}}>{q.question}</td>
                    <td style={{whiteSpace:"nowrap"}}>
                      <button className="btn-ghost" style={{marginRight:3}} onClick={()=>startEdit(q)}>Edit</button>
                      <button className="btn-ghost danger" onClick={()=>deleteQ(q._id)}>Delete</button>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* SUBMISSIONS */}
      {tab==="submissions" && (
        <>
          <div className="stat-grid" style={{marginBottom:"1rem"}}>
            <StatCard icon="✅" label="Submitted Today" value={users.filter(u=>u.completed).length} color="#4ade80"/>
            <StatCard icon="⏳" label="Not Submitted"   value={users.filter(u=>!u.completed).length} color="#f87171"/>
            <StatCard icon="👥" label="Total Students"  value={users.length} color="#7c6fff"/>
          </div>

          <div className="card">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1rem",flexWrap:"wrap",gap:"0.5rem"}}>
              <div className="section-title" style={{margin:0}}>Student Submissions</div>
              <input className="form-input" style={{width:220}} placeholder="Search name or phone…" value={search} onChange={e=>setSearch(e.target.value)}/>
            </div>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Today</th>
                    <th>Streak</th>
                    <th>Weekly</th>
                    <th>Monthly</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map(u=>(
                    <tr key={u.userId}>
                      <td style={{fontWeight:500}}>{u.registeredName||u.name||"—"}</td>
                      <td style={{color:"var(--muted)"}}>{u.phone}</td>
                      <td>
                        <span style={{
                          padding:"0.25rem 0.65rem",
                          borderRadius:20,
                          fontSize:"0.75rem",
                          fontWeight:600,
                          background:u.completed?"rgba(74,222,128,0.15)":"rgba(248,113,113,0.15)",
                          color:u.completed?"#4ade80":"#f87171"
                        }}>
                          {u.completed?"✅":"⏳"}
                        </span>
                      </td>
                      <td>🔥 {u.streak||0}</td>
                      <td>
                        <div style={{display:"flex",alignItems:"center",gap:"0.5rem"}}>
                          <span style={{minWidth:35}}>{u.weeklySubmissions||0}/7</span>
                          <div style={{display:"flex",gap:"0.25rem"}}>
                            <button
                              className="btn-ghost"
                              style={{padding:"0.2rem 0.4rem",fontSize:"0.75rem",minWidth:28}}
                              onClick={async()=>{
                                try{
                                  const res=await api.patch(`/submissions/${u.phone}/weekly`,{delta:-1});
                                  setUsers(prev=>prev.map(user=>user.phone===u.phone?{...user,weeklySubmissions:res.data.weeklySubmissions}:user));
                                }catch(e){msg(e?.response?.data?.error||"Failed","danger");}
                              }}
                              disabled={(u.weeklySubmissions||0)===0}
                            >−</button>
                            <button
                              className="btn-ghost"
                              style={{padding:"0.2rem 0.4rem",fontSize:"0.75rem",minWidth:28}}
                              onClick={async()=>{
                                try{
                                  const res=await api.patch(`/submissions/${u.phone}/weekly`,{delta:1});
                                  setUsers(prev=>prev.map(user=>user.phone===u.phone?{...user,weeklySubmissions:res.data.weeklySubmissions}:user));
                                }catch(e){msg(e?.response?.data?.error||"Failed","danger");}
                              }}
                            >+</button>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{display:"flex",alignItems:"center",gap:"0.5rem"}}>
                          <span style={{minWidth:25}}>{u.monthlySubmissions||0}</span>
                          <div style={{display:"flex",gap:"0.25rem"}}>
                            <button
                              className="btn-ghost"
                              style={{padding:"0.2rem 0.4rem",fontSize:"0.75rem",minWidth:28}}
                              onClick={async()=>{
                                try{
                                  const res=await api.patch(`/submissions/${u.phone}/monthly`,{delta:-1});
                                  setUsers(prev=>prev.map(user=>user.phone===u.phone?{...user,monthlySubmissions:res.data.monthlySubmissions}:user));
                                }catch(e){msg(e?.response?.data?.error||"Failed","danger");}
                              }}
                              disabled={(u.monthlySubmissions||0)===0}
                            >−</button>
                            <button
                              className="btn-ghost"
                              style={{padding:"0.2rem 0.4rem",fontSize:"0.75rem",minWidth:28}}
                              onClick={async()=>{
                                try{
                                  const res=await api.patch(`/submissions/${u.phone}/monthly`,{delta:1});
                                  setUsers(prev=>prev.map(user=>user.phone===u.phone?{...user,monthlySubmissions:res.data.monthlySubmissions}:user));
                                }catch(e){msg(e?.response?.data?.error||"Failed","danger");}
                              }}
                            >+</button>
                          </div>
                        </div>
                      </td>
                      <td style={{whiteSpace:"nowrap"}}>
                        <button
                          className="btn-ghost"
                          style={{
                            marginRight:4,
                            fontSize:"0.78rem",
                            color: u.completed ? "#4ade80" : "#f87171",
                            borderColor: u.completed ? "rgba(74,222,128,0.3)" : "rgba(248,113,113,0.3)",
                          }}
                          onClick={async()=>{
                            try{
                              const res = await api.patch(`/users/${u.phone}/toggle-submitted`);
                              setUsers(prev=>prev.map(user=>user.phone===u.phone?{...user,completed:res.data.completed}:user));
                              msg(res.data.completed?"Marked as submitted":"Marked as not submitted");
                            }catch(e){msg(e?.response?.data?.error||"Failed","danger");}
                          }}
                        >
                          {u.completed ? "✅ Submitted" : "⏳ Not Submitted"}
                        </button>
                        <button className="btn-ghost" onClick={()=>viewStudentDetail(u)}>View</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* MONITORING */}
      {tab==="monitoring" && <MonitoringPanel />}

      {/* REGISTRATIONS */}
      {tab==="registrations" && (
        <div className="card">
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"1rem" }}>
            <div className="section-title" style={{ margin:0 }}>📋 Pending Registrations</div>
            <button className="btn-ghost" style={{ fontSize:"0.8rem" }} onClick={loadPendingRegs} disabled={pendingRegsLoading}>
              {pendingRegsLoading ? "Loading…" : "↻ Refresh"}
            </button>
          </div>

          {pendingRegsLoading && <div style={{ textAlign:"center", color:"var(--muted)", padding:"2rem" }}>Loading…</div>}

          {!pendingRegsLoading && pendingRegs.length === 0 && (
            <div style={{ textAlign:"center", color:"var(--muted)", padding:"2rem" }}>
              <div style={{ fontSize:"2rem", marginBottom:"0.5rem" }}>✅</div>
              No pending registrations
            </div>
          )}

          {!pendingRegsLoading && pendingRegs.length > 0 && (
            <div style={{ display:"flex", flexDirection:"column", gap:"0.75rem" }}>
              {pendingRegs.map(p => {
                const hoursLeft = Math.max(0, Math.round((new Date(p.expiresAt) - Date.now()) / 3600000));
                const urgent = hoursLeft < 4;
                return (
                  <div key={p.id} style={{
                    display:"flex", alignItems:"center", gap:"1rem", flexWrap:"wrap",
                    background: urgent ? "rgba(248,113,113,0.06)" : "var(--bg2)",
                    border: `1px solid ${urgent ? "rgba(248,113,113,0.25)" : "var(--border)"}`,
                    borderRadius:12, padding:"0.85rem 1rem",
                  }}>
                    <div style={{ width:38, height:38, borderRadius:"50%", background:"rgba(124,111,255,0.2)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"1rem", fontWeight:700, color:"#a78bfa", flexShrink:0 }}>
                      {p.name[0]?.toUpperCase()}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:"0.9rem", color:"var(--text)" }}>{p.name}</div>
                      <div style={{ fontSize:"0.75rem", color:"var(--muted)" }}>📱 {p.phone}</div>
                      <div style={{ fontSize:"0.68rem", color: urgent ? "#f87171" : "var(--muted)", marginTop:"0.15rem" }}>
                        {urgent ? "⚠️" : "⏳"} Expires in {hoursLeft}h · {new Date(p.createdAt).toLocaleString("en-IN", { dateStyle:"short", timeStyle:"short" })}
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:"0.5rem", flexShrink:0 }}>
                      <button
                        className="btn-primary"
                        style={{ fontSize:"0.8rem", padding:"0.4rem 0.9rem", background:"linear-gradient(135deg,#4ade80,#22c55e)", color:"#065f46" }}
                        onClick={async () => {
                          try {
                            await api.post(`/auth/pending/${p.id}/approve`);
                            msg(`✅ ${p.name} approved — they can now log in`);
                            loadPendingRegs();
                          } catch (e) { msg(e.response?.data?.error || "Approve failed", "danger"); }
                        }}
                      >✅ Approve</button>
                      <button
                        className="btn-ghost"
                        style={{ fontSize:"0.8rem", padding:"0.4rem 0.9rem", color:"#f87171", borderColor:"rgba(248,113,113,0.3)" }}
                        onClick={async () => {
                          try {
                            await api.delete(`/auth/pending/${p.id}`);
                            msg(`Rejected ${p.name}`, "danger");
                            loadPendingRegs();
                          } catch (e) { msg(e.response?.data?.error || "Reject failed", "danger"); }
                        }}
                      >❌ Reject</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SETTINGS */}
      {tab==="settings" && (
        <>
        <div className="card" style={{maxWidth:480}}>
          <div className="section-title">⚙️ Bot Schedule Settings</div>
          <p style={{color:"var(--muted)",fontSize:"0.85rem",marginBottom:"1.5rem"}}>
            Configure when the WhatsApp bot sends the daily poster and pre-generates questions. Times are in IST (24-hour format). Changes apply within 1 minute.
          </p>
          <form onSubmit={saveSettings}>
            <div className="form-group" style={{marginBottom:"1.25rem"}}>
              <label className="form-label" style={{display:"flex",alignItems:"center",gap:"0.5rem"}}>
                🖼️ Poster Send Time
                <span style={{color:"var(--muted)",fontWeight:400,fontSize:"0.8rem"}}>(daily question sent to WhatsApp group)</span>
              </label>
              <input
                className="form-input"
                type="time"
                value={settings.posterSendTime}
                onChange={e=>setSettings(s=>({...s,posterSendTime:e.target.value}))}
                required
                style={{width:160,fontSize:"1.1rem"}}
              />
              <div style={{color:"var(--muted)",fontSize:"0.78rem",marginTop:"0.35rem"}}>
                Currently: <strong style={{color:"var(--accent)"}}>{settings.posterSendTime} IST</strong>
              </div>
            </div>
            <div className="form-group" style={{marginBottom:"1.5rem"}}>
              <label className="form-label" style={{display:"flex",alignItems:"center",gap:"0.5rem"}}>
                🤖 Question Generate Time
                <span style={{color:"var(--muted)",fontWeight:400,fontSize:"0.8rem"}}>(auto-generate questions if stock is low)</span>
              </label>
              <input
                className="form-input"
                type="time"
                value={settings.questionGenerateTime}
                onChange={e=>setSettings(s=>({...s,questionGenerateTime:e.target.value}))}
                required
                style={{width:160,fontSize:"1.1rem"}}
              />
              <div style={{color:"var(--muted)",fontSize:"0.78rem",marginTop:"0.35rem"}}>
                Currently: <strong style={{color:"var(--accent)"}}>{settings.questionGenerateTime} IST</strong>
              </div>
            </div>
            <button type="submit" className="btn-primary" disabled={settingsSaving}>
              {settingsSaving ? "Saving…" : "💾 Save Schedule"}
            </button>
          </form>
          <div style={{marginTop:"1.5rem",padding:"0.75rem 1rem",background:"rgba(124,111,255,0.08)",borderRadius:10,border:"1px solid rgba(124,111,255,0.2)",fontSize:"0.82rem",color:"var(--muted)"}}>
            <strong style={{color:"var(--accent)"}}>ℹ️ How it works:</strong><br/>
            The bot checks for time changes every minute. After saving, the new schedule takes effect automatically — no restart needed.
          </div>
        </div>

        {/* Reset Controls */}
        <div className="card" style={{maxWidth:480,marginTop:"1rem"}}>
          <div className="section-title">🔄 Reset Controls</div>
          <p style={{color:"var(--muted)",fontSize:"0.85rem",marginBottom:"1.5rem"}}>
            Manually trigger resets. These are normally done automatically by the bot at midnight.
          </p>
          <div style={{display:"flex",flexDirection:"column",gap:"0.75rem"}}>
            {[
              { label:"🌅 Reset Day", desc:"Clears today's submissions & question status", key:"day", endpoint:"/users/reset/day", role:"both" },
              { label:"📅 Reset Weekly", desc:"Resets weekly submissions & weekly fines to 0", key:"weekly", endpoint:"/users/reset/weekly", role:"both" },
              { label:"📆 Reset Monthly", desc:"Resets monthly submission counts to 0", key:"monthly", endpoint:"/users/reset/monthly", role:"both" },
              { label:"💸 Reset All Fines", desc:"Clears ALL users' fines to ₹0", key:"fines", endpoint:"/users/reset/fines", role:"admin" },
            ].map(({label,desc,key,endpoint})=>(
              <div key={key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0.75rem 1rem",background:"var(--bg-secondary)",borderRadius:10,border:"1px solid var(--border)"}}>
                <div>
                  <div style={{fontWeight:600,fontSize:"0.9rem"}}>{label}</div>
                  <div style={{color:"var(--muted)",fontSize:"0.78rem"}}>{desc}</div>
                </div>
                <button
                  className="btn-ghost danger"
                  style={{fontSize:"0.82rem",whiteSpace:"nowrap"}}
                  disabled={resetting===key}
                  onClick={()=>setModal({
                    type:"danger", title:label,
                    message:`${desc}. This cannot be undone. Continue?`,
                    confirmText:"Yes, Reset",
                    onConfirm: async()=>{
                      setModal(null); setResetting(key);
                      try{ await api.post(endpoint); msg(`${label} done!`); load(); }
                      catch(e){ msg(e?.response?.data?.error||"Failed","danger"); }
                      finally{ setResetting(""); }
                    },
                  })}
                >
                  {resetting===key?"Resetting…":"Reset"}
                </button>
              </div>
            ))}
          </div>
        </div>
        </>
      )}

      {/* LIVE SESSIONS */}
      {tab==="live" && <LiveSessionsPanel />}

      {/* MANUAL QUESTIONS */}
      {tab==="manual-questions" && <ManualQuestionsPanel />}

      {/* STUDENT DETAIL */}
      {tab==="student-detail" && selectedStudent && (
        <>
          <div className="stat-grid" style={{marginBottom:"1rem"}}>
            <StatCard icon="🔥" label="Streak" value={`${selectedStudent.streak||0} days`} color="#f97316"/>
            <StatCard icon="💸" label="Fine" value={`₹${selectedStudent.fine||0}`} color="#f87171"/>
            <StatCard icon="📅" label="Weekly" value={`${selectedStudent.weeklySubmissions||0}/7`} color="#4ade80"/>
            <StatCard icon="📆" label="Monthly" value={selectedStudent.monthlySubmissions||0} color="#7c6fff"/>
          </div>

          <div className="card" style={{marginBottom:"1rem"}}>
            <div className="section-title">Manage Submissions</div>
            <SubmissionControls 
              phone={selectedStudent.phone}
              weeklySubmissions={selectedStudent.weeklySubmissions || 0}
              monthlySubmissions={selectedStudent.monthlySubmissions || 0}
              onUpdate={handleSubmissionUpdate}
            />
          </div>

          <div className="card">
            <div className="section-title">Student Information</div>
            <div style={{display:"grid",gap:"0.75rem",fontSize:"0.9rem"}}>
              <div style={{display:"flex",justifyContent:"space-between"}}>
                <span style={{color:"var(--muted)"}}>Name:</span>
                <span style={{fontWeight:500}}>{selectedStudent.registeredName||selectedStudent.name||"—"}</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between"}}>
                <span style={{color:"var(--muted)"}}>Phone:</span>
                <span style={{fontWeight:500}}>{selectedStudent.phone}</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between"}}>
                <span style={{color:"var(--muted)"}}>Role:</span>
                <span style={{fontWeight:500}}>{selectedStudent.role||"user"}</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between"}}>
                <span style={{color:"var(--muted)"}}>Status:</span>
                <span style={{color:selectedStudent.isActive?"var(--success)":"var(--danger)",fontWeight:600}}>
                  {selectedStudent.isActive?"Active":"Disabled"}
                </span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between"}}>
                <span style={{color:"var(--muted)"}}>Today's Submission:</span>
                <span style={{color:selectedStudent.completed?"var(--success)":"var(--danger)",fontWeight:600}}>
                  {selectedStudent.completed?"✅ Submitted":"⏳ Pending"}
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </Layout>
  );
}

// ── Live Sessions Panel ───────────────────────────────────────────────────────
function LiveSessionsPanel() {
  const navigate = useNavigate();
  const confirm  = useConfirm();
  const [sessions, setSessions]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);
  const [form, setForm]             = useState({ title: "", scheduledAt: "", description: "", maxParticipants: 20 });
  const [saving, setSaving]         = useState(false);
  const [busy, setBusy]             = useState({});
  const [toast, setToast]           = useState(null);

  const notify = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const load = async () => {
    try {
      const res = await api.get("/live-sessions");
      setSessions(res.data);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/live-sessions", form);
      setForm({ title: "", scheduledAt: "", description: "", maxParticipants: 20 });
      setShowForm(false);
      notify("Session scheduled!");
      load();
    } catch (err) {
      notify(err.response?.data?.error || "Failed to create session", "error");
    } finally { setSaving(false); }
  };

  const start = async (id) => {
    setBusy(b => ({ ...b, [id]: "starting" }));
    try { await api.post(`/live-sessions/${id}/start`); notify("Session is now LIVE! 🔴"); load(); }
    catch (err) { notify(err.response?.data?.error || "Failed to start", "error"); }
    finally { setBusy(b => ({ ...b, [id]: null })); }
  };

  const end = async (id) => {
    const ok = await confirm({ title: "End Session", message: "End this session for all participants?", confirmText: "End Session", type: "danger" });
    if (!ok) return;
    setBusy(b => ({ ...b, [id]: "ending" }));
    try { await api.post(`/live-sessions/${id}/end`); notify("Session ended."); load(); }
    catch (err) { notify(err.response?.data?.error || "Failed to end", "error"); }
    finally { setBusy(b => ({ ...b, [id]: null })); }
  };

  const cancel = async (id) => {
    const ok = await confirm({ title: "Cancel Session", message: "Cancel this scheduled session? This cannot be undone.", confirmText: "Yes, Cancel", type: "danger" });
    if (!ok) return;
    setBusy(b => ({ ...b, [id]: "cancelling" }));
    try { await api.delete(`/live-sessions/${id}`); notify("Session cancelled."); load(); }
    catch (err) { notify(err.response?.data?.error || "Failed to cancel", "error"); }
    finally { setBusy(b => ({ ...b, [id]: null })); }
  };

  const statusConfig = {
    scheduled: { color: "#60a5fa", bg: "rgba(96,165,250,0.1)", label: "Scheduled", icon: "📅" },
    live:      { color: "#4ade80", bg: "rgba(74,222,128,0.1)", label: "🔴 Live",    icon: "🔴" },
    ended:     { color: "#6b7280", bg: "rgba(107,114,128,0.1)", label: "Ended",    icon: "✅" },
  };

  const liveSessions      = sessions.filter(s => s.status === "live");
  const scheduledSessions = sessions.filter(s => s.status === "scheduled");
  const endedSessions     = sessions.filter(s => s.status === "ended");

  return (
    <div style={{ maxWidth: 700 }}>
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 800 }}>🎥 Live Sessions</h2>
          <p style={{ margin: "0.25rem 0 0", color: "var(--muted)", fontSize: "0.85rem" }}>
            Schedule and manage live video sessions for your group
          </p>
        </div>
        <button
          onClick={() => setShowForm(f => !f)}
          style={{
            background: showForm ? "rgba(248,113,113,0.15)" : "linear-gradient(135deg,#7c6fff,#4f46e5)",
            border: showForm ? "1px solid rgba(248,113,113,0.3)" : "none",
            color: showForm ? "#f87171" : "#fff",
            borderRadius: 12, padding: "0.65rem 1.25rem",
            fontWeight: 700, fontSize: "0.9rem", cursor: "pointer",
            transition: "all 0.2s",
          }}
        >
          {showForm ? "✕ Cancel" : "+ Schedule Session"}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div style={{
          background: "linear-gradient(135deg, rgba(124,111,255,0.08), rgba(79,70,229,0.05))",
          border: "1px solid rgba(124,111,255,0.25)",
          borderRadius: 16, padding: "1.5rem", marginBottom: "1.5rem",
        }}>
          <div style={{ fontWeight: 700, marginBottom: "1rem", fontSize: "1rem" }}>📅 New Session</div>
          <form onSubmit={create}>
            <div className="grid-cols-2" style={{ marginBottom: "0.75rem" }}>
              <div>
                <label className="form-label">Session Title *</label>
                <input className="form-input" placeholder="e.g. Weekly Speaking Practice" required
                  value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Date & Time *</label>
                <input className="form-input" type="datetime-local" required
                  value={form.scheduledAt} onChange={e => setForm(f => ({ ...f, scheduledAt: e.target.value }))} />
              </div>
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <label className="form-label">Description (optional)</label>
              <input className="form-input" placeholder="What will be covered in this session…"
                value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <label className="form-label">
                Max Participants
                <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: "0.75rem", marginLeft: "0.5rem" }}>
                  (2–100, default 20)
                </span>
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <input
                  className="form-input"
                  type="number"
                  min={2} max={100}
                  style={{ width: 100 }}
                  value={form.maxParticipants}
                  onChange={e => setForm(f => ({ ...f, maxParticipants: Math.min(100, Math.max(2, parseInt(e.target.value) || 20)) }))}
                />
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                  {[5, 10, 20, 30, 50].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, maxParticipants: n }))}
                      style={{
                        padding: "0.25rem 0.6rem", borderRadius: 8, fontSize: "0.75rem",
                        border: form.maxParticipants === n ? "1px solid #7c6fff" : "1px solid var(--border)",
                        background: form.maxParticipants === n ? "rgba(124,111,255,0.2)" : "var(--bg-secondary)",
                        color: form.maxParticipants === n ? "#a78bfa" : "var(--muted)",
                        cursor: "pointer",
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <button type="submit" className="btn-primary" disabled={saving} style={{ minWidth: 160 }}>
              {saving ? "Scheduling…" : "📅 Schedule Session"}
            </button>
          </form>
        </div>
      )}

      {loading && <div className="spinner-wrap"><div className="spinner" /></div>}

      {/* Live now */}
      {liveSessions.length > 0 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#4ade80", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>
            🔴 Live Now
          </div>
          {liveSessions.map(s => <SessionCard key={s._id} s={s} onStart={start} onEnd={end} busy={busy} navigate={navigate} />)}
        </div>
      )}

      {/* Scheduled */}
      {scheduledSessions.length > 0 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>
            📅 Upcoming
          </div>
          {scheduledSessions.map(s => <SessionCard key={s._id} s={s} onStart={start} onEnd={end} onCancel={cancel} busy={busy} navigate={navigate} />)}
        </div>
      )}

      {/* Ended */}
      {endedSessions.length > 0 && (
        <div>
          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>
            ✅ Past Sessions
          </div>
          {endedSessions.slice(0, 5).map(s => <SessionCard key={s._id} s={s} onStart={start} onEnd={end} busy={busy} navigate={navigate} />)}
        </div>
      )}

      {!loading && sessions.length === 0 && (
        <div style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--muted)" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🎥</div>
          <div style={{ fontWeight: 600, marginBottom: "0.5rem" }}>No sessions yet</div>
          <div style={{ fontSize: "0.85rem" }}>Click "+ Schedule Session" to create your first live session</div>
        </div>
      )}
    </div>
  );
}

function SessionCard({ s, onStart, onEnd, onCancel, busy, navigate }) {
  const isLive      = s.status === "live";
  const isScheduled = s.status === "scheduled";
  const isEnded     = s.status === "ended";

  const borderColor = isLive ? "rgba(74,222,128,0.4)" : isScheduled ? "rgba(96,165,250,0.25)" : "rgba(255,255,255,0.06)";
  const bgColor     = isLive ? "rgba(74,222,128,0.05)" : "var(--bg-secondary)";

  return (
    <div style={{
      background: bgColor,
      border: `1px solid ${borderColor}`,
      borderRadius: 14, padding: "1rem 1.25rem",
      marginBottom: "0.75rem",
      transition: "all 0.2s",
      position: "relative",
      overflow: "hidden",
    }}>
      {isLive && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 3,
          background: "linear-gradient(90deg, #4ade80, #22c55e)",
          animation: "shimmer 2s linear infinite",
        }} />
      )}

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem" }}>
            <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text)" }}>{s.title}</span>
            <span style={{
              fontSize: "0.65rem", fontWeight: 700, padding: "0.15rem 0.5rem",
              borderRadius: 20, textTransform: "uppercase",
              background: isLive ? "rgba(74,222,128,0.15)" : isScheduled ? "rgba(96,165,250,0.15)" : "rgba(107,114,128,0.15)",
              color: isLive ? "#4ade80" : isScheduled ? "#60a5fa" : "#6b7280",
            }}>
              {isLive ? "🔴 Live" : isScheduled ? "Scheduled" : "Ended"}
            </span>
          </div>

          {s.description && (
            <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginBottom: "0.4rem" }}>{s.description}</div>
          )}

          <div style={{ display: "flex", gap: "1rem", fontSize: "0.78rem", color: "var(--muted)", flexWrap: "wrap" }}>
            <span>📅 {new Date(s.scheduledAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
            {s.participantCount > 0 && (
              <span style={{ color: s.participantCount >= (s.maxParticipants || 20) ? "#f87171" : "var(--muted)" }}>
                👥 {s.participantCount}/{s.maxParticipants || 20}
                {s.participantCount >= (s.maxParticipants || 20) && " 🔴 Full"}
              </span>
            )}
            {s.participantCount === 0 && (
              <span>👥 0/{s.maxParticipants || 20} max</span>
            )}
            {s.durationMinutes && <span>⏱️ {s.durationMinutes} min</span>}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0, alignItems: "center" }}>
          {isScheduled && (
            <button
              onClick={() => onStart(s._id)}
              disabled={busy[s._id] === "starting"}
              style={{
                background: "linear-gradient(135deg,#4ade80,#22c55e)",
                color: "#065f46", border: "none", borderRadius: 10,
                padding: "0.5rem 1rem", fontWeight: 700, fontSize: "0.82rem",
                cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              {busy[s._id] === "starting" ? "Starting…" : "🔴 Go Live"}
            </button>
          )}
          {isScheduled && onCancel && (
            <button
              onClick={() => onCancel(s._id)}
              disabled={busy[s._id] === "cancelling"}
              style={{
                background: "rgba(248,113,113,0.12)",
                border: "1px solid rgba(248,113,113,0.3)",
                color: "#f87171", borderRadius: 10,
                padding: "0.5rem 0.85rem", fontWeight: 700, fontSize: "0.82rem",
                cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              {busy[s._id] === "cancelling" ? "Cancelling…" : "✕ Cancel"}
            </button>
          )}
          {isLive && (
            <>
              <button
                onClick={() => window.open(`/live/${s._id}`, "_blank")}
                style={{
                  background: "linear-gradient(135deg,#7c6fff,#4f46e5)",
                  color: "#fff", border: "none", borderRadius: 10,
                  padding: "0.5rem 1rem", fontWeight: 700, fontSize: "0.82rem",
                  cursor: "pointer", whiteSpace: "nowrap",
                }}
              >
                📹 Join
              </button>
              <button
                onClick={() => onEnd(s._id)}
                disabled={busy[s._id] === "ending"}
                style={{
                  background: "rgba(248,113,113,0.15)", border: "1px solid rgba(248,113,113,0.3)",
                  color: "#f87171", borderRadius: 10,
                  padding: "0.5rem 0.85rem", fontWeight: 700, fontSize: "0.82rem",
                  cursor: "pointer", whiteSpace: "nowrap",
                }}
              >
                {busy[s._id] === "ending" ? "Ending…" : "⏹ End"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Monitoring Panel ─────────────────────────────────────────────────────────
function MonitoringPanel() {
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
function ManualQuestionsPanel() {
  const [manualQuestions, setManualQuestions] = useState([]);
  const [templates, setTemplates] = useState({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    setupType: "weekly_reflection",
    scheduledFor: "",
    category: "",
    topic: "",
    question: ""
  });
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState({});
  const [toast, setToast] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState("");

  const notify = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
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

  const setupQuestion = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/questions/manual", form);
      setForm({
        setupType: "weekly_reflection",
        scheduledFor: "",
        category: "",
        topic: "",
        question: ""
      });
      setSelectedTemplate("");
      setShowForm(false);
      notify("Manual question scheduled successfully!");
      load();
    } catch (err) {
      notify(err.response?.data?.error || "Failed to setup question", "error");
    } finally {
      setSaving(false);
    }
  };

  const deleteQuestion = async (id) => {
    setBusy(b => ({ ...b, [id]: true }));
    try {
      await api.delete(`/questions/manual/${id}`);
      notify("Question deleted successfully!");
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
      category: f.setupType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
      topic: f.setupType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
    }));
  };

  const getNextSunday = () => {
    const today = new Date();
    const nextSunday = new Date(today);
    nextSunday.setDate(today.getDate() + (7 - today.getDay()));
    return nextSunday.toISOString().split('T')[0];
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

  const getDefaultDate = (setupType) => {
    switch (setupType) {
      case "weekly_reflection": return getNextSunday();
      case "monthly_goals": return getNextMonthFirst();
      case "monthly_reflection": return getNextMonthLast();
      default: return "";
    }
  };

  const setupTypeLabels = {
    weekly_reflection: "Weekly Reflection (Sunday)",
    monthly_goals: "Monthly Goals (1st of month)",
    monthly_reflection: "Monthly Reflection (Last day of month)"
  };

  const groupedQuestions = {
    weekly_reflection: manualQuestions.filter(q => q.setupType === "weekly_reflection"),
    monthly_goals: manualQuestions.filter(q => q.setupType === "monthly_goals"),
    monthly_reflection: manualQuestions.filter(q => q.setupType === "monthly_reflection")
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 800 }}>📝 Manual Questions</h2>
          <p style={{ margin: "0.25rem 0 0", color: "var(--muted)", fontSize: "0.85rem" }}>
            Setup custom questions for weekly and monthly reflections
          </p>
        </div>
        <button
          onClick={() => setShowForm(f => !f)}
          style={{
            background: showForm ? "rgba(248,113,113,0.15)" : "linear-gradient(135deg,#7c6fff,#4f46e5)",
            border: showForm ? "1px solid rgba(248,113,113,0.3)" : "none",
            color: showForm ? "#f87171" : "#fff",
            borderRadius: 12, padding: "0.65rem 1.25rem",
            fontWeight: 700, fontSize: "0.9rem", cursor: "pointer",
            transition: "all 0.2s",
          }}
        >
          {showForm ? "✕ Cancel" : "+ Setup Question"}
        </button>
      </div>

      {/* Setup form */}
      {showForm && (
        <div style={{
          background: "linear-gradient(135deg, rgba(124,111,255,0.08), rgba(79,70,229,0.05))",
          border: "1px solid rgba(124,111,255,0.25)",
          borderRadius: 16, padding: "1.5rem", marginBottom: "1.5rem",
        }}>
          <div style={{ fontWeight: 700, marginBottom: "1rem", fontSize: "1rem" }}>📝 Setup Manual Question</div>
          <form onSubmit={setupQuestion}>
            <div className="grid-cols-2" style={{ marginBottom: "0.75rem" }}>
              <div>
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
                      category: newType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
                      topic: newType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
                    }));
                    setSelectedTemplate("");
                  }}
                >
                  {Object.entries(setupTypeLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
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
                  placeholder="e.g. Weekly Reflection" 
                  required
                  value={form.category} 
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))} 
                />
              </div>
              <div>
                <label className="form-label">Topic *</label>
                <input 
                  className="form-input" 
                  placeholder="e.g. Weekly Progress Review" 
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
            <button type="submit" className="btn-primary" disabled={saving} style={{ minWidth: 160 }}>
              {saving ? "Setting up…" : "📝 Setup Question"}
            </button>
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
                    border: "1px solid rgba(124,111,255,0.25)",
                    borderRadius: 14, 
                    padding: "1rem 1.25rem",
                    marginBottom: "0.75rem",
                    transition: "all 0.2s",
                  }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem" }}>
                          <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text)" }}>{q.topic}</span>
                          <span style={{
                            fontSize: "0.65rem", fontWeight: 700, padding: "0.15rem 0.5rem",
                            borderRadius: 20, textTransform: "uppercase",
                            background: "rgba(124,111,255,0.15)",
                            color: "#7c6fff",
                          }}>
                            Manual
                          </span>
                        </div>

                        <div style={{ fontSize: "0.85rem", color: "var(--text)", marginBottom: "0.4rem", lineHeight: 1.4 }}>
                          {q.question}
                        </div>

                        <div style={{ display: "flex", gap: "1rem", fontSize: "0.78rem", color: "var(--muted)", flexWrap: "wrap" }}>
                          <span>📅 {new Date(q.scheduledFor).toLocaleDateString("en-IN", { dateStyle: "medium" })}</span>
                          <span>👤 {q.createdBy}</span>
                          <span>📂 {q.category}</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0, alignItems: "center" }}>
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
              <div style={{ fontSize: "0.85rem" }}>Click "+ Setup Question" to create custom weekly or monthly questions</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}