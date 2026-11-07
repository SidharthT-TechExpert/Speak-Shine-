import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { joinClassSchema, type JoinClassInput } from '@speak-shine/validation-schemas';
import { Button, Card, Badge } from '@speak-shine/ui-kit';
import {
  Flame,
  ShieldCheck,
  Trophy,
  Video,
  Users,
  Sparkles,
  BookOpen,
  Calendar,
  Clock,
  Award,
  Wallet,
  HelpCircle,
  LogOut,
  ChevronRight,
  Play,
  CheckCircle2,
  AlertCircle,
  Share2,
  Send,
  MessageSquare,
  BarChart3,
  TrendingUp,
  Radio,
  Menu,
  X,
  Volume2
} from 'lucide-react';

type StudentTab = 'mission' | 'cohort' | 'performance' | 'submissions' | 'live' | 'wallet' | 'doubts';

export default function App() {
  const [activeTab, setActiveTab] = useState<StudentTab>('mission');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Student State (Scoped strictly to this student)
  const [student] = useState({
    name: 'Rahul Sharma',
    email: 'rahul.s@example.com',
    role: 'STUDENT',
    streak: 14,
    streakFreeze: 2,
    freezeStreakProgress: 5,
    monthlyScore: 840,
    walletBalance: 150.00,
    referralReward: 5,
    enrolledClass: {
      id: 'cls_101',
      title: 'Executive Fluency & Articulation Cohort',
      classCode: 'SHINE-9402',
      trainerName: 'Ananya Verma',
      trainerTitle: 'Senior Voice & Speech Coach',
      trainerAvatar: 'AV',
      classmatesCount: 18,
    },
  });

  // Today's Mission
  const [todayMission] = useState({
    id: 'task_daily_1',
    title: 'Executive Presentation Opening Pitch',
    cefrLevel: 'B2 / Advanced Fluency',
    deadlineHoursLeft: 11,
    deadlineMinsLeft: 24,
    prompt:
      'Record a 60-90 second introduction presenting a complex project proposal to senior stakeholders. Focus on vocal inflection, executive cadence, and structured signposting.',
    vocabularyWords: ['Nuanced', 'Leverage', 'Paradigm', 'Streamline', 'Synthesize'],
    minDuration: 45,
    maxDuration: 90,
    prizePool: 50,
  });

  // Student's Own Submissions (Isolated)
  const [mySubmissions] = useState([
    {
      id: 'sub_1',
      date: 'Today, 09:30 AM',
      taskTitle: 'Executive Presentation Opening Pitch',
      duration: '1m 18s',
      status: 'ANALYZED',
      overallScore: 8.8,
      fluency: 9.0,
      grammar: 8.5,
      vocabulary: 8.8,
      confidence: 9.0,
      feedback: 'Excellent vocal modulation and eye contact. Used "Nuanced" and "Leverage" naturally.',
    },
    {
      id: 'sub_2',
      date: 'Yesterday, 07:45 PM',
      taskTitle: 'Navigating Cross-Functional Conflict',
      duration: '1m 05s',
      status: 'ANALYZED',
      overallScore: 8.2,
      fluency: 8.0,
      grammar: 8.6,
      vocabulary: 8.1,
      confidence: 8.2,
      feedback: 'Good structured response with clear conflict-resolution framing. Slight hesitation around 0:40.',
    },
    {
      id: 'sub_3',
      date: '05 Nov 2026',
      taskTitle: 'Persuasive Storytelling & Metaphors',
      duration: '1m 24s',
      status: 'ANALYZED',
      overallScore: 8.6,
      fluency: 8.7,
      grammar: 8.4,
      vocabulary: 8.9,
      confidence: 8.5,
      feedback: 'Strong opening hook. Metaphor regarding "river and currents" was vivid and impactful.',
    },
  ]);

  // Classmates in Student's Cohort (Isolated to this class)
  const [classmates] = useState([
    { name: 'Aditi Patel', streak: 18, score: 920, avatar: 'AP' },
    { name: 'Rahul Sharma (You)', streak: 14, score: 840, avatar: 'RS', isMe: true },
    { name: 'Kavita Menon', streak: 12, score: 790, avatar: 'KM' },
    { name: 'Vikram Joshi', streak: 11, score: 760, avatar: 'VJ' },
    { name: 'Rohan Deshmukh', streak: 9, score: 680, avatar: 'RD' },
  ]);

  // Student's Wallet Ledger (Isolated)
  const [walletTransactions] = useState([
    { id: 'tx_1', category: 'AWARD_PRIZE', title: 'Top Fluency Cohort Award', amount: 50.00, date: 'Today', type: 'CREDIT' },
    { id: 'tx_2', category: 'STREAK_BONUS', title: '14-Day Streak Milestone Reward', amount: 25.00, date: 'Yesterday', type: 'CREDIT' },
    { id: 'tx_3', category: 'REFERRAL_REWARD', title: 'Friend Enrolled with Code', amount: 5.00, date: '04 Nov 2026', type: 'CREDIT' },
    { id: 'tx_4', category: 'WITHDRAWAL', title: 'Bank UPI Transfer (#9821)', amount: -50.00, date: '01 Nov 2026', type: 'DEBIT' },
  ]);

  // Student's Doubts / Support Tickets (Isolated)
  const [doubts, setDoubts] = useState([
    { id: 't_1', subject: 'Pacing during 60s pitch', status: 'RESOLVED', date: '04 Nov', trainerReply: 'Try pausing for 1.5s after introducing your core thesis before listing bullet points.' },
  ]);
  const [newDoubtText, setNewDoubtText] = useState('');

  // Join Class Form
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<JoinClassInput>({
    resolver: zodResolver(joinClassSchema),
  });

  const onJoinClass = (data: JoinClassInput) => {
    alert(`Request to join Class Code ${data.classCode} submitted to trainer!`);
    reset();
  };

  const handlePostDoubt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDoubtText.trim()) return;
    setDoubts([
      {
        id: `t_${Date.now()}`,
        subject: newDoubtText.trim(),
        status: 'OPEN',
        date: 'Just now',
        trainerReply: 'Waiting for coach Ananya Verma to review...',
      },
      ...doubts,
    ]);
    setNewDoubtText('');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row text-slate-800">
      {/* ── Desktop & Mobile Sidebar ────────────────────────────────────────── */}
      <aside
        className={`fixed md:sticky top-0 z-40 h-screen w-72 bg-slate-900 text-white flex flex-col justify-between transition-transform duration-300 ease-in-out ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Brand Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center font-black text-white text-xl shadow-lg shadow-blue-500/25">
                S
              </div>
              <div>
                <h1 className="font-extrabold text-base tracking-tight leading-none text-white">Speak & Shine</h1>
                <p className="text-xs text-blue-400 mt-1 font-medium">speak-shine.online</p>
              </div>
            </div>
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="md:hidden text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Student Status Summary Card */}
          <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
                  RS
                </div>
                <div>
                  <div className="text-sm font-semibold text-white leading-tight">{student.name}</div>
                  <div className="text-[11px] text-slate-400">Class: {student.enrolledClass.classCode}</div>
                </div>
              </div>
              <span className="text-[11px] font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/20">
                🎁 ₹{student.referralReward}
              </span>
            </div>

            {/* Streak & Score Indicators */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-700/60">
              <div className="flex items-center gap-1.5 text-xs text-amber-400 font-bold">
                <Flame className="w-3.5 h-3.5 fill-amber-400" />
                <span>{student.streak} Days</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-blue-400 font-bold justify-end">
                <Trophy className="w-3.5 h-3.5" />
                <span>{student.monthlyScore} Pts</span>
              </div>
            </div>
          </div>

          {/* Navigation Menu Links */}
          <nav className="space-y-1">
            <button
              onClick={() => { setActiveTab('mission'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all ${
                activeTab === 'mission'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>Daily Mission</span>
              <span className="ml-auto text-[10px] uppercase font-bold bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded">
                Active
              </span>
            </button>

            <button
              onClick={() => { setActiveTab('cohort'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all ${
                activeTab === 'cohort'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>My Cohort</span>
            </button>

            <button
              onClick={() => { setActiveTab('performance'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all ${
                activeTab === 'performance'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              <span>Fluency & Radar</span>
            </button>

            <button
              onClick={() => { setActiveTab('submissions'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all ${
                activeTab === 'submissions'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>My Submissions</span>
              <span className="ml-auto text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full font-semibold">
                {mySubmissions.length}
              </span>
            </button>

            <button
              onClick={() => { setActiveTab('live'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all ${
                activeTab === 'live'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Radio className="w-4 h-4 text-rose-400" />
              <span>Live Classrooms</span>
            </button>

            <button
              onClick={() => { setActiveTab('wallet'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all ${
                activeTab === 'wallet'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Wallet className="w-4 h-4" />
              <span>Wallet & Prizes</span>
              <span className="ml-auto text-xs font-bold text-emerald-400">
                ₹{student.walletBalance.toFixed(0)}
              </span>
            </button>

            <button
              onClick={() => { setActiveTab('doubts'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all ${
                activeTab === 'doubts'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              <span>Ask Coach / Doubts</span>
            </button>
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="p-6 border-t border-slate-800 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Role</span>
            <span className="font-semibold text-blue-400 bg-blue-950 px-2 py-0.5 rounded border border-blue-800">
              Verified Student
            </span>
          </div>
          <button
            onClick={() => alert('Logged out safely.')}
            className="w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 rounded-lg transition-colors border border-rose-900/40"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ── Main Dashboard Content Viewport ─────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="border-b border-slate-200 bg-white sticky top-0 z-30 px-6 py-3.5 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 rounded-lg bg-slate-100 text-slate-700"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h2 className="font-bold text-slate-900 text-lg leading-tight">
                {activeTab === 'mission' && 'Today\'s Speaking Challenge'}
                {activeTab === 'cohort' && 'My Cohort & Classmates'}
                {activeTab === 'performance' && 'Fluency Radar & Badges'}
                {activeTab === 'submissions' && 'Submission History & Feedback'}
                {activeTab === 'live' && 'Trainer Live Classrooms'}
                {activeTab === 'wallet' && 'Cash Prize Ledger'}
                {activeTab === 'doubts' && 'Ask Your Coach'}
              </h2>
              <p className="text-xs text-slate-500">
                Logged in as <strong className="text-slate-700">{student.name}</strong> · Batch {student.enrolledClass.classCode}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Countdown Badge */}
            <div className="hidden sm:flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 px-3 py-1.5 rounded-xl text-xs font-semibold">
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              <span>{todayMission.deadlineHoursLeft}h {todayMission.deadlineMinsLeft}m to Midnight</span>
            </div>

            <Button
              onClick={() => setActiveTab('mission')}
              variant="primary"
              size="sm"
              className="flex items-center gap-1.5"
            >
              <Video className="w-4 h-4" />
              <span className="hidden sm:inline">Record Video</span>
            </Button>
          </div>
        </header>

        {/* Viewport Tabs */}
        <main className="p-6 md:p-8 max-w-6xl w-full mx-auto space-y-6">
          {/* TAB 1: DAILY MISSION */}
          {activeTab === 'mission' && (
            <div className="space-y-6">
              {/* Mission Hero Banner */}
              <div className="bg-gradient-to-tr from-blue-700 via-indigo-700 to-blue-800 rounded-3xl p-8 text-white shadow-xl shadow-blue-700/10 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-white/20 backdrop-blur-md">
                    🎯 {todayMission.cefrLevel}
                  </span>
                  <div className="flex items-center gap-2 text-xs font-semibold bg-amber-400 text-slate-950 px-3 py-1 rounded-full shadow-sm">
                    <Trophy className="w-3.5 h-3.5" />
                    <span>₹{todayMission.prizePool} Cash Prize Pool</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-2xl md:text-3xl font-extrabold tracking-tight leading-tight">
                    {todayMission.title}
                  </h3>
                  <p className="text-blue-100 text-sm md:text-base leading-relaxed max-w-3xl">
                    {todayMission.prompt}
                  </p>
                </div>

                {/* Vocabulary Target Words */}
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-blue-200 uppercase tracking-wider">
                    Recommended Target Vocabulary:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {todayMission.vocabularyWords.map((word) => (
                      <span
                        key={word}
                        className="bg-white/10 hover:bg-white/20 border border-white/20 px-3 py-1 rounded-lg text-xs font-medium backdrop-blur-sm transition-colors"
                      >
                        ⚡ {word}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-4 flex flex-wrap items-center gap-4 border-t border-white/15">
                  <Button
                    onClick={() => alert('Camera & Microphone initialized! Record using MediaPipe Selfie Blur.')}
                    variant="accent"
                    size="lg"
                    className="flex items-center gap-2"
                  >
                    <Video className="w-5 h-5" />
                    <span>Launch AI Video Recorder</span>
                  </Button>
                  <span className="text-xs text-blue-200">
                    Duration: {todayMission.minDuration}s – {todayMission.maxDuration}s · Auto AI Noise Cancellation
                  </span>
                </div>
              </div>

              {/* Stats Bar */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                    <Flame className="w-5 h-5 fill-amber-500 text-amber-500" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Active Streak</div>
                    <div className="text-lg font-bold text-slate-900">{student.streak} Days</div>
                  </div>
                </Card>

                <Card className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Freeze Shields</div>
                    <div className="text-lg font-bold text-slate-900">{student.streakFreeze} Active</div>
                  </div>
                </Card>

                <Card className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                    <Trophy className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Score Rating</div>
                    <div className="text-lg font-bold text-slate-900">{student.monthlyScore} Pts</div>
                  </div>
                </Card>

                <Card className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                    <Wallet className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Prize Wallet</div>
                    <div className="text-lg font-bold text-slate-900">₹{student.walletBalance.toFixed(2)}</div>
                  </div>
                </Card>
              </div>
            </div>
          )}

          {/* TAB 2: MY COHORT */}
          {activeTab === 'cohort' && (
            <div className="space-y-6">
              {/* Cohort Header Card */}
              <Card className="p-6 space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-6">
                  <div>
                    <Badge variant="info" className="mb-2">Your Enrolled Batch</Badge>
                    <h3 className="text-xl font-bold text-slate-900">{student.enrolledClass.title}</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Assigned Coach: <strong className="text-slate-800">{student.enrolledClass.trainerName}</strong> ({student.enrolledClass.trainerTitle})
                    </p>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-center gap-4">
                    <div>
                      <div className="text-[11px] font-bold text-blue-600 uppercase">Class Code</div>
                      <div className="text-xl font-black text-blue-900 font-mono tracking-wider">
                        {student.enrolledClass.classCode}
                      </div>
                    </div>
                    <Button
                      onClick={() => alert(`Code ${student.enrolledClass.classCode} copied to clipboard!`)}
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>Share</span>
                    </Button>
                  </div>
                </div>

                {/* Classmates Roster (Isolated strictly to this batch) */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                      <Users className="w-4 h-4 text-blue-600" />
                      <span>Students in this Batch ({classmates.length})</span>
                    </h4>
                    <span className="text-xs text-slate-500">Data isolated to {student.enrolledClass.classCode}</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {classmates.map((cm, idx) => (
                      <div
                        key={cm.name}
                        className={`flex items-center justify-between p-3.5 rounded-xl border ${
                          cm.isMe ? 'bg-blue-50/70 border-blue-300' : 'bg-white border-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-slate-800 text-white flex items-center justify-center font-bold text-xs">
                            {cm.avatar}
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-slate-900">{cm.name}</div>
                            <div className="text-xs text-slate-500">Rank #{idx + 1} · {cm.score} Pts</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                          <Flame className="w-3.5 h-3.5 fill-amber-500" />
                          <span>{cm.streak}d</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>

              {/* Switch / Join New Class Code Box */}
              <Card className="p-6 space-y-4 bg-slate-50 border-slate-200">
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Switch or Join Another Class</h4>
                  <p className="text-xs text-slate-500">Have an invite code from another Speak & Shine trainer? Enter it below:</p>
                </div>
                <form onSubmit={handleSubmit(onJoinClass)} className="flex gap-3 max-w-md">
                  <input
                    {...register('classCode')}
                    placeholder="e.g. SHINE-7821"
                    className="flex-1 px-4 py-2 border border-slate-300 rounded-xl text-sm font-mono uppercase focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <Button type="submit" variant="primary" size="md">
                    Join Cohort
                  </Button>
                </form>
                {errors.classCode && (
                  <p className="text-xs text-rose-600">{errors.classCode.message}</p>
                )}
              </Card>
            </div>
          )}

          {/* TAB 3: PERFORMANCE & RADAR */}
          {activeTab === 'performance' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Speaking Competency Assessment */}
                <Card className="p-6 space-y-5">
                  <h4 className="font-bold text-slate-900 text-base flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-blue-600" />
                    <span>Speech Competency Radar (Your Average)</span>
                  </h4>

                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-xs font-semibold mb-1">
                        <span className="text-slate-700">Vocal Fluency & Flow</span>
                        <span className="text-blue-600 font-bold">9.0 / 10</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2.5">
                        <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: '90%' }}></div>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs font-semibold mb-1">
                        <span className="text-slate-700">Grammar & Syntax</span>
                        <span className="text-emerald-600 font-bold">8.5 / 10</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2.5">
                        <div className="bg-emerald-500 h-2.5 rounded-full" style={{ width: '85%' }}></div>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs font-semibold mb-1">
                        <span className="text-slate-700">Executive Vocabulary</span>
                        <span className="text-indigo-600 font-bold">8.8 / 10</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2.5">
                        <div className="bg-indigo-600 h-2.5 rounded-full" style={{ width: '88%' }}></div>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs font-semibold mb-1">
                        <span className="text-slate-700">Confidence & Delivery</span>
                        <span className="text-amber-600 font-bold">9.0 / 10</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2.5">
                        <div className="bg-amber-500 h-2.5 rounded-full" style={{ width: '90%' }}></div>
                      </div>
                    </div>
                  </div>
                </Card>

                {/* Freeze Shields & Streak Progression */}
                <Card className="p-6 space-y-5">
                  <h4 className="font-bold text-slate-900 text-base flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>Streak Freeze Progress</span>
                  </h4>

                  <p className="text-xs text-slate-500 leading-relaxed">
                    Submit consistently for 7 days in a row to earn +1 <strong>Streak Freeze Shield</strong>. Shields automatically protect your streak if you miss a day.
                  </p>

                  <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-3">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-emerald-900">Current 7-Day Cycle</span>
                      <span className="font-extrabold text-emerald-700">{student.freezeStreakProgress} of 7 Days</span>
                    </div>
                    <div className="w-full bg-emerald-200/60 rounded-full h-3">
                      <div
                        className="bg-emerald-600 h-3 rounded-full transition-all"
                        style={{ width: `${(student.freezeStreakProgress / 7) * 100}%` }}
                      ></div>
                    </div>
                    <div className="text-[11px] text-emerald-700 font-medium">
                      🎯 Only {7 - student.freezeStreakProgress} more daily submission(s) to unlock next shield!
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs font-medium text-slate-600">Total Shields Stored:</span>
                    <Badge variant="success">🛡️ {student.streakFreeze} Shields</Badge>
                  </div>
                </Card>
              </div>
            </div>
          )}

          {/* TAB 4: MY SUBMISSIONS */}
          {activeTab === 'submissions' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 text-base">My Video Submissions</h4>
                  <p className="text-xs text-slate-500">Only your personal submissions and AI reports are shown here.</p>
                </div>
                <Badge variant="info">{mySubmissions.length} Submissions Logged</Badge>
              </div>

              <div className="space-y-3">
                {mySubmissions.map((sub) => (
                  <Card key={sub.id} className="p-5 hover:shadow-md transition-shadow">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-slate-500">{sub.date}</span>
                          <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                            ⏱️ {sub.duration}
                          </span>
                        </div>
                        <h5 className="font-bold text-slate-900 text-base">{sub.taskTitle}</h5>
                        <p className="text-xs text-slate-600 max-w-2xl bg-slate-50 p-2 rounded-lg border border-slate-100">
                          💬 <em>"{sub.feedback}"</em>
                        </p>
                      </div>

                      <div className="flex items-center gap-4 flex-shrink-0">
                        <div className="text-center">
                          <div className="text-2xl font-black text-blue-600">{sub.overallScore}</div>
                          <div className="text-[10px] text-slate-500 font-bold uppercase">AI Score</div>
                        </div>
                        <Button
                          onClick={() => alert(`Reviewing submission ${sub.id}`)}
                          variant="outline"
                          size="sm"
                        >
                          View Report
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* TAB 5: LIVE CLASSROOMS */}
          {activeTab === 'live' && (
            <Card className="p-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
                <Radio className="w-8 h-8 animate-pulse" />
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-slate-900 text-lg">Classroom Live Room</h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Interactive LiveKit room with coach {student.enrolledClass.trainerName} for batch {student.enrolledClass.classCode}.
                </p>
              </div>
              <Button
                onClick={() => alert('Connecting to LiveKit WebRTC video room...')}
                variant="primary"
                size="md"
                className="gap-2"
              >
                <Video className="w-4 h-4" />
                <span>Enter Live Classroom</span>
              </Button>
            </Card>
          )}

          {/* TAB 6: WALLET & CASH PRIZES */}
          {activeTab === 'wallet' && (
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-emerald-600 to-teal-700 rounded-3xl p-6 text-white flex flex-col sm:flex-row items-center justify-between gap-4 shadow-lg shadow-emerald-600/10">
                <div>
                  <div className="text-xs font-semibold text-emerald-200">Your Cash Prize Wallet</div>
                  <div className="text-3xl font-black">₹{student.walletBalance.toFixed(2)}</div>
                  <div className="text-xs text-emerald-100 mt-1">Earned from daily challenge awards & streak milestones</div>
                </div>
                <Button
                  onClick={() => alert('Withdrawal request for ₹' + student.walletBalance + ' submitted for admin payout review!')}
                  variant="accent"
                  size="md"
                >
                  Withdraw to UPI
                </Button>
              </div>

              <Card className="p-6 space-y-4">
                <h4 className="font-bold text-slate-900 text-sm">Wallet Transaction History</h4>
                <div className="divide-y divide-slate-100">
                  {walletTransactions.map((tx) => (
                    <div key={tx.id} className="py-3 flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{tx.title}</div>
                        <div className="text-xs text-slate-500">{tx.date} · {tx.category}</div>
                      </div>
                      <span className={`text-sm font-bold ${tx.type === 'CREDIT' ? 'text-emerald-600' : 'text-slate-800'}`}>
                        {tx.type === 'CREDIT' ? `+₹${tx.amount.toFixed(2)}` : `-₹${Math.abs(tx.amount).toFixed(2)}`}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {/* TAB 7: DOUBTS DESK */}
          {activeTab === 'doubts' && (
            <div className="space-y-6">
              <Card className="p-6 space-y-4">
                <h4 className="font-bold text-slate-900 text-sm">Ask Coach {student.enrolledClass.trainerName}</h4>
                <form onSubmit={handlePostDoubt} className="space-y-3">
                  <textarea
                    value={newDoubtText}
                    onChange={(e) => setNewDoubtText(e.target.value)}
                    placeholder="Describe your question regarding pronunciation, grammar, or speech pacing..."
                    rows={3}
                    className="w-full p-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <Button type="submit" variant="primary" size="sm" className="gap-1.5">
                    <Send className="w-3.5 h-3.5" />
                    <span>Send Doubt</span>
                  </Button>
                </form>
              </Card>

              <div className="space-y-3">
                <h5 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Your Submitted Doubts</h5>
                {doubts.map((d) => (
                  <Card key={d.id} className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">{d.subject}</span>
                      <Badge variant={d.status === 'RESOLVED' ? 'success' : 'amber'}>{d.status}</Badge>
                    </div>
                    <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                      <strong>Coach Reply:</strong> {d.trainerReply}
                    </p>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
