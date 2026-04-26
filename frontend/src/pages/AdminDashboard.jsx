import { useEffect, useState, useMemo } from "react";
import Layout from "../components/Layout.jsx";
import StatCard from "../components/StatCard.jsx";
import api from "../api/client.js";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";

const CATEGORIES = ["Daily Life","Opinion","Personal Experience","English Growth","Future Goals","Fun Topic","Free Talk"];
const TABS = [
  { id:"overview", label:"📊 Overview" },
  { id:"today",    label:"📅 Today" },
  { id:"users",    label:"👥 Users" },
  { id:"reports",  label:"📈 Reports" },
  { id:"fines",    label:"💸 Fines" },
  { id:"questions",label:"❓ Questions" },
];
const PIE_COLORS = ["#7c6fff","#4ade80","#fbbf24","#ff6b9d","#38bdf8","#fb923c","#a78bfa"];
const tt = { background:"#16162a", border:"1px solid #252545", borderRadius:10, fontSize:12 };

const Card = ({ children, className="" }) => (
  <div className={`bg-[#16162a] border border-[#252545] rounded-2xl p-5 ${className}`}>{children}</div>
);
const SectionTitle = ({ children }) => <h3 className="text-base font-semibold text-[#e8e8f4] mb-4">{children}</h3>;
const Th = ({ children }) => <th className="text-left py-2.5 px-3 text-xs text-[#8888aa] font-medium border-b border-[#252545]">{children}</th>;
const Td = ({ children, className="" }) => <td className={`py-2.5 px-3 text-sm border-b border-[#252545]/50 ${className}`}>{children}</td>;

