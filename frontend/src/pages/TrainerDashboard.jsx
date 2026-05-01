import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import StatCard from "../components/StatCard.jsx";
import Modal from "../components/Modal.jsx";
import SubmissionControls from "../components/SubmissionControls.jsx";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import api from "../api/client.js";
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, BarChart, Bar, Cell } from "recharts";

const SCORES = { Fluency:"#7c6fff", Grammar:"#4ade80", Confidence:"#fbbf24", Vocabulary:"#ff6b9d" };
const tt = { background:"#16162a", border:"1px solid #252545", borderRadius:10, fontSize:12 };
const avg = (arr,k) => { const v=arr.filter(s=>s[k]!=null).map(s=>s[k]); return v.length?+(v.reduce((a,b)=>a+b,0)/v.length).toFixed(1):null; };
const delta = (arr,k) => { if(arr.length<2)return null; const f=arr[0][k],l=arr[arr.length-1][k]; return(f==null||l==null)?null:+(l-f).toFixed(1); };
const scoreColor = v => v>=7?"var(--success)":v>=5?"var(--warning)":"var(--danger)";
const TABS = [{id:"overview",l:"📊 Overview"},{id:"students",l:"👥 Students"},{id:"compare",l:"⚖️ Compare"},{id:"improvement",l:"📈 Improvement"},{id:"submissions",l:"📝 Submissions"},{id:"manual-questions",l:"📝 Manual Questions"},{id:"live",l:"🎥 Live Sessions"},{id:"controls",l:"🔄 Controls"}];

