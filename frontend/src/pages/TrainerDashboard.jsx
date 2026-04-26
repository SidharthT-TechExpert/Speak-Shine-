import { useEffect, useState, useMemo } from "react";
import Layout from "../components/Layout.jsx";
import StatCard from "../components/StatCard.jsx";
import api from "../api/client.js";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  BarChart, Bar, Cell,
} from "recharts";

const SCORE_COLORS = { Fluency:"#7c6fff", Grammar:"#4ade80", Confidence:"#fbbf24", Vocabulary:"#ff6b9d" };
const tt = { background:"#16162a", border:"1px solid #252545", borderRadius:10, fontSize:12 };
const avg = (arr,k) => { const v=arr.filter(s=>s[k]!=null).map(s=>s[k]); return v.length?+(v.reduce((a,b)=>a+b,0)/v.length).toFixed(1):null; };
const delta = (arr,k) => { if(arr.length<2)return null; const f=arr[0][k],l=arr[arr.length-1][k]; return(f==null||l==null)?null:+(l-f).toFixed(1); };

const Card = ({children,className=""}) => <div className={`bg-[#16162a] border border-[#252545] rounded-2xl p-5 ${className}`}>{children}</div>;
const SectionTitle = ({children}) => <h3 className="text-base font-semibold text-[#e8e8f4] mb-4">{children}</h3>;
const Th = ({children}) => <th className="text-left py-2.5 px-3 text-xs text-[#8888aa] font-medium border-b border-[#252545]">{children}</th>;
const Td = ({children,className=""}) => <td className={`py-2.5 px-3 text-sm border-b border-[#252545]/50 ${className}`}>{children}</td>;

const TABS = [
  {id:"overview",    label:"📊 Overview"},
  {id:"students",    label:"👥 Students"},
  {id:"compare",     label:"⚖️ Compare"},
  {id:"improvement", label:"📈 Improvement"},
];