export default function AdminDashboard() {
  const [tab, setTab] = useState("overview");
  const [dashboard, setDashboard] = useState(null);
  const [users, setUsers] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [weekly, setWeekly] = useState([]);
  const [monthly, setMonthly] = useState([]);
  const [qForm, setQForm] = useState({ category:"", topic:"", question:"" });
  const [editQ, setEditQ] = useState(null);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState({ text:"", type:"success" });
  const [search, setSearch] = useState("");
  const [qSearch, setQSearch] = useState("");
  const [qCat, setQCat] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [d,u,q,w,m] = await Promise.all([
        api.get("/dashboard"), api.get("/users"),
        api.get("/questions?limit=200"),
        api.get("/dashboard/report/weekly"),
        api.get("/dashboard/report/monthly"),
      ]);
      setDashboard(d.data); setUsers(u.data);
      setQuestions(q.data.questions); setWeekly(w.data); setMonthly(m.data);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const msg = (text, type="success") => { setFlash({text,type}); setTimeout(()=>setFlash({text:"",type:"success"}),3000); };

  const changeRole = async (phone, role) => { await api.patch(`/users/${phone}/role`,{role}); msg(`Role → ${role}`); load(); };
  const toggleUser = async (phone) => { await api.patch(`/users/${phone}/toggle`); msg("Status toggled"); load(); };
  const deleteUser = async (phone) => { if(!confirm("Remove user?"))return; await api.delete(`/users/${phone}`); msg("Removed","danger"); load(); };
  const adjustFine = async (phone, cur) => { const v=prompt(`Adjust fine (neg=deduct). Current: ₹${cur}`,"0"); if(v===null||isNaN(+v))return; await api.patch(`/users/${phone}/fine`,{amount:+v}); msg(`Fine adjusted ₹${v}`); load(); };
  const resetFine = async (phone) => { if(!confirm("Reset fine to ₹0?"))return; const u=users.find(x=>x.phone===phone); if(!u)return; await api.patch(`/users/${phone}/fine`,{amount:-(u.fine||0)}); msg("Fine reset"); load(); };
  const saveQ = async (e) => { e.preventDefault(); if(editQ){await api.patch(`/questions/${editQ._id}`,qForm);setEditQ(null);msg("Updated!");}else{await api.post("/questions",qForm);msg("Added!");} setQForm({category:"",topic:"",question:""}); load(); };
  const deleteQ = async (id) => { if(!confirm("Delete?"))return; await api.delete(`/questions/${id}`); msg("Deleted","danger"); load(); };
  const startEdit = (q) => { setEditQ(q); setQForm({category:q.category,topic:q.topic,question:q.question}); window.scrollTo({top:0,behavior:"smooth"}); };

  const filteredUsers = useMemo(()=>users.filter(u=>{const s=search.toLowerCase();return(u.registeredName||u.name||"").toLowerCase().includes(s)||(u.phone||"").includes(s)}),[users,search]);
  const filteredQ = useMemo(()=>questions.filter(q=>(qCat?q.category===qCat:true)&&(q.question.toLowerCase().includes(qSearch.toLowerCase())||q.topic.toLowerCase().includes(qSearch.toLowerCase()))),[questions,qSearch,qCat]);

  const pieSub = [{name:"Submitted",value:dashboard?.stats?.completed||0,color:"#4ade80"},{name:"Pending",value:dashboard?.stats?.pending||0,color:"#f87171"}];
  const catCount = questions.reduce((a,q)=>{a[q.category]=(a[q.category]||0)+1;return a},{});
  const catPie = Object.entries(catCount).map(([name,value])=>({name,value}));
  const fineBar = [...users].filter(u=>(u.fine||0)>0).sort((a,b)=>(b.fine||0)-(a.fine||0)).slice(0,10).map(u=>({name:(u.registeredName||u.name||u.phone||"?").slice(0,8),fine:u.fine||0}));

  if (loading) return <Layout title="Admin Dashboard"><div className="flex justify-center py-24"><div className="w-10 h-10 border-2 border-[#252545] border-t-[#7c6fff] rounded-full animate-spin"/></div></Layout>;

  const Input = ({value,onChange,placeholder,className=""}) => (
    <input value={value} onChange={onChange} placeholder={placeholder}
      className={`bg-[#111122] border border-[#252545] rounded-xl px-3 py-2 text-[#e8e8f4] text-sm placeholder-[#444466] focus:border-[#7c6fff] transition-colors ${className}`}/>
  );

  return (
    <Layout title="Admin Dashboard">
      {flash.text && (
        <div className={`mb-4 px-4 py-2.5 rounded-xl text-sm font-medium ${flash.type==="danger"?"bg-[#f87171]/10 text-[#f87171] border border-[#f87171]/30":"bg-[#4ade80]/10 text-[#4ade80] border border-[#4ade80]/30"}`}>
          {flash.text}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard icon="👥" label="Total Users"     value={dashboard?.stats?.total||0}     color="#7c6fff"/>
        <StatCard icon="✅" label="Submitted Today" value={dashboard?.stats?.completed||0} color="#4ade80"/>
        <StatCard icon="❌" label="Pending Today"   value={dashboard?.stats?.pending||0}   color="#f87171"/>
        <StatCard icon="💸" label="Total Fines"     value={`₹${dashboard?.stats?.totalFines||0}`} color="#fbbf24"/>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 flex-wrap mb-6">
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${tab===t.id?"bg-[#7c6fff] text-white":"bg-[#16162a] border border-[#252545] text-[#8888aa] hover:text-[#e8e8f4] hover:border-[#353560]"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* OVERVIEW */}
      {tab==="overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <SectionTitle>Today's Submission Rate</SectionTitle>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart><Pie data={pieSub} dataKey="value" cx="50%" cy="50%" outerRadius={70} label={({name,value})=>`${name}: ${value}`}>
                {pieSub.map((e,i)=><Cell key={i} fill={e.color}/>)}
              </Pie><Tooltip contentStyle={tt}/></PieChart>
            </ResponsiveContainer>
          </Card>
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
            <SectionTitle>Weekly Submissions</SectionTitle>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={weekly.slice(0,10).map(u=>({name:(u.name||"?").slice(0,8),days:u.weeklySubmissions||0}))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#252545"/>
                <XAxis dataKey="name" stroke="#8888aa" fontSize={11}/>
                <YAxis domain={[0,7]} stroke="#8888aa" fontSize={11}/>
                <Tooltip contentStyle={tt}/>
                <Bar dataKey="days" fill="#7c6fff" radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card>
            <SectionTitle>Questions by Category</SectionTitle>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart><Pie data={catPie} dataKey="value" cx="50%" cy="50%" outerRadius={70} label={({value})=>value}>
                {catPie.map((_,i)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}/>)}
              </Pie><Tooltip contentStyle={tt}/><Legend iconSize={10} wrapperStyle={{fontSize:"0.75rem"}}/></PieChart>
            </ResponsiveContainer>
          </Card>
        </div>
      )}

      {/* TODAY */}
      {tab==="today" && (
        <>
          {dashboard?.today?.question ? (
            <div className="mb-6 rounded-2xl p-5 border border-[#7c6fff]/30" style={{background:"linear-gradient(135deg,rgba(124,111,255,0.1),rgba(255,107,157,0.05))"}}>
              <p className="text-xs text-[#8888aa] mb-2">📌 TODAY'S QUESTION</p>
              <p className="text-[#e8e8f4] font-semibold">{dashboard.today.question}</p>
            </div>
          ) : <div className="mb-6 bg-[#fbbf24]/8 border border-[#fbbf24]/20 rounded-2xl p-4 text-[#fbbf24] text-sm">⏳ No question sent today yet.</div>}
          <Card>
            <SectionTitle>Submission Status</SectionTitle>
            <div className="overflow-x-auto">
              <table className="w-full"><thead><tr>{["Name","Phone","Streak","Status","Fine"].map(h=><Th key={h}>{h}</Th>)}</tr></thead>
                <tbody>{users.map(u=>(
                  <tr key={u.userId} className="hover:bg-[#7c6fff]/5 transition-colors">
                    <Td className="text-[#e8e8f4] font-medium">{u.registeredName||u.name||"—"}</Td>
                    <Td className="text-[#8888aa] text-xs">{u.phone}</Td>
                    <Td>🔥 {u.streak||0}</Td>
                    <Td><span className={`text-xs font-semibold ${u.completed?"text-[#4ade80]":"text-[#f87171]"}`}>{u.completed?"✅ Submitted":"⏳ Pending"}</span></Td>
                    <Td className={u.fine>0?"text-[#f87171]":"text-[#8888aa]"}>₹{u.fine||0}</Td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* USERS */}
      {tab==="users" && (
        <Card>
          <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
            <SectionTitle>All Users ({filteredUsers.length})</SectionTitle>
            <Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name or phone…" className="w-56"/>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr>{["Name","Phone","Role","Streak","Weekly","Monthly","Fine","Status","Actions"].map(h=><Th key={h}>{h}</Th>)}</tr></thead>
              <tbody>{filteredUsers.map(u=>(
                <tr key={u.userId} className="hover:bg-[#7c6fff]/5 transition-colors">
                  <Td className="text-[#e8e8f4] font-medium whitespace-nowrap">{u.registeredName||u.name||"—"}</Td>
                  <Td className="text-[#8888aa] text-xs">{u.phone}</Td>
                  <Td>
                    <select value={u.role||"user"} onChange={e=>changeRole(u.phone,e.target.value)}
                      className="bg-[#111122] border border-[#252545] text-[#8888aa] rounded-lg px-2 py-1 text-xs">
                      {["user","trainer","admin"].map(r=><option key={r} value={r}>{r}</option>)}
                    </select>
                  </Td>
                  <Td>🔥 {u.streak||0}</Td>
                  <Td>{u.weeklySubmissions||0}/7</Td>
                  <Td>{u.monthlySubmissions||0}</Td>
                  <Td className={u.fine>0?"text-[#f87171] font-semibold":"text-[#8888aa]"}>₹{u.fine||0}</Td>
                  <Td><span className={`text-xs font-medium ${u.isActive?"text-[#4ade80]":"text-[#f87171]"}`}>{u.isActive?"Active":"Disabled"}</span></Td>
                  <Td>
                    <div className="flex gap-1 flex-wrap">
                      {[["±Fine",()=>adjustFine(u.phone,u.fine),""],["Reset",()=>resetFine(u.phone),""],
                        [u.isActive?"Disable":"Enable",()=>toggleUser(u.phone),""],
                        ["Remove",()=>deleteUser(u.phone),"text-[#f87171]"]].map(([l,fn,cls])=>(
                        <button key={l} onClick={fn} className={`text-xs border border-[#252545] px-2 py-1 rounded-lg text-[#8888aa] hover:border-[#7c6fff] hover:text-[#7c6fff] transition-all ${cls}`}>{l}</button>
                      ))}
                    </div>
                  </Td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </Card>
      )}

      {/* REPORTS */}
      {tab==="reports" && (
        <>
          <Card className="mb-4">
            <SectionTitle>📅 Weekly Report</SectionTitle>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={weekly.slice(0,15).map(u=>({name:(u.name||"?").slice(0,8),days:u.weeklySubmissions||0,streak:u.streak||0}))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#252545"/>
                <XAxis dataKey="name" stroke="#8888aa" fontSize={11}/>
                <YAxis domain={[0,7]} stroke="#8888aa" fontSize={11}/>
                <Tooltip contentStyle={tt}/><Legend/>
                <Bar dataKey="days" name="Days" fill="#7c6fff" radius={[4,4,0,0]}/>
                <Bar dataKey="streak" name="Streak" fill="#fbbf24" radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
            <div className="overflow-x-auto mt-4">
              <table className="w-full"><thead><tr>{["#","Name","Days","Streak","Weekly Fine"].map(h=><Th key={h}>{h}</Th>)}</tr></thead>
                <tbody>{weekly.map((u,i)=>(
                  <tr key={i} className="hover:bg-[#7c6fff]/5 transition-colors">
                    <Td className="text-[#8888aa]">{i+1}</Td>
                    <Td className="text-[#e8e8f4] font-medium">{u.name||u.userId?.split("@")[0]}</Td>
                    <Td><span className={(u.weeklySubmissions||0)>=7?"text-[#4ade80] font-semibold":(u.weeklySubmissions||0)>=4?"text-[#fbbf24]":"text-[#f87171]"}>{u.weeklySubmissions||0}/7</span></Td>
                    <Td>🔥 {u.streak||0}</Td>
                    <Td className="text-[#f87171]">₹{u.weeklyFine||0}</Td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </Card>
          <Card>
            <SectionTitle>📆 Monthly Report</SectionTitle>
            <div className="overflow-x-auto">
              <table className="w-full"><thead><tr>{["#","Name","Monthly","Streak","Total Fine"].map(h=><Th key={h}>{h}</Th>)}</tr></thead>
                <tbody>{monthly.map((u,i)=>(
                  <tr key={i} className="hover:bg-[#7c6fff]/5 transition-colors">
                    <Td className="text-[#8888aa]">{i+1}</Td>
                    <Td className="text-[#e8e8f4] font-medium">{u.name||u.userId?.split("@")[0]}</Td>
                    <Td>{u.monthlySubmissions||0}</Td>
                    <Td>🔥 {u.streak||0}</Td>
                    <Td className={u.fine>0?"text-[#f87171]":"text-[#8888aa]"}>₹{u.fine||0}</Td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* FINES */}
      {tab==="fines" && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <StatCard icon="💸" label="Total Outstanding" value={`₹${users.reduce((s,u)=>s+(u.fine||0),0)}`} color="#f87171"/>
            <StatCard icon="⚠️" label="Users with Fines"  value={users.filter(u=>(u.fine||0)>0).length}      color="#fbbf24"/>
            <StatCard icon="✅" label="Fine-Free Users"   value={users.filter(u=>(u.fine||0)===0).length}    color="#4ade80"/>
            <StatCard icon="📊" label="Avg Fine"          value={`₹${users.length?Math.round(users.reduce((s,u)=>s+(u.fine||0),0)/users.length):0}`} color="#7c6fff"/>
          </div>
          {fineBar.length>0 && (
            <Card className="mb-4">
              <SectionTitle>Top Fine Holders</SectionTitle>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={fineBar}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#252545"/>
                  <XAxis dataKey="name" stroke="#8888aa" fontSize={11}/>
                  <YAxis stroke="#8888aa" fontSize={11}/>
                  <Tooltip contentStyle={tt}/>
                  <Bar dataKey="fine" fill="#f87171" radius={[4,4,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}
          <Card>
            <SectionTitle>Fine Management</SectionTitle>
            <div className="overflow-x-auto">
              <table className="w-full"><thead><tr>{["Name","Phone","Total Fine","Weekly Fine","Actions"].map(h=><Th key={h}>{h}</Th>)}</tr></thead>
                <tbody>{[...users].sort((a,b)=>(b.fine||0)-(a.fine||0)).map(u=>(
                  <tr key={u.userId} className="hover:bg-[#7c6fff]/5 transition-colors">
                    <Td className="text-[#e8e8f4] font-medium">{u.registeredName||u.name||"—"}</Td>
                    <Td className="text-[#8888aa] text-xs">{u.phone}</Td>
                    <Td className={u.fine>0?"text-[#f87171] font-bold":"text-[#4ade80]"}>₹{u.fine||0}</Td>
                    <Td className="text-[#8888aa]">₹{u.weeklyFine||0}</Td>
                    <Td>
                      <button onClick={()=>adjustFine(u.phone,u.fine)} className="text-xs border border-[#252545] px-2 py-1 rounded-lg text-[#8888aa] hover:border-[#7c6fff] hover:text-[#7c6fff] transition-all mr-1">±Adjust</button>
                      <button onClick={()=>resetFine(u.phone)} className="text-xs border border-[#252545] px-2 py-1 rounded-lg text-[#8888aa] hover:border-[#f87171] hover:text-[#f87171] transition-all">Reset</button>
                    </Td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* QUESTIONS */}
      {tab==="questions" && (
        <>
          <Card className="mb-4">
            <SectionTitle>{editQ?"✏️ Edit Question":"➕ Add Question"}</SectionTitle>
            <form onSubmit={saveQ} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#8888aa] mb-1.5">Category</label>
                  <select value={qForm.category} onChange={e=>setQForm({...qForm,category:e.target.value})} required
                    className="w-full bg-[#111122] border border-[#252545] rounded-xl px-3 py-2.5 text-[#e8e8f4] text-sm focus:border-[#7c6fff] transition-colors">
                    <option value="">Select category</option>
                    {CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[#8888aa] mb-1.5">Topic</label>
                  <Input value={qForm.topic} onChange={e=>setQForm({...qForm,topic:e.target.value})} placeholder="e.g. Morning routines" className="w-full"/>
                </div>
              </div>
              <div>
                <label className="block text-xs text-[#8888aa] mb-1.5">Question</label>
                <textarea value={qForm.question} onChange={e=>setQForm({...qForm,question:e.target.value})} required placeholder="Write the question…"
                  className="w-full bg-[#111122] border border-[#252545] rounded-xl px-3 py-2.5 text-[#e8e8f4] text-sm focus:border-[#7c6fff] transition-colors resize-none h-20"/>
              </div>
              <div className="flex gap-2">
                <button type="submit" className="bg-[#7c6fff] text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-[#6055e0] transition-colors">{editQ?"Update":"Add Question"}</button>
                {editQ && <button type="button" onClick={()=>{setEditQ(null);setQForm({category:"",topic:"",question:""});}} className="border border-[#252545] text-[#8888aa] px-4 py-2 rounded-xl text-sm hover:border-[#7c6fff] transition-colors">Cancel</button>}
              </div>
            </form>
          </Card>
          <Card>
            <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
              <SectionTitle>Question Bank ({filteredQ.length}/{questions.length})</SectionTitle>
              <div className="flex gap-2 flex-wrap">
                <select value={qCat} onChange={e=>setQCat(e.target.value)} className="bg-[#111122] border border-[#252545] rounded-xl px-3 py-2 text-[#8888aa] text-xs focus:border-[#7c6fff] transition-colors">
                  <option value="">All Categories</option>
                  {CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
                <Input value={qSearch} onChange={e=>setQSearch(e.target.value)} placeholder="Search…" className="w-44"/>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full"><thead><tr>{["Category","Topic","Question","Actions"].map(h=><Th key={h}>{h}</Th>)}</tr></thead>
                <tbody>{filteredQ.map(q=>(
                  <tr key={q._id} className="hover:bg-[#7c6fff]/5 transition-colors">
                    <Td><span className="text-xs bg-[#7c6fff]/15 text-[#7c6fff] px-2 py-0.5 rounded-full whitespace-nowrap">{q.category}</span></Td>
                    <Td className="text-[#8888aa] text-xs whitespace-nowrap">{q.topic}</Td>
                    <Td className="max-w-xs text-[#e8e8f4]">{q.question}</Td>
                    <Td>
                      <button onClick={()=>startEdit(q)} className="text-xs border border-[#252545] px-2 py-1 rounded-lg text-[#8888aa] hover:border-[#7c6fff] hover:text-[#7c6fff] transition-all mr-1">Edit</button>
                      <button onClick={()=>deleteQ(q._id)} className="text-xs border border-[#252545] px-2 py-1 rounded-lg text-[#8888aa] hover:border-[#f87171] hover:text-[#f87171] transition-all">Delete</button>
                    </Td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </Layout>
  );
}