export default function TrainerDashboard() {
  const [dash, setDash] = useState(null);
  const [users, setUsers] = useState([]);
  const [allScores, setAllScores] = useState({});
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [scoresLoading, setScoresLoading] = useState(false);
  const [sortBy, setSortBy] = useState("streak");
  const [search, setSearch] = useState("");
  const [flash, setFlash] = useState(null);
  const [resetting, setResetting] = useState("");
  const [modal, setModal] = useState(null);

  const msg = (text, type="success") => { setFlash({text,type}); setTimeout(()=>setFlash(null),3000); };

  const resetWeekly = () => {
    setModal({
      type:"danger", title:"Reset Weekly Submissions",
      message:"This will reset ALL users' weekly submission count and weekly fines to 0. Are you sure?",
      confirmText:"Reset Weekly",
      onConfirm: async () => {
        setModal(null); setResetting("weekly");
        try { await api.post("/users/reset/weekly"); msg("Weekly submissions + fines reset"); const [d,u]=await Promise.all([api.get("/dashboard"),api.get("/users")]); setDash(d.data); setUsers(u.data); }
        catch(err){ msg(err?.response?.data?.error||"Reset failed","danger"); }
        finally { setResetting(""); }
      },
    });
  };

  const resetMonthly = () => {
    setModal({
      type:"danger", title:"Reset Monthly Submissions",
      message:"This will reset ALL users' monthly submission count to 0. Are you sure?",
      confirmText:"Reset Monthly",
      onConfirm: async () => {
        setModal(null); setResetting("monthly");
        try { await api.post("/users/reset/monthly"); msg("Monthly submissions reset"); const [d,u]=await Promise.all([api.get("/dashboard"),api.get("/users")]); setDash(d.data); setUsers(u.data); }
        catch(err){ msg(err?.response?.data?.error||"Reset failed","danger"); }
        finally { setResetting(""); }
      },
    });
  };

  useEffect(()=>{
    Promise.all([api.get("/dashboard"),api.get("/users")])
      .then(([d,u])=>{setDash(d.data);setUsers(u.data);})
      .finally(()=>setLoading(false));
  },[]);

  const loadAllScores = async (userList) => {
    const list = userList || users;
    if (!list.length) return;
    if(Object.keys(allScores).length > 0) return;
    setScoresLoading(true);
    const res={};
    await Promise.all(list.map(async u=>{try{const{data}=await api.get(`/dashboard/scores/${u.phone}`);res[u.phone]=data.feedbackScores||[];}catch{res[u.phone]=[];}}));
    setAllScores(res);setScoresLoading(false);
  };

  const handleTab = (t) => { setTab(t); if(t==="compare"||t==="improvement")loadAllScores(users); };

  const selectUser = async (user) => {
    setSelected(user); setTab("detail");
    if(!allScores[user.phone]){
      try {
        const{data}=await api.get(`/dashboard/scores/${user.phone}`);
        setAllScores(p=>({...p,[user.phone]:data.feedbackScores||[]}));
      } catch { setAllScores(p=>({...p,[user.phone]:[]})); }
    }
  };

  const handleSubmissionUpdate = (type, newValue) => {
    if (!selected) return;
    // Update the selected user's submission count
    setSelected(prev => ({
      ...prev,
      [`${type}Submissions`]: newValue
    }));
    // Also update in the users list
    setUsers(prev => prev.map(u => 
      u.phone === selected.phone 
        ? { ...u, [`${type}Submissions`]: newValue }
        : u
    ));
  };

  const filteredUsers = useMemo(()=>{
    let list=[...users];
    if(search){const s=search.toLowerCase();list=list.filter(u=>(u.registeredName||u.name||"").toLowerCase().includes(s)||(u.phone||"").includes(s));}
    if(sortBy==="streak")list.sort((a,b)=>(b.streak||0)-(a.streak||0));
    else if(sortBy==="weekly")list.sort((a,b)=>(b.weeklySubmissions||0)-(a.weeklySubmissions||0));
    else if(sortBy==="fine")list.sort((a,b)=>(b.fine||0)-(a.fine||0));
    else list.sort((a,b)=>(a.registeredName||a.name||"").localeCompare(b.registeredName||b.name||""));
    return list;
  },[users,search,sortBy]);

  const improvementData = useMemo(()=>users.map(u=>{
    const s=allScores[u.phone]||[];
    return{name:(u.registeredName||u.name||u.phone||"?").slice(0,10),phone:u.phone,sessions:s.length,fd:delta(s,"fluency"),gd:delta(s,"grammar"),cd:delta(s,"confidence"),vd:delta(s,"vocabulary"),af:avg(s,"fluency"),ag:avg(s,"grammar")};
  }).filter(u=>u.sessions>0).sort((a,b)=>{
    const ta=[a.fd,a.gd,a.cd,a.vd].filter(Boolean).reduce((s,v)=>s+v,0);
    const tb=[b.fd,b.gd,b.cd,b.vd].filter(Boolean).reduce((s,v)=>s+v,0);
    return tb-ta;
  }),[users,allScores]);

  const compareData = useMemo(()=>users.map(u=>{
    const s=allScores[u.phone]||[];
    return{name:(u.registeredName||u.name||"?").slice(0,8),Fluency:avg(s,"fluency"),Grammar:avg(s,"grammar"),Confidence:avg(s,"confidence"),Vocabulary:avg(s,"vocabulary"),sessions:s.length};
  }).filter(u=>u.sessions>0),[users,allScores]);

  if(loading)return<Layout title="Trainer Dashboard"><div className="spinner-wrap"><div className="spinner"/></div></Layout>;

  const selScores=selected?(allScores[selected.phone]||[]):[];
  const latest=selScores.slice(-1)[0];
  const radarData=latest?Object.keys(SCORES).map(k=>({subject:k,score:latest[k.toLowerCase()]||0})):[];
  const chartData=selScores.map((s,i)=>({session:`#${i+1}`,Fluency:s.fluency,Grammar:s.grammar,Confidence:s.confidence,Vocabulary:s.vocabulary}));

  const DeltaCell = ({v}) => v==null?<span style={{color:"var(--muted)"}}>—</span>
    :<span style={{fontWeight:600,color:v>0?"var(--success)":v<0?"var(--danger)":"var(--muted)"}}>{v>0?`+${v}`:v}</span>;

  return (
    <Layout title="Trainer Dashboard">
      {modal && (
        <Modal
          type={modal.type} title={modal.title} message={modal.message}
          confirmText={modal.confirmText} onConfirm={modal.onConfirm} onCancel={()=>setModal(null)}
        />
      )}
      {flash && <div className={`flash ${flash.type}`}>{flash.text}</div>}
      <div className="stat-grid">
        <StatCard icon="👥" label="Total Students"  value={dash?.stats?.total||0}     color="#7c6fff"/>
        <StatCard icon="✅" label="Submitted Today" value={dash?.stats?.completed||0} color="#4ade80"/>
        <StatCard icon="❌" label="Pending Today"   value={dash?.stats?.pending||0}   color="#f87171"/>
        <StatCard icon="💸" label="Total Fines"     value={`₹${dash?.stats?.totalFines||0}`} color="#fbbf24"/>
      </div>

      <div className="tab-bar">
        {TABS.map(t=><button key={t.id} className={`tab-btn${tab===t.id?" active":""}`} onClick={()=>handleTab(t.id)}>{t.l}</button>)}
        {selected&&<button className={`tab-btn${tab==="detail"?" active":""}`} onClick={()=>setTab("detail")}>📈 {(selected.registeredName||selected.name||"").slice(0,12)}</button>}
      </div>

      {/* OVERVIEW */}
      {tab==="overview"&&(
        <>
          {dash?.today?.question&&<div className="today-card"><div className="today-label">📌 Today's Question</div><div className="today-q">{dash.today.question}</div></div>}
          <div className="grid-2">
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
            <div className="card">
              <div className="section-title">Today's Status</div>
              <div className="streak-list">
                {users.map((u,i)=>(
                  <div className="streak-row" key={i}>
                    <div className="avatar" style={{width:32,height:32,fontSize:"0.8rem"}}>{(u.registeredName||u.name||"?")[0].toUpperCase()}</div>
                    <span className="streak-name">{u.registeredName||u.name||u.phone}</span>
                    <span style={{color:u.completed?"var(--success)":"var(--danger)",fontWeight:600}}>{u.completed?"✅":"⏳"}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* STUDENTS */}
      {tab==="students"&&(
        <>
          <div style={{display:"flex",gap:"0.5rem",marginBottom:"1rem",flexWrap:"wrap",alignItems:"center"}}>
            <input className="form-input" style={{width:200}} placeholder="Search students…" value={search} onChange={e=>setSearch(e.target.value)}/>
            <select className="form-input" style={{width:"auto"}} value={sortBy} onChange={e=>setSortBy(e.target.value)}>
              {[["streak","Streak"],["weekly","Weekly"],["fine","Fine"],["name","Name"]].map(([v,l])=><option key={v} value={v}>Sort: {l}</option>)}
            </select>
            <div style={{marginLeft:"auto",display:"flex",gap:"0.5rem"}}>
              <button className="btn-ghost danger" onClick={resetWeekly} disabled={resetting==="weekly"} style={{fontSize:"0.82rem"}}>
                {resetting==="weekly"?"Resetting…":"🔄 Reset Weekly"}
              </button>
              <button className="btn-ghost danger" onClick={resetMonthly} disabled={resetting==="monthly"} style={{fontSize:"0.82rem"}}>
                {resetting==="monthly"?"Resetting…":"🔄 Reset Monthly"}
              </button>
            </div>
          </div>
          <div className="user-grid">
            {filteredUsers.map(u=>(
              <div className="user-card" key={u.userId} onClick={()=>selectUser(u)}>
                <div className="avatar">{(u.registeredName||u.name||"?")[0].toUpperCase()}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div className="user-name">{u.registeredName||u.name||u.phone}</div>
                  <div className="user-meta">🔥 {u.streak||0} · {u.weeklySubmissions||0}/7 · ₹{u.fine||0}</div>
                </div>
                <span style={{color:u.completed?"var(--success)":"var(--danger)",fontSize:"1.1rem"}}>{u.completed?"✅":"⏳"}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* COMPARE */}
      {tab==="compare"&&(
        scoresLoading?<div className="spinner-wrap"><div className="spinner"/></div>
        :compareData.length===0?
          <div className="card empty-state">
            <div className="empty-icon">📊</div>
            <p>No feedback scores available yet.</p>
            <button className="btn-ghost" style={{marginTop:"1rem"}} onClick={()=>{setAllScores({});loadAllScores(users);}}>🔄 Reload Scores</button>
          </div>
        :<div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
          {Object.entries(SCORES).map(([metric,color])=>(
            <div className="card" key={metric}>
              <div className="section-title">{metric} — All Students (avg)</div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={compareData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#252545"/>
                  <XAxis dataKey="name" stroke="#8888aa" fontSize={11}/>
                  <YAxis domain={[0,10]} stroke="#8888aa" fontSize={11}/>
                  <Tooltip contentStyle={tt}/>
                  <Bar dataKey={metric} fill={color} radius={[4,4,0,0]}>
                    {compareData.map((_,i)=><Cell key={i} fill={color}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ))}
        </div>
      )}

      {/* IMPROVEMENT */}
      {tab==="improvement"&&(
        scoresLoading?<div className="spinner-wrap"><div className="spinner"/></div>
        :improvementData.length===0?
          <div className="card empty-state">
            <div className="empty-icon">📈</div>
            <p>No feedback scores available yet.</p>
            <button className="btn-ghost" style={{marginTop:"1rem"}} onClick={()=>{setAllScores({});loadAllScores(users);}}>🔄 Reload Scores</button>
          </div>
        :<>
          <div className="card" style={{marginBottom:"1rem"}}>
            <div className="section-title">Score Improvement (First → Latest)</div>
            <p style={{fontSize:"0.78rem",color:"var(--muted)",marginBottom:"1rem"}}>Green = improved · Red = declined · — = only 1 session</p>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Student</th><th>Sessions</th><th>Fluency Δ</th><th>Grammar Δ</th><th>Confidence Δ</th><th>Vocabulary Δ</th><th>Avg Fluency</th><th>Avg Grammar</th></tr></thead>
                <tbody>{improvementData.map((u,i)=>(
                  <tr key={i} style={{cursor:"pointer"}} onClick={()=>selectUser(users.find(x=>x.phone===u.phone)||{})}>
                    <td style={{fontWeight:500}}>{u.name}</td>
                    <td style={{color:"var(--muted)"}}>{u.sessions}</td>
                    {[u.fd,u.gd,u.cd,u.vd].map((v,j)=><td key={j}><DeltaCell v={v}/></td>)}
                    <td style={{color:"var(--muted)"}}>{u.af??"-"}</td>
                    <td style={{color:"var(--muted)"}}>{u.ag??"-"}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
          <div className="card">
            <div className="section-title">Most Improved</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={improvementData.slice(0,10).map(u=>({name:u.name,total:+[u.fd,u.gd,u.cd,u.vd].filter(Boolean).reduce((s,v)=>s+v,0).toFixed(1)}))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#252545"/>
                <XAxis dataKey="name" stroke="#8888aa" fontSize={11}/>
                <YAxis stroke="#8888aa" fontSize={11}/>
                <Tooltip contentStyle={tt}/>
                <Bar dataKey="total" name="Total Improvement" radius={[4,4,0,0]}>
                  {improvementData.slice(0,10).map((u,i)=>{const t=[u.fd,u.gd,u.cd,u.vd].filter(Boolean).reduce((s,v)=>s+v,0);return<Cell key={i} fill={t>=0?"#4ade80":"#f87171"}/>;  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* SUBMISSIONS */}
      {tab==="submissions"&&(
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
                            }catch(e){console.error(e);}
                          }}
                        >
                          {u.completed ? "✅ Submitted" : "⏳ Not Submitted"}
                        </button>
                        <button className="btn-ghost" onClick={()=>selectUser(u)}>View</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* LIVE SESSIONS */}
      {tab==="live" && <TrainerLivePanel />}

      {/* MANUAL QUESTIONS */}
      {tab==="manual-questions" && <ManualQuestionsPanel />}

      {/* CONTROLS */}
      {tab==="controls"&&(
        <div className="card" style={{maxWidth:480}}>
          <div className="section-title">🔄 Reset Controls</div>
          <p style={{color:"var(--muted)",fontSize:"0.85rem",marginBottom:"1.5rem"}}>
            Manually trigger resets. These are normally done automatically by the bot at midnight.
          </p>
          <div style={{display:"flex",flexDirection:"column",gap:"0.75rem"}}>
            {[
              { label:"🌅 Reset Day", desc:"Clears today's submissions & question status", key:"day", endpoint:"/users/reset/day" },
              { label:"📅 Reset Weekly", desc:"Resets weekly submissions & weekly fines to 0", key:"weekly", endpoint:"/users/reset/weekly" },
              { label:"📆 Reset Monthly", desc:"Resets monthly submission counts to 0", key:"monthly", endpoint:"/users/reset/monthly" },
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
                      try{ await api.post(endpoint); msg(`${label} done!`); const [d,u]=await Promise.all([api.get("/dashboard"),api.get("/users")]); setDash(d.data); setUsers(u.data); }
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

          {/* Monthly Reflection Demo */}
          <div style={{marginTop:"1.5rem"}}>
            <div className="section-title" style={{fontSize:"0.95rem",marginBottom:"0.5rem"}}>🌟 Monthly Reflection Demo</div>
            <p style={{color:"var(--muted)",fontSize:"0.82rem",marginBottom:"1rem"}}>
              Preview how the monthly reflection looks for students. Toggle it on/off without affecting real data.
            </p>
            <div style={{display:"flex",gap:"0.75rem",marginBottom:"0.75rem"}}>
              <button
                className="btn-primary"
                style={{flex:1,fontSize:"0.85rem"}}
                disabled={resetting==="reflection-on"}
                onClick={async()=>{
                  setResetting("reflection-on");
                  try{
                    await api.post("/dashboard/demo-monthly-reflection");
                    msg("✅ Monthly reflection mode ON — open User Dashboard to see it");
                  } catch(e){ msg(e?.response?.data?.error||"Failed","danger"); }
                  finally{ setResetting(""); }
                }}
              >
                {resetting==="reflection-on" ? "Activating…" : "▶ Reflection ON"}
              </button>
              <button
                className="btn-secondary"
                style={{flex:1,fontSize:"0.85rem"}}
                disabled={resetting==="reflection-off"}
                onClick={async()=>{
                  setResetting("reflection-off");
                  try{
                    await api.post("/dashboard/demo-monthly-reflection-off");
                    msg("Monthly mode OFF");
                  } catch(e){ msg(e?.response?.data?.error||"Failed","danger"); }
                  finally{ setResetting(""); }
                }}
              >
                {resetting==="reflection-off" ? "Turning off…" : "⏹ Turn OFF"}
              </button>
            </div>

            {/* Monthly Goals Demo */}
            <div className="section-title" style={{fontSize:"0.95rem",marginBottom:"0.5rem",marginTop:"1rem"}}>🎯 Monthly Goal Setting Demo</div>
            <p style={{color:"var(--muted)",fontSize:"0.82rem",marginBottom:"1rem"}}>
              Preview the 1st-of-month goal setting questions for students.
            </p>
            <button
              className="btn-primary"
              style={{width:"100%",fontSize:"0.85rem",background:"linear-gradient(135deg,#16a34a,#15803d)",marginBottom:"1rem"}}
              disabled={resetting==="goals-on"}
              onClick={async()=>{
                setResetting("goals-on");
                try{
                  await api.post("/dashboard/demo-monthly-goals");
                  msg("✅ Monthly goals mode ON — open User Dashboard to see it");
                } catch(e){ msg(e?.response?.data?.error||"Failed","danger"); }
                finally{ setResetting(""); }
              }}
            >
              {resetting==="goals-on" ? "Activating…" : "▶ Goals ON (Demo)"}
            </button>

            {/* Weekly Reflection Demo */}
            <div className="section-title" style={{fontSize:"0.95rem",marginBottom:"0.5rem",marginTop:"0.5rem"}}>📅 Weekly Reflection Demo (Sunday)</div>
            <p style={{color:"var(--muted)",fontSize:"0.82rem",marginBottom:"1rem"}}>
              Preview the Sunday weekly reflection questions for students.
            </p>
            <button
              className="btn-primary"
              style={{width:"100%",fontSize:"0.85rem",background:"linear-gradient(135deg,#0ea5e9,#0284c7)"}}
              disabled={resetting==="weekly-on"}
              onClick={async()=>{
                setResetting("weekly-on");
                try{
                  await api.post("/dashboard/demo-weekly-reflection");
                  msg("✅ Weekly reflection mode ON — open User Dashboard to see it");
                } catch(e){ msg(e?.response?.data?.error||"Failed","danger"); }
                finally{ setResetting(""); }
              }}
            >
              {resetting==="weekly-on" ? "Activating…" : "▶ Weekly Reflection ON (Demo)"}
            </button>
          </div>
        </div>
      )}

      {/* STUDENT DETAIL */}
      {tab==="detail"&&selected&&(
        <>
          <div className="stat-grid">
            <StatCard icon="🔥" label="Streak"    value={`${selected.streak||0} days`}         color="#f97316"/>
            <StatCard icon="💸" label="Fine"       value={`₹${selected.fine||0}`}              color="#f87171"/>
            <StatCard icon="📹" label="Sessions"   value={selScores.length}                     color="#7c6fff"/>
            <StatCard icon="📅" label="This Week"  value={`${selected.weeklySubmissions||0}/7`} color="#4ade80"/>
          </div>

          {/* Submission Controls */}
          <div className="card" style={{marginBottom:"1rem"}}>
            <div className="section-title">Manage Submissions</div>
            <SubmissionControls 
              phone={selected.phone}
              weeklySubmissions={selected.weeklySubmissions || 0}
              monthlySubmissions={selected.monthlySubmissions || 0}
              onUpdate={handleSubmissionUpdate}
            />
          </div>

          <div className="stat-grid">
            {Object.entries(SCORES).map(([k,c])=>(
              <StatCard key={k} icon={k==="Fluency"?"🗣️":k==="Grammar"?"📝":k==="Confidence"?"💪":"📚"}
                label={`Avg ${k}`} value={avg(selScores,k.toLowerCase())??"-"} color={c}/>
            ))}
          </div>

          {radarData.length>0&&(
            <div className="grid-2" style={{marginBottom:"1rem"}}>
              <div className="card">
                <div className="section-title">Latest Session Radar</div>
                <ResponsiveContainer width="100%" height={220}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#252545"/>
                    <PolarAngleAxis dataKey="subject" tick={{fill:"#8888aa",fontSize:12}}/>
                    <Radar dataKey="score" stroke="#7c6fff" fill="#7c6fff" fillOpacity={0.25}/>
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              <div className="card">
                <div className="section-title">Latest Scores</div>
                {radarData.map(r=>(
                  <div className="score-bar" key={r.subject}>
                    <div className="score-bar-header">
                      <span className="score-bar-label">{r.subject}</span>
                      <span className="score-bar-value" style={{color:scoreColor(r.score)}}>{r.score}/10</span>
                    </div>
                    <div className="score-bar-track">
                      <div className="score-bar-fill" style={{width:`${r.score*10}%`,background:SCORES[r.subject]}}/>
                    </div>
                  </div>
                ))}
                {selScores.length>=2&&(
                  <div style={{marginTop:"1rem",paddingTop:"1rem",borderTop:"1px solid var(--border)"}}>
                    <p style={{fontSize:"0.75rem",color:"var(--muted)",marginBottom:"0.5rem"}}>Improvement (first → latest)</p>
                    {Object.keys(SCORES).map(k=>{const d=delta(selScores,k.toLowerCase());return(
                      <div key={k} style={{display:"flex",justifyContent:"space-between",fontSize:"0.8rem",marginBottom:"0.25rem"}}>
                        <span style={{color:"var(--muted)"}}>{k}</span>
                        <span style={{fontWeight:600,color:d==null?"var(--muted)":d>0?"var(--success)":d<0?"var(--danger)":"var(--muted)"}}>{d==null?"—":d>0?`+${d}`:d}</span>
                      </div>
                    );})}
                  </div>
                )}
              </div>
            </div>
          )}

          {chartData.length>0&&(
            <div className="card" style={{marginBottom:"1rem"}}>
              <div className="section-title">Score History — {selected.registeredName||selected.name}</div>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#252545"/>
                  <XAxis dataKey="session" stroke="#8888aa" fontSize={11}/>
                  <YAxis domain={[0,10]} stroke="#8888aa" fontSize={11}/>
                  <Tooltip contentStyle={tt}/><Legend/>
                  {Object.entries(SCORES).map(([k,c])=><Line key={k} type="monotone" dataKey={k} stroke={c} strokeWidth={2} dot={{r:3}} activeDot={{r:5}}/>)}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {selScores.length>0&&(
            <div className="card">
              <div className="section-title">Session History</div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>#</th><th>Date</th><th>Fluency</th><th>Grammar</th><th>Confidence</th><th>Vocabulary</th></tr></thead>
                  <tbody>{[...selScores].reverse().map((s,i)=>(
                    <tr key={i}>
                      <td style={{color:"var(--muted)"}}>{selScores.length-i}</td>
                      <td style={{color:"var(--muted)"}}>{s.date?new Date(s.date).toLocaleDateString("en-IN"):"—"}</td>
                      {["fluency","grammar","confidence","vocabulary"].map(k=>(
                        <td key={k} style={{fontWeight:600,color:scoreColor(s[k]||0)}}>{s[k]??"-"}/10</td>
                      ))}
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </Layout>
  );
}

// ── Trainer Live Sessions Panel ───────────────────────────────────────────────
function TrainerLivePanel() {
  const navigate = useNavigate();
  const confirm  = useConfirm();
  const [sessions, setSessions]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState({ title: "", scheduledAt: "", description: "" });
  const [saving, setSaving]       = useState(false);
  const [busy, setBusy]           = useState({});
  const [toast, setToast]         = useState(null);

  const notify = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const load = async () => {
    try { const res = await api.get("/live-sessions"); setSessions(res.data); }
    catch {} finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      await api.post("/live-sessions", form);
      setForm({ title: "", scheduledAt: "", description: "" });
      setShowForm(false); notify("Session scheduled!"); load();
    } catch (err) { notify(err.response?.data?.error || "Failed", "error"); }
    finally { setSaving(false); }
  };

  const start = async (id) => {
    setBusy(b => ({ ...b, [id]: "starting" }));
    try { await api.post(`/live-sessions/${id}/start`); notify("Session is now LIVE! 🔴"); load(); }
    catch (err) { notify(err.response?.data?.error || "Failed", "error"); }
    finally { setBusy(b => ({ ...b, [id]: null })); }
  };

  const end = async (id) => {
    const ok = await confirm({ title: "End Session", message: "End this session for all participants?", confirmText: "End Session", type: "danger" });
    if (!ok) return;
    setBusy(b => ({ ...b, [id]: "ending" }));
    try { await api.post(`/live-sessions/${id}/end`); notify("Session ended."); load(); }
    catch (err) { notify(err.response?.data?.error || "Failed", "error"); }
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

  const live      = sessions.filter(s => s.status === "live");
  const scheduled = sessions.filter(s => s.status === "scheduled");
  const ended     = sessions.filter(s => s.status === "ended");

  return (
    <div style={{ maxWidth: 700 }}>
      {toast && (
        <div style={{
          position: "fixed", top: "5rem", right: "1rem", zIndex: 9999,
          background: toast.type === "error" ? "#7f1d1d" : "#065f46",
          border: `1px solid ${toast.type === "error" ? "rgba(248,113,113,0.4)" : "rgba(74,222,128,0.4)"}`,
          color: "#fff", padding: "0.75rem 1.25rem", borderRadius: 12,
          fontSize: "0.9rem", fontWeight: 600, boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        }}>
          {toast.type === "error" ? "❌" : "✅"} {toast.msg}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 800 }}>🎥 Live Sessions</h2>
          <p style={{ margin: "0.25rem 0 0", color: "var(--muted)", fontSize: "0.85rem" }}>Schedule and manage live video sessions</p>
        </div>
        <button onClick={() => setShowForm(f => !f)} style={{
          background: showForm ? "rgba(248,113,113,0.15)" : "linear-gradient(135deg,#7c6fff,#4f46e5)",
          border: showForm ? "1px solid rgba(248,113,113,0.3)" : "none",
          color: showForm ? "#f87171" : "#fff",
          borderRadius: 12, padding: "0.65rem 1.25rem", fontWeight: 700, fontSize: "0.9rem", cursor: "pointer",
        }}>
          {showForm ? "✕ Cancel" : "+ Schedule Session"}
        </button>
      </div>

      {showForm && (
        <div style={{ background: "rgba(124,111,255,0.08)", border: "1px solid rgba(124,111,255,0.25)", borderRadius: 16, padding: "1.5rem", marginBottom: "1.5rem" }}>
          <form onSubmit={create}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
              <div><label className="form-label">Title *</label><input className="form-input" required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
              <div><label className="form-label">Date & Time *</label><input className="form-input" type="datetime-local" required value={form.scheduledAt} onChange={e => setForm(f => ({ ...f, scheduledAt: e.target.value }))} /></div>
            </div>
            <div style={{ marginBottom: "1rem" }}><label className="form-label">Description</label><input className="form-input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? "Scheduling…" : "📅 Schedule"}</button>
          </form>
        </div>
      )}

      {loading && <div className="spinner-wrap"><div className="spinner" /></div>}

      {live.length > 0 && <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#4ade80", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>🔴 Live Now</div>
        {live.map(s => <TrainerSessionCard key={s._id} s={s} onStart={start} onEnd={end} busy={busy} navigate={navigate} />)}
      </div>}

      {scheduled.length > 0 && <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>📅 Upcoming</div>
        {scheduled.map(s => <TrainerSessionCard key={s._id} s={s} onStart={start} onEnd={end} onCancel={cancel} busy={busy} navigate={navigate} />)}
      </div>}

      {ended.length > 0 && <div>
        <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>✅ Past</div>
        {ended.slice(0, 5).map(s => <TrainerSessionCard key={s._id} s={s} onStart={start} onEnd={end} busy={busy} navigate={navigate} />)}
      </div>}

      {!loading && sessions.length === 0 && (
        <div style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--muted)" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🎥</div>
          <div style={{ fontWeight: 600 }}>No sessions yet</div>
        </div>
      )}
    </div>
  );
}

function TrainerSessionCard({ s, onStart, onEnd, onCancel, busy, navigate }) {
  const isLive = s.status === "live", isScheduled = s.status === "scheduled";
  return (
    <div style={{
      background: isLive ? "rgba(74,222,128,0.05)" : "var(--bg-secondary)",
      border: `1px solid ${isLive ? "rgba(74,222,128,0.4)" : isScheduled ? "rgba(96,165,250,0.25)" : "rgba(255,255,255,0.06)"}`,
      borderRadius: 14, padding: "1rem 1.25rem", marginBottom: "0.75rem",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem" }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem" }}>
            <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>{s.title}</span>
            <span style={{ fontSize: "0.65rem", fontWeight: 700, padding: "0.15rem 0.5rem", borderRadius: 20, textTransform: "uppercase", background: isLive ? "rgba(74,222,128,0.15)" : isScheduled ? "rgba(96,165,250,0.15)" : "rgba(107,114,128,0.15)", color: isLive ? "#4ade80" : isScheduled ? "#60a5fa" : "#6b7280" }}>
              {isLive ? "🔴 Live" : isScheduled ? "Scheduled" : "Ended"}
            </span>
          </div>
          <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
            📅 {new Date(s.scheduledAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
            {s.participantCount > 0 && ` · 👥 ${s.participantCount} joined`}
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
          {isScheduled && <button onClick={() => onStart(s._id)} disabled={busy[s._id] === "starting"} style={{ background: "linear-gradient(135deg,#4ade80,#22c55e)", color: "#065f46", border: "none", borderRadius: 10, padding: "0.5rem 1rem", fontWeight: 700, fontSize: "0.82rem", cursor: "pointer" }}>{busy[s._id] === "starting" ? "Starting…" : "🔴 Go Live"}</button>}
          {isScheduled && onCancel && (
            <button onClick={() => onCancel(s._id)} disabled={busy[s._id] === "cancelling"} style={{ background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.3)", color: "#f87171", borderRadius: 10, padding: "0.5rem 0.85rem", fontWeight: 700, fontSize: "0.82rem", cursor: "pointer" }}>
              {busy[s._id] === "cancelling" ? "Cancelling…" : "✕ Cancel"}
            </button>
          )}
          {isLive && <>
            <button onClick={() => window.open(`/live/${s._id}`, "_blank")} style={{ background: "linear-gradient(135deg,#7c6fff,#4f46e5)", color: "#fff", border: "none", borderRadius: 10, padding: "0.5rem 1rem", fontWeight: 700, fontSize: "0.82rem", cursor: "pointer" }}>📹 Join</button>
            <button onClick={() => onEnd(s._id)} disabled={busy[s._id] === "ending"} style={{ background: "rgba(248,113,113,0.15)", border: "1px solid rgba(248,113,113,0.3)", color: "#f87171", borderRadius: 10, padding: "0.5rem 0.85rem", fontWeight: 700, fontSize: "0.82rem", cursor: "pointer" }}>{busy[s._id] === "ending" ? "Ending…" : "⏹ End"}</button>
          </>}
        </div>
      </div>
    </div>
  );
}
// ── Manual Questions Panel (same as admin but for trainers) ──────────────────
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
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
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

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
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