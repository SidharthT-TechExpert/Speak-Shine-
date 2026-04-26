import { useEffect, useState, useMemo } from "react";
import Layout from "../components/Layout.jsx";
import StatCard from "../components/StatCard.jsx";
import AttendancePanel from "../components/AttendancePanel.jsx";
import SubmissionControls from "../components/SubmissionControls.jsx";
import api from "../api/client.js";
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, BarChart, Bar, Cell } from "recharts";

const SCORES = { Fluency:"#7c6fff", Grammar:"#4ade80", Confidence:"#fbbf24", Vocabulary:"#ff6b9d" };
const tt = { background:"#16162a", border:"1px solid #252545", borderRadius:10, fontSize:12 };
const avg = (arr,k) => { const v=arr.filter(s=>s[k]!=null).map(s=>s[k]); return v.length?+(v.reduce((a,b)=>a+b,0)/v.length).toFixed(1):null; };
const delta = (arr,k) => { if(arr.length<2)return null; const f=arr[0][k],l=arr[arr.length-1][k]; return(f==null||l==null)?null:+(l-f).toFixed(1); };
const scoreColor = v => v>=7?"var(--success)":v>=5?"var(--warning)":"var(--danger)";
const TABS = [{id:"overview",l:"📊 Overview"},{id:"students",l:"👥 Students"},{id:"compare",l:"⚖️ Compare"},{id:"improvement",l:"📈 Improvement"},{id:"attendance",l:"📋 Attendance"}];

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

  useEffect(()=>{
    Promise.all([api.get("/dashboard"),api.get("/users")])
      .then(([d,u])=>{setDash(d.data);setUsers(u.data);})
      .finally(()=>setLoading(false));
  },[]);

  const loadAllScores = async () => {
    if(Object.keys(allScores).length>0)return;
    setScoresLoading(true);
    const res={};
    await Promise.all(users.map(async u=>{try{const{data}=await api.get(`/dashboard/scores/${u.phone}`);res[u.phone]=data.feedbackScores||[];}catch{res[u.phone]=[];}}));
    setAllScores(res);setScoresLoading(false);
  };

  const handleTab = (t) => { setTab(t); if(t==="compare"||t==="improvement")loadAllScores(); };

  const selectUser = async (user) => {
    setSelected(user); setTab("detail");
    if(!allScores[user.phone]){const{data}=await api.get(`/dashboard/scores/${user.phone}`);setAllScores(p=>({...p,[user.phone]:data.feedbackScores||[]}));}
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
          <div style={{display:"flex",gap:"0.5rem",marginBottom:"1rem",flexWrap:"wrap"}}>
            <input className="form-input" style={{width:200}} placeholder="Search students…" value={search} onChange={e=>setSearch(e.target.value)}/>
            <select className="form-input" style={{width:"auto"}} value={sortBy} onChange={e=>setSortBy(e.target.value)}>
              {[["streak","Streak"],["weekly","Weekly"],["fine","Fine"],["name","Name"]].map(([v,l])=><option key={v} value={v}>Sort: {l}</option>)}
            </select>
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
        :compareData.length===0?<div className="card empty-state"><div className="empty-icon">📊</div><p>No feedback scores available yet.</p></div>
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
        :improvementData.length===0?<div className="card empty-state"><div className="empty-icon">📈</div><p>No feedback scores available yet.</p></div>
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

      {/* ATTENDANCE */}
      {tab==="attendance"&&(
        <AttendancePanel />
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