export default function TrainerDashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [users, setUsers] = useState([]);
  const [allScores, setAllScores] = useState({});
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [scoresLoading, setScoresLoading] = useState(false);
  const [sortBy, setSortBy] = useState("streak");
  const [search, setSearch] = useState("");

  useEffect(() => {
    Promise.all([api.get("/dashboard"), api.get("/users")])
      .then(([d,u]) => { setDashboard(d.data); setUsers(u.data); })
      .finally(() => setLoading(false));
  }, []);

  const loadAllScores = async () => {
    if (Object.keys(allScores).length > 0) return;
    setScoresLoading(true);
    const res = {};
    await Promise.all(users.map(async u => {
      try { const {data} = await api.get(`/dashboard/scores/${u.phone}`); res[u.phone] = data.feedbackScores||[]; }
      catch { res[u.phone] = []; }
    }));
    setAllScores(res); setScoresLoading(false);
  };

  const handleTab = (t) => { setTab(t); if(t==="compare"||t==="improvement") loadAllScores(); };

  const selectUser = async (user) => {
    setSelected(user); setTab("detail");
    if (!allScores[user.phone]) {
      const {data} = await api.get(`/dashboard/scores/${user.phone}`);
      setAllScores(p => ({...p, [user.phone]: data.feedbackScores||[]}));
    }
  };

  const filteredUsers = useMemo(() => {
    let list = [...users];
    if (search) { const s=search.toLowerCase(); list=list.filter(u=>(u.registeredName||u.name||"").toLowerCase().includes(s)||(u.phone||"").includes(s)); }
    if (sortBy==="streak") list.sort((a,b)=>(b.streak||0)-(a.streak||0));
    else if (sortBy==="weekly") list.sort((a,b)=>(b.weeklySubmissions||0)-(a.weeklySubmissions||0));
    else if (sortBy==="fine") list.sort((a,b)=>(b.fine||0)-(a.fine||0));
    else list.sort((a,b)=>(a.registeredName||a.name||"").localeCompare(b.registeredName||b.name||""));
    return list;
  }, [users, search, sortBy]);

  const improvementData = useMemo(() => users.map(u => {
    const s = allScores[u.phone]||[];
    return { name:(u.registeredName||u.name||u.phone||"?").slice(0,10), phone:u.phone, sessions:s.length,
      fd:delta(s,"fluency"), gd:delta(s,"grammar"), cd:delta(s,"confidence"), vd:delta(s,"vocabulary"),
      af:avg(s,"fluency"), ag:avg(s,"grammar") };
  }).filter(u=>u.sessions>0).sort((a,b)=>{
    const ta=[a.fd,a.gd,a.cd,a.vd].filter(Boolean).reduce((s,v)=>s+v,0);
    const tb=[b.fd,b.gd,b.cd,b.vd].filter(Boolean).reduce((s,v)=>s+v,0);
    return tb-ta;
  }), [users, allScores]);

  const compareData = useMemo(() => users.map(u => {
    const s=allScores[u.phone]||[];
    return { name:(u.registeredName||u.name||"?").slice(0,8), Fluency:avg(s,"fluency"), Grammar:avg(s,"grammar"), Confidence:avg(s,"confidence"), Vocabulary:avg(s,"vocabulary"), sessions:s.length };
  }).filter(u=>u.sessions>0), [users, allScores]);

  if (loading) return <Layout title="Trainer Dashboard"><div className="flex justify-center py-24"><div className="w-10 h-10 border-2 border-[#252545] border-t-[#7c6fff] rounded-full animate-spin"/></div></Layout>;

  const selScores = selected ? (allScores[selected.phone]||[]) : [];
  const latest = selScores.slice(-1)[0];
  const radarData = latest ? Object.entries(SCORE_COLORS).map(([k])=>({subject:k, score:latest[k.toLowerCase()]||0})) : [];
  const chartData = selScores.map((s,i)=>({session:`#${i+1}`, Fluency:s.fluency, Grammar:s.grammar, Confidence:s.confidence, Vocabulary:s.vocabulary}));

  const DeltaBadge = ({v}) => v==null ? <span className="text-[#8888aa]">—</span>
    : <span className={`font-bold ${v>0?"text-[#4ade80]":v<0?"text-[#f87171]":"text-[#8888aa]"}`}>{v>0?`+${v}`:v}</span>;

  return (
    <Layout title="Trainer Dashboard">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard icon="👥" label="Total Students"  value={dashboard?.stats?.total||0}     color="#7c6fff"/>
        <StatCard icon="✅" label="Submitted Today" value={dashboard?.stats?.completed||0} color="#4ade80"/>
        <StatCard icon="❌" label="Pending Today"   value={dashboard?.stats?.pending||0}   color="#f87171"/>
        <StatCard icon="💸" label="Total Fines"     value={`₹${dashboard?.stats?.totalFines||0}`} color="#fbbf24"/>
      </div>

      <div className="flex gap-1.5 flex-wrap mb-6">
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>handleTab(t.id)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${tab===t.id?"bg-[#7c6fff] text-white":"bg-[#16162a] border border-[#252545] text-[#8888aa] hover:text-[#e8e8f4] hover:border-[#353560]"}`}>
            {t.label}
          </button>
        ))}
        {selected && (
          <button onClick={()=>setTab("detail")}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${tab==="detail"?"bg-[#7c6fff] text-white":"bg-[#16162a] border border-[#252545] text-[#8888aa] hover:text-[#e8e8f4]"}`}>
            📈 {(selected.registeredName||selected.name||selected.phone||"").slice(0,12)}
          </button>
        )}
      </div>

      {/* OVERVIEW */}
      {tab==="overview" && (
        <>
          {dashboard?.today?.question && (
            <div className="mb-6 rounded-2xl p-5 border border-[#7c6fff]/30" style={{background:"linear-gradient(135deg,rgba(124,111,255,0.1),rgba(255,107,157,0.05))"}}>
              <p className="text-xs text-[#8888aa] mb-2">📌 TODAY'S QUESTION</p>
              <p className="text-[#e8e8f4] font-semibold">{dashboard.today.question}</p>
            </div>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <SectionTitle>🏆 Top Streaks</SectionTitle>
              <div className="space-y-2">
                {(dashboard?.topStreak||[]).map((u,i)=>(
                  <div key={i} className="flex items-center gap-3 bg-[#111122] rounded-xl px-4 py-2.5">
                    <span className="text-lg w-7">{["🥇","🥈","🥉"][i]||`${i+1}.`}</span>
                    <span className="flex-1 text-sm text-[#e8e8f4]">{u.name||u.userId?.split("@")[0]}</span>
                    <span className="text-sm text-[#fbbf24] font-semibold">🔥 {u.streak}</span>
                    <span className="text-xs text-[#8888aa]">{u.weeklySubmissions}/7</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <SectionTitle>Today's Status</SectionTitle>
              <div className="space-y-2">
                {users.map((u,i)=>(
                  <div key={i} className="flex items-center gap-3 bg-[#111122] rounded-xl px-4 py-2.5">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#7c6fff] to-[#ff6b9d] flex items-center justify-center text-white text-xs font-bold shrink-0">
                      {(u.registeredName||u.name||"?")[0].toUpperCase()}
                    </div>
                    <span className="flex-1 text-sm text-[#e8e8f4]">{u.registeredName||u.name||u.phone}</span>
                    <span className={`text-sm font-semibold ${u.completed?"text-[#4ade80]":"text-[#f87171]"}`}>{u.completed?"✅":"⏳"}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}

      {/* STUDENTS */}
      {tab==="students" && (
        <>
          <div className="flex gap-2 mb-4 flex-wrap">
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search students…"
              className="bg-[#111122] border border-[#252545] rounded-xl px-3 py-2 text-[#e8e8f4] text-sm placeholder-[#444466] focus:border-[#7c6fff] transition-colors w-52"/>
            <select value={sortBy} onChange={e=>setSortBy(e.target.value)}
              className="bg-[#111122] border border-[#252545] rounded-xl px-3 py-2 text-[#8888aa] text-sm focus:border-[#7c6fff] transition-colors">
              {[["streak","Streak"],["weekly","Weekly"],["fine","Fine"],["name","Name"]].map(([v,l])=><option key={v} value={v}>Sort: {l}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filteredUsers.map(u=>(
              <div key={u.userId} onClick={()=>selectUser(u)}
                className="bg-[#16162a] border border-[#252545] rounded-2xl p-4 flex items-center gap-3 cursor-pointer hover:border-[#7c6fff] transition-all group">
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#7c6fff] to-[#ff6b9d] flex items-center justify-center text-white font-bold text-base shrink-0">
                  {(u.registeredName||u.name||"?")[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#e8e8f4] truncate">{u.registeredName||u.name||u.phone}</p>
                  <p className="text-xs text-[#8888aa] mt-0.5">🔥 {u.streak||0} · {u.weeklySubmissions||0}/7 · ₹{u.fine||0}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`text-lg ${u.completed?"text-[#4ade80]":"text-[#f87171]"}`}>{u.completed?"✅":"⏳"}</span>
                  <span className="text-xs text-[#7c6fff] opacity-0 group-hover:opacity-100 transition-opacity">View →</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* COMPARE */}
      {tab==="compare" && (
        scoresLoading ? <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-[#252545] border-t-[#7c6fff] rounded-full animate-spin"/></div>
        : compareData.length===0 ? <Card className="text-center py-12 text-[#8888aa]">No feedback scores available yet.</Card>
        : <div className="space-y-4">
            {Object.entries(SCORE_COLORS).map(([metric,color])=>(
              <Card key={metric}>
                <SectionTitle>{metric} — All Students (avg)</SectionTitle>
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
              </Card>
            ))}
          </div>
      )}

      {/* IMPROVEMENT */}
      {tab==="improvement" && (
        scoresLoading ? <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-[#252545] border-t-[#7c6fff] rounded-full animate-spin"/></div>
        : improvementData.length===0 ? <Card className="text-center py-12 text-[#8888aa]">No feedback scores available yet.</Card>
        : <>
            <Card className="mb-4">
              <SectionTitle>Score Improvement (First → Latest)</SectionTitle>
              <p className="text-xs text-[#8888aa] mb-4">Green = improved · Red = declined · — = only 1 session</p>
              <div className="overflow-x-auto">
                <table className="w-full"><thead><tr>{["Student","Sessions","Fluency Δ","Grammar Δ","Confidence Δ","Vocabulary Δ","Avg Fluency","Avg Grammar"].map(h=><Th key={h}>{h}</Th>)}</tr></thead>
                  <tbody>{improvementData.map((u,i)=>(
                    <tr key={i} className="hover:bg-[#7c6fff]/5 transition-colors cursor-pointer" onClick={()=>selectUser(users.find(x=>x.phone===u.phone)||{})}>
                      <Td className="text-[#e8e8f4] font-medium">{u.name}</Td>
                      <Td className="text-[#8888aa]">{u.sessions}</Td>
                      {[u.fd,u.gd,u.cd,u.vd].map((v,j)=><Td key={j}><DeltaBadge v={v}/></Td>)}
                      <Td className="text-[#8888aa]">{u.af??"-"}</Td>
                      <Td className="text-[#8888aa]">{u.ag??"-"}</Td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </Card>
            <Card>
              <SectionTitle>Most Improved</SectionTitle>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={improvementData.slice(0,10).map(u=>({name:u.name,total:+[u.fd,u.gd,u.cd,u.vd].filter(Boolean).reduce((s,v)=>s+v,0).toFixed(1)}))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#252545"/>
                  <XAxis dataKey="name" stroke="#8888aa" fontSize={11}/>
                  <YAxis stroke="#8888aa" fontSize={11}/>
                  <Tooltip contentStyle={tt}/>
                  <Bar dataKey="total" name="Total Improvement" radius={[4,4,0,0]}>
                    {improvementData.slice(0,10).map((u,i)=>{
                      const t=[u.fd,u.gd,u.cd,u.vd].filter(Boolean).reduce((s,v)=>s+v,0);
                      return <Cell key={i} fill={t>=0?"#4ade80":"#f87171"}/>;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </>
      )}

      {/* STUDENT DETAIL */}
      {tab==="detail" && selected && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <StatCard icon="🔥" label="Streak"       value={`${selected.streak||0} days`}          color="#f97316"/>
            <StatCard icon="💸" label="Fine"          value={`₹${selected.fine||0}`}               color="#f87171"/>
            <StatCard icon="📹" label="Sessions"      value={selScores.length}                      color="#7c6fff"/>
            <StatCard icon="📅" label="This Week"     value={`${selected.weeklySubmissions||0}/7`}  color="#4ade80"/>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {Object.entries(SCORE_COLORS).map(([k,c])=>(
              <StatCard key={k} icon={k==="Fluency"?"🗣️":k==="Grammar"?"📝":k==="Confidence"?"💪":"📚"}
                label={`Avg ${k}`} value={avg(selScores,k.toLowerCase())??"-"} color={c}/>
            ))}
          </div>

          {radarData.length>0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
              <Card>
                <SectionTitle>Latest Session Radar</SectionTitle>
                <ResponsiveContainer width="100%" height={220}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#252545"/>
                    <PolarAngleAxis dataKey="subject" tick={{fill:"#8888aa",fontSize:12}}/>
                    <Radar dataKey="score" stroke="#7c6fff" fill="#7c6fff" fillOpacity={0.25}/>
                  </RadarChart>
                </ResponsiveContainer>
              </Card>
              <Card>
                <SectionTitle>Latest Scores</SectionTitle>
                {radarData.map(r=>(
                  <div key={r.subject} className="mb-4">
                    <div className="flex justify-between mb-1.5">
                      <span className="text-sm text-[#8888aa]">{r.subject}</span>
                      <span className="text-sm font-bold" style={{color:r.score>=7?"#4ade80":r.score>=5?"#fbbf24":"#f87171"}}>{r.score}/10</span>
                    </div>
                    <div className="h-2 bg-[#111122] rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{width:`${r.score*10}%`,background:SCORE_COLORS[r.subject]}}/>
                    </div>
                  </div>
                ))}
                {selScores.length>=2 && (
                  <div className="mt-4 pt-4 border-t border-[#252545]">
                    <p className="text-xs text-[#8888aa] mb-2">Improvement (first → latest)</p>
                    {Object.keys(SCORE_COLORS).map(k=>{
                      const d=delta(selScores,k.toLowerCase());
                      return <div key={k} className="flex justify-between text-xs mb-1">
                        <span className="text-[#8888aa]">{k}</span>
                        <span className={`font-bold ${d==null?"text-[#8888aa]":d>0?"text-[#4ade80]":d<0?"text-[#f87171]":"text-[#8888aa]"}`}>
                          {d==null?"—":d>0?`+${d}`:d}
                        </span>
                      </div>;
                    })}
                  </div>
                )}
              </Card>
            </div>
          )}

          {chartData.length>0 && (
            <Card className="mb-6">
              <SectionTitle>Score History — {selected.registeredName||selected.name}</SectionTitle>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#252545"/>
                  <XAxis dataKey="session" stroke="#8888aa" fontSize={11}/>
                  <YAxis domain={[0,10]} stroke="#8888aa" fontSize={11}/>
                  <Tooltip contentStyle={tt}/><Legend/>
                  {Object.entries(SCORE_COLORS).map(([k,c])=>(
                    <Line key={k} type="monotone" dataKey={k} stroke={c} strokeWidth={2} dot={{r:3}} activeDot={{r:5}}/>
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </Card>
          )}

          {selScores.length>0 && (
            <Card>
              <SectionTitle>Session History</SectionTitle>
              <div className="overflow-x-auto">
                <table className="w-full"><thead><tr>{["#","Date","Fluency","Grammar","Confidence","Vocabulary"].map(h=><Th key={h}>{h}</Th>)}</tr></thead>
                  <tbody>{[...selScores].reverse().map((s,i)=>(
                    <tr key={i} className="hover:bg-[#7c6fff]/5 transition-colors">
                      <Td className="text-[#8888aa]">{selScores.length-i}</Td>
                      <Td className="text-[#8888aa] text-xs">{s.date?new Date(s.date).toLocaleDateString("en-IN"):"—"}</Td>
                      {["fluency","grammar","confidence","vocabulary"].map(k=>(
                        <Td key={k} className="font-semibold" style={{color:(s[k]||0)>=7?"#4ade80":(s[k]||0)>=5?"#fbbf24":"#f87171"}}>{s[k]??"-"}/10</Td>
                      ))}
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </Layout>
  );
}
