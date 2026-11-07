import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  createClassSchema,
  createTaskSchema,
  awardPrizeSchema,
  type CreateClassInput,
  type CreateTaskInput,
  type AwardPrizeInput,
} from '@speak-shine/validation-schemas';
import { Button, Card, Badge } from '@speak-shine/ui-kit';
import {
  Users,
  Video,
  Plus,
  Flame,
  Award,
  Wallet,
  CheckCircle2,
  BookOpen,
  Calendar,
  Clock,
  Sparkles,
  Search,
  MessageSquare,
  Radio,
  Share2,
  Send,
  HelpCircle,
  Menu,
  X,
  LogOut,
  BarChart3,
  TrendingUp,
  FileText
} from 'lucide-react';

type TrainerTab = 'overview' | 'classes' | 'students' | 'tasks' | 'submissions' | 'live' | 'escrow' | 'doubts';

export default function App() {
  const [activeTab, setActiveTab] = useState<TrainerTab>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Trainer Profile State (Isolated to this trainer)
  const [trainer] = useState({
    name: 'Ananya Verma',
    email: 'ananya.coach@speak-shine.online',
    role: 'TRAINER',
    approvalStatus: 'ACTIVE',
    qualifications: ['M.A. English & Linguistics', 'Certified Public Speaking Coach (Toastmasters)'],
    bio: 'Dedicated to empowering professionals with executive presence and articulate speaking.',
    escrowBalance: 2500.00,
  });

  // Trainer's Own Classes (Data Isolated)
  const [classes, setClasses] = useState([
    {
      id: 'cls_1',
      title: 'Executive Voice & Fluency Cohort',
      classCode: 'SHINE-9402',
      status: 'ACTIVE',
      studentCount: 18,
      createdAt: '01 Nov 2026',
    },
    {
      id: 'cls_2',
      title: 'Morning Public Speaking Batch A',
      classCode: 'SHINE-7821',
      status: 'ACTIVE',
      studentCount: 24,
      createdAt: '25 Oct 2026',
    },
  ]);

  // Trainer's Students (Strictly filtered to this trainer's batches)
  const [students, setStudents] = useState([
    { id: 'u_1', name: 'Rahul Sharma', email: 'rahul.s@example.com', classCode: 'SHINE-9402', streak: 14, score: 840, walletBalance: 150 },
    { id: 'u_2', name: 'Aditi Patel', email: 'aditi.p@example.com', classCode: 'SHINE-9402', streak: 18, score: 920, walletBalance: 220 },
    { id: 'u_3', name: 'Kavita Menon', email: 'kavita.m@example.com', classCode: 'SHINE-9402', streak: 12, score: 790, walletBalance: 80 },
    { id: 'u_4', name: 'Siddharth Rao', email: 'sid.rao@example.com', classCode: 'SHINE-7821', streak: 21, score: 960, walletBalance: 300 },
    { id: 'u_5', name: 'Sneha Kulkarni', email: 'sneha.k@example.com', classCode: 'SHINE-7821', streak: 15, score: 870, walletBalance: 120 },
  ]);

  // Trainer's Assigned Tasks (Data Isolated)
  const [tasks, setTasks] = useState([
    {
      id: 't_1',
      classId: 'cls_1',
      classCode: 'SHINE-9402',
      title: 'Executive Presentation Opening Pitch',
      type: 'DAILY_CHALLENGE',
      prizePool: 50,
      dueDate: 'Today, 11:59 PM',
      submissionsCount: 12,
      totalStudents: 18,
    },
    {
      id: 't_2',
      classId: 'cls_2',
      classCode: 'SHINE-7821',
      title: 'Impromptu Objection Handling Pitch',
      type: 'DAILY_CHALLENGE',
      prizePool: 50,
      dueDate: 'Today, 11:59 PM',
      submissionsCount: 19,
      totalStudents: 24,
    },
  ]);

  // Submissions submitted by students in this trainer's classes (Data Isolated)
  const [submissions] = useState([
    {
      id: 'sub_1',
      studentName: 'Rahul Sharma',
      classCode: 'SHINE-9402',
      taskTitle: 'Executive Presentation Opening Pitch',
      date: 'Today, 09:30 AM',
      overallScore: 8.8,
      fluency: 9.0,
      grammar: 8.5,
      vocabulary: 8.8,
      status: 'ANALYZED',
    },
    {
      id: 'sub_2',
      studentName: 'Aditi Patel',
      classCode: 'SHINE-9402',
      taskTitle: 'Executive Presentation Opening Pitch',
      date: 'Today, 10:15 AM',
      overallScore: 9.2,
      fluency: 9.4,
      grammar: 9.0,
      vocabulary: 9.2,
      status: 'ANALYZED',
    },
    {
      id: 'sub_3',
      studentName: 'Siddharth Rao',
      classCode: 'SHINE-7821',
      taskTitle: 'Impromptu Objection Handling Pitch',
      date: 'Today, 11:00 AM',
      overallScore: 9.4,
      fluency: 9.5,
      grammar: 9.3,
      vocabulary: 9.4,
      status: 'ANALYZED',
    },
  ]);

  // Cash Prize Awards Disbursed by this Trainer (Data Isolated)
  const [disbursedPrizes, setDisbursedPrizes] = useState([
    { id: 'p_1', studentName: 'Rahul Sharma', classCode: 'SHINE-9402', amount: 50, reason: 'Top Fluency Cohort Award', date: 'Today' },
    { id: 'p_2', studentName: 'Siddharth Rao', classCode: 'SHINE-7821', amount: 100, reason: 'Consistent 20-Day Streak Leadership', date: 'Yesterday' },
  ]);

  // Student Doubts in Trainer's Cohorts (Data Isolated)
  const [doubts, setDoubts] = useState([
    {
      id: 'd_1',
      studentName: 'Rahul Sharma',
      classCode: 'SHINE-9402',
      question: 'How to manage vocal inflection when transitioning between slides?',
      status: 'RESOLVED',
      reply: 'Try pausing for 1.5s after introducing your core thesis before listing bullet points.',
    },
    {
      id: 'd_2',
      studentName: 'Kavita Menon',
      classCode: 'SHINE-9402',
      question: 'What exercises improve natural cadence and eliminate filler sounds?',
      status: 'OPEN',
      reply: '',
    },
  ]);
  const [replyText, setReplyText] = useState<{ [key: string]: string }>({});

  // Search filter for students
  const [searchStudent, setSearchStudent] = useState('');

  // Forms
  const {
    register: regClass,
    handleSubmit: handleClassSubmit,
    formState: { errors: classErrors },
    reset: resetClass,
  } = useForm<CreateClassInput>({
    resolver: zodResolver(createClassSchema),
  });

  const {
    register: regTask,
    handleSubmit: handleTaskSubmit,
    formState: { errors: taskErrors },
    reset: resetTask,
  } = useForm<CreateTaskInput>({
    resolver: zodResolver(createTaskSchema),
  });

  const {
    register: regPrize,
    handleSubmit: handlePrizeSubmit,
    formState: { errors: prizeErrors },
    reset: resetPrize,
  } = useForm<AwardPrizeInput>({
    resolver: zodResolver(awardPrizeSchema),
  });

  const onCreateClass = (data: CreateClassInput) => {
    const randomCode = `SHINE-${Math.floor(1000 + Math.random() * 9000)}`;
    const newCls = {
      id: `cls_${Date.now()}`,
      title: data.title,
      classCode: randomCode,
      status: 'ACTIVE',
      studentCount: 0,
      createdAt: 'Just now',
    };
    setClasses([newCls, ...classes]);
    alert(`Class "${data.title}" successfully created with Code: ${randomCode}!`);
    resetClass();
  };

  const onCreateTask = (data: CreateTaskInput) => {
    const targetClass = classes.find((c) => c.id === data.classId) || classes[0];
    const newTask = {
      id: `t_${Date.now()}`,
      classId: data.classId,
      classCode: targetClass.classCode,
      title: data.title,
      type: data.type,
      prizePool: data.prizePool || 50,
      dueDate: new Date(data.dueDate).toLocaleDateString(),
      submissionsCount: 0,
      totalStudents: targetClass.studentCount,
    };
    setTasks([newTask, ...tasks]);
    alert(`Task "${data.title}" published to Class ${targetClass.classCode}!`);
    resetTask();
  };

  const onAwardPrize = (data: AwardPrizeInput) => {
    const student = students.find((s) => s.id === data.studentId);
    if (!student) return;
    setDisbursedPrizes([
      {
        id: `p_${Date.now()}`,
        studentName: student.name,
        classCode: student.classCode,
        amount: data.amount,
        reason: data.reason,
        date: 'Just now',
      },
      ...disbursedPrizes,
    ]);
    alert(`₹${data.amount} awarded directly to ${student.name}'s wallet!`);
    resetPrize();
  };

  const handleResolveDoubt = (doubtId: string) => {
    const rep = replyText[doubtId];
    if (!rep?.trim()) return;
    setDoubts(
      doubts.map((d) => (d.id === doubtId ? { ...d, status: 'RESOLVED', reply: rep.trim() } : d))
    );
    setReplyText((prev) => ({ ...prev, [doubtId]: '' }));
    alert('Reply sent to student!');
  };

  const filteredStudents = students.filter(
    (s) =>
      s.name.toLowerCase().includes(searchStudent.toLowerCase()) ||
      s.email.toLowerCase().includes(searchStudent.toLowerCase()) ||
      s.classCode.toLowerCase().includes(searchStudent.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row text-slate-800">
      {/* ── Trainer Sidebar ─────────────────────────────────────────────────── */}
      <aside
        className={`fixed md:sticky top-0 z-40 h-screen w-72 bg-slate-900 text-white flex flex-col justify-between transition-transform duration-300 ease-in-out ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Brand Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center font-black text-white text-xl shadow-lg shadow-indigo-500/25">
                T
              </div>
              <div>
                <h1 className="font-extrabold text-base tracking-tight leading-none text-white">Trainer Hub</h1>
                <p className="text-xs text-indigo-400 mt-1 font-medium">trainer.speak-shine.online</p>
              </div>
            </div>
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="md:hidden text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Trainer Card */}
          <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-white">{trainer.name}</span>
              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full border border-emerald-400/20">
                ACTIVE
              </span>
            </div>
            <div className="text-xs text-slate-400">{trainer.qualifications[0]}</div>
            <div className="pt-2 border-t border-slate-700/60 flex items-center justify-between text-xs">
              <span className="text-slate-400">Escrow Balance:</span>
              <span className="font-bold text-emerald-400">₹{trainer.escrowBalance.toFixed(2)}</span>
            </div>
          </div>

          {/* Nav Links */}
          <nav className="space-y-1">
            <button
              onClick={() => { setActiveTab('overview'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all ${
                activeTab === 'overview'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Overview</span>
            </button>

            <button
              onClick={() => { setActiveTab('classes'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all ${
                activeTab === 'classes'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>My Classes</span>
              <span className="ml-auto text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full font-semibold">
                {classes.length}
              </span>
            </button>

            <button
              onClick={() => { setActiveTab('students'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all ${
                activeTab === 'students'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>My Students</span>
              <span className="ml-auto text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full font-semibold">
                {students.length}
              </span>
            </button>

            <button
              onClick={() => { setActiveTab('tasks'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all ${
                activeTab === 'tasks'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span>Class Tasks</span>
            </button>

            <button
              onClick={() => { setActiveTab('submissions'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all ${
                activeTab === 'submissions'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Submissions</span>
              <span className="ml-auto text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full font-semibold">
                {submissions.length}
              </span>
            </button>

            <button
              onClick={() => { setActiveTab('live'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all ${
                activeTab === 'live'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Radio className="w-4 h-4 text-rose-400" />
              <span>Live Classroom</span>
            </button>

            <button
              onClick={() => { setActiveTab('escrow'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all ${
                activeTab === 'escrow'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Wallet className="w-4 h-4" />
              <span>Cash Prize Escrow</span>
            </button>

            <button
              onClick={() => { setActiveTab('doubts'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all ${
                activeTab === 'doubts'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              <span>Student Doubts</span>
              {doubts.filter((d) => d.status === 'OPEN').length > 0 && (
                <span className="ml-auto text-xs font-bold bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded">
                  {doubts.filter((d) => d.status === 'OPEN').length}
                </span>
              )}
            </button>
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="p-6 border-t border-slate-800 space-y-3">
          <button
            onClick={() => alert('Trainer logged out safely.')}
            className="w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 rounded-lg transition-colors border border-rose-900/40"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ── Main Dashboard Viewport ─────────────────────────────────────────── */}
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
                {activeTab === 'overview' && 'Trainer Overview & Batches'}
                {activeTab === 'classes' && 'Class & Cohort Management'}
                {activeTab === 'students' && 'My Enrolled Students'}
                {activeTab === 'tasks' && 'Class Tasks & Assignments'}
                {activeTab === 'submissions' && 'Student Submissions Review'}
                {activeTab === 'live' && 'Live Classroom Session'}
                {activeTab === 'escrow' && 'Cash Prize Disbursements'}
                {activeTab === 'doubts' && 'Student Doubts & Doubts Queue'}
              </h2>
              <p className="text-xs text-slate-500">
                Coach: <strong className="text-slate-700">{trainer.name}</strong> · Data Isolated to Your Classes
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Badge variant="success" className="hidden sm:flex items-center gap-1.5 py-1 px-3">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Trainer Active & Approved</span>
            </Badge>

            <Button
              onClick={() => alert('Starting LiveKit Classroom video session for your cohort...')}
              variant="accent"
              size="sm"
              className="flex items-center gap-1.5"
            >
              <Video className="w-4 h-4" />
              <span>Start Live Room</span>
            </Button>
          </div>
        </header>

        {/* Viewport Content */}
        <main className="p-6 md:p-8 max-w-6xl w-full mx-auto space-y-6">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Active Cohorts</div>
                    <div className="text-xl font-bold text-slate-900">{classes.length}</div>
                  </div>
                </Card>

                <Card className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Total Enrolled</div>
                    <div className="text-xl font-bold text-slate-900">{students.length} Students</div>
                  </div>
                </Card>

                <Card className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Avg Fluency</div>
                    <div className="text-xl font-bold text-slate-900">8.9 / 10</div>
                  </div>
                </Card>

                <Card className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                    <Wallet className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Prize Escrow</div>
                    <div className="text-xl font-bold text-slate-900">₹{trainer.escrowBalance}</div>
                  </div>
                </Card>
              </div>

              {/* Active Batches List */}
              <Card className="p-6 space-y-4">
                <h4 className="font-bold text-slate-900 text-sm">Your Active Batches</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {classes.map((cls) => (
                    <div key={cls.id} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <h5 className="font-bold text-slate-900 text-sm">{cls.title}</h5>
                          <div className="text-xs text-slate-500">Created: {cls.createdAt}</div>
                        </div>
                        <Badge variant="info" className="font-mono">{cls.classCode}</Badge>
                      </div>
                      <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-200">
                        <span className="text-slate-600 font-medium">👥 {cls.studentCount} Students</span>
                        <Button
                          onClick={() => setActiveTab('students')}
                          variant="outline"
                          size="sm"
                        >
                          View Roster
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {/* TAB 2: MY CLASSES */}
          {activeTab === 'classes' && (
            <div className="space-y-6">
              {/* Create Class Form */}
              <Card className="p-6 space-y-4">
                <div>
                  <h4 className="font-bold text-slate-900 text-base">Create New Class / Batch</h4>
                  <p className="text-xs text-slate-500">An auto-generated unique class code (e.g. SHINE-XXXX) will be generated for student self-enrollment.</p>
                </div>
                <form onSubmit={handleClassSubmit(onCreateClass)} className="space-y-4 max-w-xl">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Class Title</label>
                    <input
                      {...regClass('title')}
                      placeholder="e.g. Corporate Voice & Executive Presence"
                      className="w-full px-4 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    {classErrors.title && <p className="text-xs text-rose-600 mt-1">{classErrors.title.message}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Description (Optional)</label>
                    <textarea
                      {...regClass('description')}
                      placeholder="Curriculum overview and batch objectives..."
                      rows={2}
                      className="w-full px-4 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <Button type="submit" variant="primary" size="md">
                    Generate Class & Code
                  </Button>
                </form>
              </Card>

              {/* Class Cards */}
              <div className="space-y-3">
                {classes.map((cls) => (
                  <Card key={cls.id} className="p-5 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h5 className="font-bold text-slate-900 text-base">{cls.title}</h5>
                        <Badge variant="success">{cls.status}</Badge>
                      </div>
                      <div className="text-xs text-slate-500">
                        Class Code: <strong className="font-mono text-indigo-700 font-bold">{cls.classCode}</strong> · {cls.studentCount} Students Enrolled
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => alert(`Code ${cls.classCode} copied to clipboard!`)}
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                        <span>Share Code</span>
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: MY STUDENTS */}
          {activeTab === 'students' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                  <input
                    value={searchStudent}
                    onChange={(e) => setSearchStudent(e.target.value)}
                    placeholder="Search by student name, email, or batch..."
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <Badge variant="info">Students in Your Cohorts Only: {filteredStudents.length}</Badge>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase font-bold text-slate-500">
                    <tr>
                      <th className="py-3.5 px-4">Student</th>
                      <th className="py-3.5 px-4">Batch Code</th>
                      <th className="py-3.5 px-4">Streak</th>
                      <th className="py-3.5 px-4">Monthly Score</th>
                      <th className="py-3.5 px-4">Wallet</th>
                      <th className="py-3.5 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredStudents.map((st) => (
                      <tr key={st.id} className="hover:bg-slate-50/50">
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-900">{st.name}</div>
                          <div className="text-xs text-slate-400">{st.email}</div>
                        </td>
                        <td className="py-3.5 px-4 font-mono font-bold text-indigo-700">{st.classCode}</td>
                        <td className="py-3.5 px-4 font-bold text-amber-600">🔥 {st.streak}d</td>
                        <td className="py-3.5 px-4 font-bold text-blue-600">🏆 {st.score} pts</td>
                        <td className="py-3.5 px-4 font-bold text-emerald-600">₹{st.walletBalance}</td>
                        <td className="py-3.5 px-4 text-right">
                          <Button
                            onClick={() => {
                              const amt = prompt(`Award cash prize (₹) to ${st.name}:`, '50');
                              if (amt && !isNaN(Number(amt))) {
                                onAwardPrize({
                                  classId: classes[0].id,
                                  studentId: st.id,
                                  amount: Number(amt),
                                  reason: 'Classroom Excellence Award',
                                });
                              }
                            }}
                            variant="outline"
                            size="sm"
                          >
                            Award Prize
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: CLASS TASKS */}
          {activeTab === 'tasks' && (
            <div className="space-y-6">
              {/* Task Creation Form */}
              <Card className="p-6 space-y-4">
                <h4 className="font-bold text-slate-900 text-base">Assign New Speaking Task to Your Class</h4>
                <form onSubmit={handleTaskSubmit(onCreateTask)} className="space-y-4 max-w-2xl">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Select Cohort</label>
                      <select
                        {...regTask('classId')}
                        className="w-full px-4 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      >
                        {classes.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.title} ({c.classCode})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Task Type</label>
                      <select
                        {...regTask('type')}
                        className="w-full px-4 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      >
                        <option value="DAILY_CHALLENGE">Daily Speaking Challenge</option>
                        <option value="VOCABULARY">Vocabulary Mastery Challenge</option>
                        <option value="PICTURE_DESCRIPTION">Picture Description</option>
                        <option value="STORY_TELLING">Storytelling & Narrative</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Task Title</label>
                    <input
                      {...regTask('title')}
                      placeholder="e.g. Mastering Executive Presence in High-Stakes Q&A"
                      className="w-full px-4 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    {taskErrors.title && <p className="text-xs text-rose-600 mt-1">{taskErrors.title.message}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Prompt / Instructions</label>
                    <textarea
                      {...regTask('description')}
                      placeholder="Detailed instructions for student speech response..."
                      rows={3}
                      className="w-full px-4 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    {taskErrors.description && <p className="text-xs text-rose-600 mt-1">{taskErrors.description.message}</p>}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Due Date</label>
                      <input
                        type="date"
                        {...regTask('dueDate')}
                        className="w-full px-4 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Prize Pool (₹)</label>
                      <input
                        type="number"
                        {...regTask('prizePool', { valueAsNumber: true })}
                        defaultValue={50}
                        className="w-full px-4 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    </div>
                  </div>

                  <Button type="submit" variant="primary" size="md">
                    Publish Task to Class
                  </Button>
                </form>
              </Card>

              {/* Task List */}
              <div className="space-y-3">
                {tasks.map((tk) => (
                  <Card key={tk.id} className="p-5 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded font-mono">
                          {tk.classCode}
                        </span>
                        <h5 className="font-bold text-slate-900 text-sm">{tk.title}</h5>
                      </div>
                      <div className="text-xs text-slate-500">
                        Due: {tk.dueDate} · Submissions: {tk.submissionsCount}/{tk.totalStudents} · Prize: ₹{tk.prizePool}
                      </div>
                    </div>
                    <Button
                      onClick={() => alert(`Reviewing submissions for ${tk.title}`)}
                      variant="outline"
                      size="sm"
                    >
                      View Submissions
                    </Button>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* TAB 5: SUBMISSIONS */}
          {activeTab === 'submissions' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 text-base">Student Video Submissions</h4>
                  <p className="text-xs text-slate-500">Filtered strictly to students in your active cohorts.</p>
                </div>
                <Badge variant="info">{submissions.length} Submissions Logged</Badge>
              </div>

              <div className="space-y-3">
                {submissions.map((sub) => (
                  <Card key={sub.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-slate-900 text-sm">{sub.studentName}</span>
                        <span className="text-[10px] font-bold font-mono text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                          {sub.classCode}
                        </span>
                        <span className="text-xs text-slate-400">· {sub.date}</span>
                      </div>
                      <div className="text-xs text-slate-600 font-medium">{sub.taskTitle}</div>
                      <div className="text-xs text-slate-500 mt-2 flex gap-3">
                        <span>Fluency: <strong className="text-blue-600">{sub.fluency}</strong></span>
                        <span>Grammar: <strong className="text-emerald-600">{sub.grammar}</strong></span>
                        <span>Vocab: <strong className="text-indigo-600">{sub.vocabulary}</strong></span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-center">
                        <div className="text-xl font-black text-indigo-600">{sub.overallScore}</div>
                        <div className="text-[10px] text-slate-500 uppercase font-bold">AI Score</div>
                      </div>
                      <Button
                        onClick={() => alert(`Opening video feedback console for ${sub.studentName}`)}
                        variant="outline"
                        size="sm"
                      >
                        Coach Feedback
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* TAB 6: LIVE CLASSROOM */}
          {activeTab === 'live' && (
            <Card className="p-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
                <Radio className="w-8 h-8 animate-pulse text-indigo-600" />
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-slate-900 text-lg">Live Classroom Broadcast</h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Launch interactive WebRTC video room via LiveKit for batch students to join live practice.
                </p>
              </div>
              <Button
                onClick={() => alert('Starting LiveKit Classroom video session for your cohort...')}
                variant="accent"
                size="md"
                className="gap-2"
              >
                <Video className="w-4 h-4" />
                <span>Launch Live Room</span>
              </Button>
            </Card>
          )}

          {/* TAB 7: CASH PRIZE ESCROW */}
          {activeTab === 'escrow' && (
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-purple-700 to-indigo-800 rounded-3xl p-6 text-white flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <div className="text-xs text-indigo-200">Your Class Prize Escrow</div>
                  <div className="text-3xl font-black">₹{trainer.escrowBalance.toFixed(2)}</div>
                  <div className="text-xs text-indigo-200 mt-1">Allocated budget to reward top speakers in your batches</div>
                </div>
                <Button
                  onClick={() => setActiveTab('students')}
                  variant="accent"
                  size="md"
                >
                  Award Student Prize
                </Button>
              </div>

              <Card className="p-6 space-y-4">
                <h4 className="font-bold text-slate-900 text-sm">Disbursed Prize Awards (Your Cohorts)</h4>
                <div className="divide-y divide-slate-100">
                  {disbursedPrizes.map((p) => (
                    <div key={p.id} className="py-3 flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">
                          {p.studentName} ({p.classCode})
                        </div>
                        <div className="text-xs text-slate-500">{p.date} · {p.reason}</div>
                      </div>
                      <span className="text-sm font-bold text-emerald-600">+₹{p.amount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {/* TAB 8: STUDENT DOUBTS */}
          {activeTab === 'doubts' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 text-base">Student Doubts & Questions</h4>
                  <p className="text-xs text-slate-500">Doubts submitted strictly by students in your cohorts.</p>
                </div>
                <Badge variant="info">{doubts.length} Doubts</Badge>
              </div>

              <div className="space-y-4">
                {doubts.map((d) => (
                  <Card key={d.id} className="p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-bold text-slate-900 text-sm">{d.studentName}</span>
                        <span className="text-xs text-indigo-600 font-mono ml-2 font-bold">{d.classCode}</span>
                      </div>
                      <Badge variant={d.status === 'RESOLVED' ? 'success' : 'amber'}>{d.status}</Badge>
                    </div>
                    <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <strong>Doubt:</strong> {d.question}
                    </p>

                    {d.status === 'RESOLVED' ? (
                      <div className="text-xs text-emerald-800 bg-emerald-50 p-3 rounded-xl border border-emerald-200">
                        <strong>Your Reply:</strong> {d.reply}
                      </div>
                    ) : (
                      <div className="space-y-2 pt-2">
                        <textarea
                          value={replyText[d.id] || ''}
                          onChange={(e) =>
                            setReplyText({ ...replyText, [d.id]: e.target.value })
                          }
                          placeholder="Type your coaching guidance for this student..."
                          rows={2}
                          className="w-full p-2.5 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                        <Button
                          onClick={() => handleResolveDoubt(d.id)}
                          variant="primary"
                          size="sm"
                          className="gap-1.5"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Send Guidance & Resolve</span>
                        </Button>
                      </div>
                    )}
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
