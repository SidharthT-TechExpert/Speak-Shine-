import { useEffect, useState, useMemo } from "react";
import Layout from "../components/Layout.jsx";
import StatCard from "../components/StatCard.jsx";
import api from "../api/client.js";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";

const CATS = ["Daily Life","Opinion","Personal Experience","English Growth","Future Goals","Fun Topic","Free Talk"];
const PIE_COLORS = ["#7c6fff","#4ade80","#fbbf24","#ff6b9d","#38bdf8","#fb923c","#a78bfa"];
const tt = { background:"#16162a", border:"1px solid #252545", borderRadius:10, fontSize:12 };
const TABS = [{id:"overview",l:"📊 Overview"},{id:"today",l:"📅 Today"},{id:"users",l:"👥 Users"},{id:"reports",l:"📈 Reports"},{id:"fines",l:"💸 Fines"},{id:"questions",l:"❓ Questions"}];

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

  const load = async () => {
    setLoading(true);
    try {
      const [d,u,q,w,m] = await Promise.all([api.get("/dashboard"),api.get("/users"),api.get("/questions?limit=200"),api.get("/dashboard/report/weekly"),api.get("/dashboard/report/monthly")]);
      setDash(d.data); setUsers(u.data); setQuestions(q.data.questions); setWeekly(w.data); setMonthly(m.data);
    } finally { setLoading(false); }
  };
  useEffect(()=>{load();},[]);

  const msg = (text, type="success") => { setFlash({text,type}); setTimeout(()=>setFlash(null),3000); };
  const changeRole = async (phone,role) => { await api.patch(`/users/${phone}/role`,{role}); msg(`Role → ${role}`); load(); };
  const toggleUser = async (phone) => { await api.patch(`/users/${phone}/toggle`); msg("Status toggled"); load(); };
  const deleteUser = async (phone) => { if(!confirm("Remove user?"))return; await api.delete(`/users/${phone}`); msg("Removed","danger"); load(); };
  const adjustFine = async (phone,cur) => { const v=prompt(`Adjust fine (neg=deduct). Current: ₹${cur}`,"0"); if(v===null||isNaN(+v))return; await api.patch(`/users/${phone}/fine`,{amount:+v}); msg(`Fine adjusted ₹${v}`); load(); };
  const resetFine = async (phone) => { if(!confirm("Reset fine to ₹0?"))return; const u=users.find(x=>x.phone===phone); if(!u)return; await api.patch(`/users/${phone}/fine`,{amount:-(u.fine||0)}); msg("Fine reset"); load(); };
  const saveQ = async (e) => { e.preventDefault(); if(editQ){await api.patch(`/questions/${editQ._id}`,qForm);setEditQ(null);msg("Updated!");}else{await api.post("/questions",qForm);msg("Added!");} setQForm({category:"",topic:"",question:""}); load(); };
  const deleteQ = async (id) => { if(!confirm("Delete?"))return; await api.delete(`/questions/${id}`); msg("Deleted","danger"); load(); };
  const startEdit = (q) => { setEditQ(q); setQForm({category:q.category,topic:q.topic,question:q.question}); window.scrollTo({top:0,behavior:"smooth"}); };

  const filteredUsers = useMemo(()=>users.filter(u=>{const s=search.toLowerCase();return(u.registeredName||u.name||"").toLowerCase().includes(s)||(u.phone||"").includes(s)}),[users,search]);
  const filteredQ = useMemo(()=>questions.filter(q=>(qCat?q.category===qCat:true)&&(q.question.toLowerCase().includes(qSearch.toLowerCase())||q.topic.toLowerCase().includes(qSearch.toLowerCase()))),[questions,qSearch,qCat]);

  const pieSub = [{name:"Submitted",value:dash?.stats?.completed||0,color:"#4ade80"},{name:"Pending",value:dash?.stats?.pending||0,color:"#f87171"}];
  const catCount = questions.reduce((a,q)=>{a[q.category]=(a[q.category]||0)+1;return a},{});
  const catPie = Object.entries(catCount).map(([name,value])=>({name,value}));
  const fineBar = [...users].filter(u=>(u.fine||0)>0).sort((a,b)=>(b.fine||0)-(a.fine||0)).slice(0,10).map(u=>({name:(u.registeredName||u.name||"?").slice(0,8),fine:u.fine||0}));

  if (loading) return <Layout title="Admin Dashboard"><div className="spinner-wrap"><div className="spinner"/></div></Layout>;

  return (
    <Layout title="Admin Dashboard">
      {flash && <div className={`flash ${flash.type}`}>{flash.text}</div>}

      <div className="stat-grid">
        <StatCard icon="👥" label="Total Users"     value={dash?.stats?.total||0}     color="#7c6fff"/>
        <StatCard icon="✅" label="Submitted Today" value={dash?.stats?.completed||0} color="#4ade80"/>
        <StatCard icon="❌" label="Pending Today"   value={dash?.stats?.pending||0}   color="#f87171"/>
        <StatCard icon="💸" label="Total Fines"     value={`₹${dash?.stats?.totalFines||0}`} color="#fbbf24"/>
      </div>

      <div className="tab-bar">
        {TABS.map(t=><button key={t.id} className={`tab-btn${tab===t.id?" active":""}`} onClick={()=>setTab(t.id)}>{t.l}</button>)}
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
            ? <div className="today-card"><div className="today-label">📌 Today's Question</div><div className="today-q">{dash.today.question}</div></div>
            : <div className="warn-box"><p>⏳ No question sent today yet.</p></div>}
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
                    <select value={u.role||"user"} onChange={e=>changeRole(u.phone,e.target.value)}
                      style={{background:"var(--bg2)",border:"1px solid var(--border)",color:"var(--muted)",borderRadius:8,padding:"0.2rem 0.4rem",fontSize:"0.75rem"}}>
                      {["user","trainer","admin"].map(r=><option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td>🔥 {u.streak||0}</td>
                  <td>{u.weeklySubmissions||0}/7</td>
                  <td>{u.monthlySubmissions||0}</td>
                  <td style={{color:u.fine>0?"var(--danger)":"var(--muted)",fontWeight:u.fine>0?600:400}}>₹{u.fine||0}</td>
                  <td><span style={{color:u.isActive?"var(--success)":"var(--danger)",fontSize:"0.8rem"}}>{u.isActive?"Active":"Disabled"}</span></td>
                  <td style={{whiteSpace:"nowrap"}}>
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
    </Layout>
  );
}
