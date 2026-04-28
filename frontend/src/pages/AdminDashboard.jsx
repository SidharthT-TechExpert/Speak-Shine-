import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import StatCard from "../components/StatCard.jsx";
import Modal from "../components/Modal.jsx";
import RoleSelector from "../components/RoleSelector.jsx";
import AttendancePanel from "../components/AttendancePanel.jsx";
import SubmissionControls from "../components/SubmissionControls.jsx";
import api from "../api/client.js";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";

const CATS = ["Daily Life","Opinion","Personal Experience","English Growth","Future Goals","Fun Topic","Free Talk"];
const PIE_COLORS = ["#7c6fff","#4ade80","#fbbf24","#ff6b9d","#38bdf8","#fb923c","#a78bfa"];
const tt = { background:"#16162a", border:"1px solid #252545", borderRadius:10, fontSize:12 };
const TABS = [{id:"overview",l:"📊 Overview"},{id:"today",l:"📅 Today"},{id:"users",l:"👥 Users"},{id:"reports",l:"📈 Reports"},{id:"fines",l:"💸 Fines"},{id:"attendance",l:"📋 Attendance"},{id:"questions",l:"❓ Questions"},{id:"monitoring",l:"🖥️ Monitor"},{id:"settings",l:"⚙️ Settings"}];

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
  const [qCat, setQCat] = useState("");
  const [modal, setModal] = useState(null);
  const [fineInput, setFineInput] = useState("");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [settings, setSettings] = useState({ posterSendTime: "08:00", questionGenerateTime: "07:00" });
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [resetting, setResetting] = useState("");
  const [publishQ, setPublishQ] = useState(null); // selected question for webapp publish
  const [publishCustom, setPublishCustom] = useState({ topic:"", question:"", category:"" }); // manual entry

  const load = async () => {
    setLoading(true);
    try {
      const [d,u,q,w,m,s] = await Promise.all([api.get("/dashboard"),api.get("/users"),api.get("/questions?limit=200"),api.get("/dashboard/report/weekly"),api.get("/dashboard/report/monthly"),api.get("/dashboard/settings")]);
      setDash(d.data); setUsers(u.data); setQuestions(q.data.questions); setWeekly(w.data); setMonthly(m.data);
      setSettings({ posterSendTime: s.data.posterSendTime || "08:00", questionGenerateTime: s.data.questionGenerateTime || "07:00" });
    } finally { setLoading(false); }
  };
  useEffect(()=>{load();},[]);

  const msg = (text, type="success") => { setFlash({text,type}); setTimeout(()=>setFlash(null),3000); };
  const toggleUser = async (phone) => { await api.patch(`/users/${phone}/toggle`); msg("Status toggled"); load(); };
  
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
      onConfirm: async () => { setModal(null); await api.delete(`/users/${phone}`); msg("Removed","danger"); load(); },
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
        msg("Fine reset"); load();
      },
    });
  };
  const saveQ = async (e) => { e.preventDefault(); if(editQ){await api.patch(`/questions/${editQ._id}`,qForm);setEditQ(null);msg("Updated!");}else{await api.post("/questions",qForm);msg("Added!");} setQForm({category:"",topic:"",question:""}); load(); };
  const deleteQ = async (id) => {
    setModal({
      type: "danger", title: "Delete Question",
      message: "This question will be permanently deleted.",
      confirmText: "Delete",
      onConfirm: async () => { setModal(null); await api.delete(`/questions/${id}`); msg("Deleted","danger"); load(); },
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
          load();
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
          load();
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
            msg(`Fine adjusted ₹${fineInput}`); load();
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
          <div className="grid-2" style={{marginBottom:"1rem"}}>
            <div className="card">
              <div className="section-title">📊 Today's Submission Rate</div>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart><Pie data={pieSub} dataKey="value" cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} label={({name,value})=>`${name}: ${value}`}>
                  {pieSub.map((e,i)=><Cell key={i} fill={e.color}/>)}
                </Pie><Tooltip contentStyle={tt}/></PieChart>
              </ResponsiveContainer>
            </div>
            <div className="card">
              <div className="section-title">🏆 Top Streaks</div>
              <div className="streak-list">
                {(dash?.topStreak||[]).map((u,i)=>(
                  <div className="streak-row" key={i}>
                    <span className="streak-rank">{["🥇","🥈","🥉"][i]||`${i+1}.`}</span>
                    <span className="streak-name">{u.name||u.userId?.split("@")[0]}</span>
                    <span className="streak-val">🔥 {u.streak}</span>
                    <span className="streak-sub">{u.weeklySubmissions}/7</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="grid-2">
            <div className="card">
              <div className="section-title">📅 Weekly Submissions</div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={weekly.slice(0,10).map(u=>({name:(u.name||"?").slice(0,8),days:u.weeklySubmissions||0}))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1e40"/>
                  <XAxis dataKey="name" stroke="#606080" fontSize={11}/>
                  <YAxis domain={[0,7]} stroke="#606080" fontSize={11}/>
                  <Tooltip contentStyle={tt}/>
                  <Bar dataKey="days" fill="#7c6fff" radius={[6,6,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="card">
              <div className="section-title">❓ Questions by Category</div>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart><Pie data={catPie} dataKey="value" cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2} label={({value})=>value}>
                  {catPie.map((_,i)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}/>)}
                </Pie><Tooltip contentStyle={tt}/><Legend iconSize={10} wrapperStyle={{fontSize:"0.72rem"}}/></PieChart>
              </ResponsiveContainer>
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
                load();
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
                      onRoleChange={() => load()}
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
                    <button className="btn-ghost danger" onClick={()=>deleteUser(u.phone)}>Remove</button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
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
            <StatCard icon="💸" label="Total Outstanding" value={`₹${users.reduce((s,u)=>s+(u.fine||0),0)}`} color="#f87171"/>
            <StatCard icon="⚠️" label="Users with Fines"  value={users.filter(u=>(u.fine||0)>0).length}      color="#fbbf24"/>
            <StatCard icon="✅" label="Fine-Free Users"   value={users.filter(u=>(u.fine||0)===0).length}    color="#4ade80"/>
            <StatCard icon="📊" label="Avg Fine"          value={`₹${users.length?Math.round(users.reduce((s,u)=>s+(u.fine||0),0)/users.length):0}`} color="#7c6fff"/>
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
                    <td style={{color:u.fine>0?"var(--danger)":"var(--success)",fontWeight:600}}>₹{u.fine||0}</td>
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

      {/* ATTENDANCE */}
      {tab==="attendance" && (
        <AttendancePanel />
      )}

      {/* QUESTIONS */}
      {tab==="questions" && (
        <>
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
              <div className="section-title" style={{margin:0}}>Question Bank ({filteredQ.length}/{questions.length})</div>
              <div style={{display:"flex",gap:"0.5rem",flexWrap:"wrap"}}>
                <select className="form-input" style={{width:"auto"}} value={qCat} onChange={e=>setQCat(e.target.value)}>
                  <option value="">All Categories</option>
                  {CATS.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
                <input className="form-input" style={{width:180}} placeholder="Search…" value={qSearch} onChange={e=>setQSearch(e.target.value)}/>
              </div>
            </div>
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

      {/* MONITORING */}
      {tab==="monitoring" && <MonitoringPanel />}

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
      {tab==="settings" && <LiveSessionsPanel />}

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
  const [sessions, setSessions]   = useState([]);
  const [form, setForm]           = useState({ title: "", scheduledAt: "", description: "" });
  const [saving, setSaving]       = useState(false);
  const [busy, setBusy]           = useState({});
  const navigate = useNavigate?.() || null;

  const load = async () => {
    try {
      const res = await api.get("/live-sessions");
      setSessions(res.data);
    } catch {}
  };

  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/live-sessions", form);
      setForm({ title: "", scheduledAt: "", description: "" });
      load();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to create session");
    } finally { setSaving(false); }
  };

  const start = async (id) => {
    setBusy(b => ({ ...b, [id]: "starting" }));
    try { await api.post(`/live-sessions/${id}/start`); load(); }
    catch (err) { alert(err.response?.data?.error || "Failed to start"); }
    finally { setBusy(b => ({ ...b, [id]: null })); }
  };

  const end = async (id) => {
    if (!confirm("End this session for all participants?")) return;
    setBusy(b => ({ ...b, [id]: "ending" }));
    try { await api.post(`/live-sessions/${id}/end`); load(); }
    catch (err) { alert(err.response?.data?.error || "Failed to end"); }
    finally { setBusy(b => ({ ...b, [id]: null })); }
  };

  const statusColor = { scheduled: "#60a5fa", live: "#4ade80", ended: "#8888aa" };

  return (
    <div className="card" style={{ maxWidth: 600, marginTop: "1rem" }}>
      <div className="section-title">🎥 Live Sessions</div>

      {/* Create form */}
      <form onSubmit={create} style={{ marginBottom: "1.5rem" }}>
        <div className="form-group" style={{ marginBottom: "0.75rem" }}>
          <label className="form-label">Session Title</label>
          <input className="form-input" placeholder="e.g. Weekly Speaking Practice" required
            value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
        </div>
        <div className="form-group" style={{ marginBottom: "0.75rem" }}>
          <label className="form-label">Scheduled Date & Time</label>
          <input className="form-input" type="datetime-local" required
            value={form.scheduledAt} onChange={e => setForm(f => ({ ...f, scheduledAt: e.target.value }))} />
        </div>
        <div className="form-group" style={{ marginBottom: "1rem" }}>
          <label className="form-label">Description (optional)</label>
          <input className="form-input" placeholder="What will be covered…"
            value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
        </div>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? "Scheduling…" : "📅 Schedule Session"}
        </button>
      </form>

      {/* Session list */}
      {sessions.length === 0 && <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>No sessions yet.</p>}
      {sessions.map(s => (
        <div key={s._id} style={{
          background: "var(--bg-secondary)", border: "1px solid var(--border)",
          borderRadius: 12, padding: "0.85rem 1rem", marginBottom: "0.75rem",
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.5rem" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, marginBottom: "0.2rem" }}>{s.title}</div>
              <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
                {new Date(s.scheduledAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                {s.participantCount > 0 && ` · ${s.participantCount} joined`}
                {s.durationMinutes && ` · ${s.durationMinutes} min`}
              </div>
            </div>
            <span style={{
              fontSize: "0.7rem", fontWeight: 700, padding: "0.2rem 0.6rem",
              borderRadius: 20, background: `${statusColor[s.status]}22`,
              color: statusColor[s.status], textTransform: "uppercase",
            }}>{s.status}</span>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
            {s.status === "scheduled" && (
              <button className="btn-primary" style={{ fontSize: "0.82rem", padding: "0.4rem 0.85rem" }}
                disabled={busy[s._id] === "starting"} onClick={() => start(s._id)}>
                {busy[s._id] === "starting" ? "Starting…" : "🔴 Go Live"}
              </button>
            )}
            {s.status === "live" && (
              <>
                <button className="btn-primary" style={{ fontSize: "0.82rem", padding: "0.4rem 0.85rem" }}
                  onClick={() => window.open(`/live/${s._id}`, "_blank")}>
                  📹 Join as Admin
                </button>
                <button className="btn-danger" style={{ fontSize: "0.82rem", padding: "0.4rem 0.85rem" }}
                  disabled={busy[s._id] === "ending"} onClick={() => end(s._id)}>
                  {busy[s._id] === "ending" ? "Ending…" : "⏹ End Session"}
                </button>
              </>
            )}
          </div>
        </div>
      ))}
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
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"0.75rem"}}>
        <MonStat icon="👥" label="Active Users" value={activeUsers} accent="#7c6fff" />
        <MonStat icon="✅" label="Done Today" value={videos.completedToday} accent="#4ade80" />
        <MonStat icon="❌" label="Failed Today" value={videos.failedToday} accent={videos.failedToday > 0 ? "#f87171" : "#4ade80"} />
      </div>

      {/* Row 2: 3 stat tiles */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"0.75rem"}}>
        <MonStat icon="🎬" label="Processing Now" value={isIdle ? "Idle" : `${videos.processing} active`} accent="#38bdf8" />
        <MonStat icon="⏱️" label="Avg Process Time" value={queue.avgProcessingMin ? `${queue.avgProcessingMin} min` : "—"} accent="#fbbf24" />
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

      {/* Queue + Errors side by side on wide screens */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.75rem"}}>

        {/* Queue */}
        <div className="card">
          <div style={{fontWeight:600,fontSize:"0.95rem",marginBottom:"1rem"}}>🚦 Video Queue</div>
          {isIdle ? (
            <div style={{display:"flex",alignItems:"center",gap:"0.5rem",color:"#4ade80",fontWeight:500,fontSize:"0.9rem"}}>
              <span style={{fontSize:"1.1rem"}}>✅</span> Queue empty
            </div>
          ) : (
            <div style={{display:"grid",gap:"0.6rem",fontSize:"0.88rem"}}>
              <QueueRow label="Processing" value={videos.activeJobId ? `#${String(videos.activeJobId).slice(-6)}` : "—"} valueColor="#fbbf24" />
              <QueueRow label="Waiting" value={`${videos.queued} video${videos.queued !== 1 ? "s" : ""}`} />
              <QueueRow label="Est. wait" value={queue.avgProcessingMin ? `~${queue.avgProcessingMin} min` : "~2.5 min"} />
            </div>
          )}
          <div style={{marginTop:"1rem",paddingTop:"0.75rem",borderTop:"1px solid var(--border)",display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.5rem",fontSize:"0.82rem",color:"var(--muted)"}}>
            <span>Total processed: <strong style={{color:"var(--text)"}}>{queue.totalProcessed}</strong></span>
            <span>Total failed: <strong style={{color: queue.totalFailed > 0 ? "#f87171" : "var(--text)"}}>{queue.totalFailed}</strong></span>
          </div>
        </div>

        {/* Errors */}
        <div className="card">
          <div style={{fontWeight:600,fontSize:"0.95rem",marginBottom:"1rem"}}>
            ⚠️ Errors Today
            {queue.errorsToday > 0 && (
              <span style={{marginLeft:"0.5rem",background:"rgba(248,113,113,0.15)",color:"#f87171",borderRadius:99,padding:"0.1rem 0.5rem",fontSize:"0.75rem"}}>
                {queue.errorsToday}
              </span>
            )}
          </div>
          {!queue.recentErrors || queue.recentErrors.length === 0 ? (
            <div style={{display:"flex",alignItems:"center",gap:"0.5rem",color:"#4ade80",fontWeight:500,fontSize:"0.9rem"}}>
              <span style={{fontSize:"1.1rem"}}>✅</span> No errors today
            </div>
          ) : (
            <div style={{display:"grid",gap:"0.5rem",maxHeight:160,overflowY:"auto"}}>
              {queue.recentErrors.map((e, i) => (
                <div key={i} style={{background:"rgba(248,113,113,0.07)",border:"1px solid rgba(248,113,113,0.18)",borderRadius:8,padding:"0.5rem 0.75rem"}}>
                  <div style={{color:"#f87171",fontWeight:600,fontSize:"0.78rem",marginBottom:"0.2rem"}}>
                    {String(e.reportId).slice(-8)} · {new Date(e.at).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}
                  </div>
                  <div style={{color:"var(--muted)",fontSize:"0.78rem",lineHeight:1.4}}>{e.error}</div>
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
