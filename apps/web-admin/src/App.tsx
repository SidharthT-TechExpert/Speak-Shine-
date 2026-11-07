import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  trainerApprovalSchema,
  createTaskSchema,
  type TrainerApprovalInput,
  type CreateTaskInput,
} from '@speak-shine/validation-schemas';
import { Button, Card, Badge } from '@speak-shine/ui-kit';
import {
  ShieldAlert,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  BookOpen,
  Calendar,
  Wallet,
  Settings,
  Radio,
  FileText,
  AlertTriangle,
  Menu,
  X,
  LogOut,
  BarChart3,
  Search,
  Send,
  MessageSquare,
  Sparkles,
  Award,
  Bell,
  RefreshCw,
  TrendingUp
} from 'lucide-react';

type AdminTab =
  | 'overview'
  | 'today'
  | 'trainers'
  | 'classes'
  | 'students'
  | 'questions'
  | 'wallet'
  | 'live'
  | 'help'
  | 'settings';

export default function App() {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Admin Profile
  const [admin] = useState({
    name: 'Super Admin',
    email: 'admin@speak-shine.online',
    role: 'ADMIN',
  });

  // Telemetry Metrics
  const [metrics] = useState({
    totalStudents: 148,
    activeTrainers: 8,
    pendingTrainers: 2,
    totalClasses: 12,
    activeClasses: 11,
    todaySubmitted: 112,
    todayPending: 36,
    completionRate: '75.6%',
    totalCashPrizesAwarded: 14850.00,
  });

  // Trainer Applications Queue
  const [trainers, setTrainers] = useState([
    {
      id: 'tr_1',
      name: 'Vikram Sethi',
      email: 'vikram.s@coach.com',
      qualifications: ['Ph.D. English Literature', '10+ Years Corporate Communications Trainer'],
      status: 'PENDING_APPROVAL',
      appliedAt: '06 Nov 2026',
    },
    {
      id: 'tr_2',
      name: 'Pooja Bhatt',
      email: 'pooja.b@speech.org',
      qualifications: ['IELTS 8.5 Certified Trainer', 'Former BBC Broadcast Announcer'],
      status: 'PENDING_APPROVAL',
      appliedAt: '05 Nov 2026',
    },
    {
      id: 'tr_3',
      name: 'Ananya Verma',
      email: 'ananya.coach@speak-shine.online',
      qualifications: ['M.A. Linguistics', 'Toastmasters Division Champion'],
      status: 'ACTIVE',
      appliedAt: '20 Oct 2026',
    },
  ]);

  // All Classes Across the Platform
  const [classes, setClasses] = useState([
    { id: 'cls_1', title: 'Executive Voice & Fluency Cohort', classCode: 'SHINE-9402', trainerName: 'Ananya Verma', studentsCount: 18, status: 'ACTIVE' },
    { id: 'cls_2', title: 'Morning Public Speaking Batch A', classCode: 'SHINE-7821', trainerName: 'Ananya Verma', studentsCount: 24, status: 'ACTIVE' },
    { id: 'cls_3', title: 'IELTS Band 8 Speaking Bootcamp', classCode: 'SHINE-3301', trainerName: 'Dev Patel', studentsCount: 30, status: 'ACTIVE' },
    { id: 'cls_4', title: 'Interview Mastery for Tech Leaders', classCode: 'SHINE-4109', trainerName: 'Ramesh K.', studentsCount: 22, status: 'ACTIVE' },
  ]);

  // All Students Platform Registry
  const [students] = useState([
    { id: 'u_1', name: 'Rahul Sharma', email: 'rahul.s@example.com', classCode: 'SHINE-9402', streak: 14, score: 840, wallet: 150 },
    { id: 'u_2', name: 'Aditi Patel', email: 'aditi.p@example.com', classCode: 'SHINE-9402', streak: 18, score: 920, wallet: 220 },
    { id: 'u_3', name: 'Siddharth Rao', email: 'sid.rao@example.com', classCode: 'SHINE-7821', streak: 21, score: 960, wallet: 300 },
    { id: 'u_4', name: 'Sneha Kulkarni', email: 'sneha.k@example.com', classCode: 'SHINE-7821', streak: 15, score: 870, wallet: 120 },
    { id: 'u_5', name: 'Kavita Menon', email: 'kavita.m@example.com', classCode: 'SHINE-9402', streak: 12, score: 790, wallet: 80 },
  ]);

  // Question Bank
  const [questions, setQuestions] = useState([
    { id: 'q_1', date: 'Today (07 Nov)', category: 'Executive Speech', question: 'Present an executive pitch justifying a strategic pivot to stakeholders.', cefr: 'B2', status: 'ACTIVE_TODAY' },
    { id: 'q_2', date: 'Tomorrow (08 Nov)', category: 'Sunday Reflection', question: 'Sunday Fluency Reflection: 6 guided prompts analyzing this week\'s vocal growth.', cefr: 'C1', status: 'SCHEDULED' },
    { id: 'q_3', date: '09 Nov 2026', category: 'Idiomatic Mastery', question: 'Explain how you handled a high-pressure deadline using 3 metaphors.', cefr: 'B2', status: 'SCHEDULED' },
  ]);

  // Wallet Platform Transactions
  const [transactions] = useState([
    { id: 'tx_1', user: 'Rahul Sharma', category: 'AWARD_PRIZE', trainer: 'Ananya Verma', amount: 50.00, date: 'Today, 09:45 AM' },
    { id: 'tx_2', user: 'Siddharth Rao', category: 'AWARD_PRIZE', trainer: 'Ananya Verma', amount: 100.00, date: 'Yesterday' },
    { id: 'tx_3', user: 'Aditi Patel', category: 'STREAK_BONUS', trainer: 'System', amount: 25.00, date: '05 Nov 2026' },
  ]);

  // Central Help Desk Tickets
  const [helpTickets, setHelpTickets] = useState([
    { id: 'tk_1', user: 'Kavita Menon (Student)', subject: 'Microphone permission issue on Safari iOS', status: 'OPEN', priority: 'HIGH', date: 'Today' },
    { id: 'tk_2', user: 'Vikram Sethi (Trainer)', subject: 'Application verification status query', status: 'RESOLVED', priority: 'NORMAL', date: 'Yesterday' },
  ]);

  // Search filter
  const [searchTrainer, setSearchTrainer] = useState('');

  const handleApproveTrainer = (id: string, status: 'ACTIVE' | 'REJECTED') => {
    setTrainers(
      trainers.map((t) => (t.id === id ? { ...t, status } : t))
    );
    alert(`Trainer status successfully updated to: ${status}`);
  };

  const handleBroadcastReminder = () => {
    alert(`Broadcast alert sent to all ${metrics.todayPending} pending students to record before midnight!`);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row text-slate-800">
      {/* ── Admin Sidebar ────────────────────────────────────────────────────── */}
      <aside
        className={`fixed md:sticky top-0 z-40 h-screen w-72 bg-slate-900 text-white flex flex-col justify-between transition-transform duration-300 ease-in-out ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Brand Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-500 to-amber-600 flex items-center justify-center font-black text-white text-xl shadow-lg shadow-rose-500/25">
                A
              </div>
              <div>
                <h1 className="font-extrabold text-base tracking-tight leading-none text-white">Admin Portal</h1>
                <p className="text-xs text-rose-400 mt-1 font-medium">admin.speak-shine.online</p>
              </div>
            </div>
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="md:hidden text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Admin Tag */}
          <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-white">{admin.name}</span>
              <span className="text-[10px] font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">
                SUPER ADMIN
              </span>
            </div>
            <div className="text-xs text-slate-400">{admin.email}</div>
          </div>

          {/* Navigation Menu Links */}
          <nav className="space-y-1">
            <button
              onClick={() => { setActiveTab('overview'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all ${
                activeTab === 'overview'
                  ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Overview</span>
            </button>

            <button
              onClick={() => { setActiveTab('today'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all ${
                activeTab === 'today'
                  ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>Today's Submissions</span>
              <span className="ml-auto text-xs font-bold bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded">
                {metrics.todayPending} left
              </span>
            </button>

            <button
              onClick={() => { setActiveTab('trainers'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all ${
                activeTab === 'trainers'
                  ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <ShieldAlert className="w-4 h-4" />
              <span>Trainer Approvals</span>
              {trainers.filter((t) => t.status === 'PENDING_APPROVAL').length > 0 && (
                <span className="ml-auto text-xs font-bold bg-rose-500 text-white px-2 py-0.5 rounded-full">
                  {trainers.filter((t) => t.status === 'PENDING_APPROVAL').length}
                </span>
              )}
            </button>

            <button
              onClick={() => { setActiveTab('classes'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all ${
                activeTab === 'classes'
                  ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>All Classes</span>
              <span className="ml-auto text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full font-semibold">
                {classes.length}
              </span>
            </button>

            <button
              onClick={() => { setActiveTab('students'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all ${
                activeTab === 'students'
                  ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>All Students</span>
              <span className="ml-auto text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full font-semibold">
                {students.length}
              </span>
            </button>

            <button
              onClick={() => { setActiveTab('questions'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all ${
                activeTab === 'questions'
                  ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span>Question Bank</span>
            </button>

            <button
              onClick={() => { setActiveTab('wallet'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all ${
                activeTab === 'wallet'
                  ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Wallet className="w-4 h-4" />
              <span>Wallet & Financials</span>
            </button>

            <button
              onClick={() => { setActiveTab('live'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all ${
                activeTab === 'live'
                  ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Radio className="w-4 h-4 text-rose-400" />
              <span>Live Rooms Monitor</span>
            </button>

            <button
              onClick={() => { setActiveTab('help'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all ${
                activeTab === 'help'
                  ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              <span>Help Desk Tickets</span>
            </button>

            <button
              onClick={() => { setActiveTab('settings'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all ${
                activeTab === 'settings'
                  ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>Platform Settings</span>
            </button>
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="p-6 border-t border-slate-800 space-y-3">
          <button
            onClick={() => alert('Admin logged out safely.')}
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
                {activeTab === 'overview' && 'Platform Performance & Telemetry'}
                {activeTab === 'today' && 'Today\'s Live Submissions Monitor'}
                {activeTab === 'trainers' && 'Trainer Approvals & Governance'}
                {activeTab === 'classes' && 'All Classes & Cohorts Platform Registry'}
                {activeTab === 'students' && 'All Students Registry'}
                {activeTab === 'questions' && 'Curriculum & Question Bank'}
                {activeTab === 'wallet' && 'Financial Ledger & Cash Prizes'}
                {activeTab === 'live' && 'Global Live Rooms Monitor'}
                {activeTab === 'help' && 'Centralized Help Desk'}
                {activeTab === 'settings' && 'Platform Reset & Maintenance Controls'}
              </h2>
              <p className="text-xs text-slate-500">
                Logged in as <strong className="text-slate-700">{admin.name}</strong> · System Level Authority
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Badge variant="success" className="hidden sm:flex items-center gap-1.5 py-1 px-3">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>All Systems Operational</span>
            </Badge>

            <Button
              onClick={() => alert('8:00 AM IST Daily Question publisher triggered!')}
              variant="accent"
              size="sm"
              className="flex items-center gap-1.5"
            >
              <Sparkles className="w-4 h-4" />
              <span>Publish Daily Mission</span>
            </Button>
          </div>
        </header>

        {/* Viewport Tabs */}
        <main className="p-6 md:p-8 max-w-6xl w-full mx-auto space-y-6">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Total Students</div>
                    <div className="text-xl font-bold text-slate-900">{metrics.totalStudents}</div>
                  </div>
                </Card>

                <Card className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Active Trainers</div>
                    <div className="text-xl font-bold text-slate-900">{metrics.activeTrainers}</div>
                  </div>
                </Card>

                <Card className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Total Cohorts</div>
                    <div className="text-xl font-bold text-slate-900">{metrics.totalClasses}</div>
                  </div>
                </Card>

                <Card className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Completion Rate</div>
                    <div className="text-xl font-bold text-slate-900">{metrics.completionRate}</div>
                  </div>
                </Card>
              </div>

              {/* Pending Approvals Warning Banner */}
              {trainers.filter((t) => t.status === 'PENDING_APPROVAL').length > 0 && (
                <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                    <div>
                      <div className="text-sm font-bold text-amber-900">
                        {trainers.filter((t) => t.status === 'PENDING_APPROVAL').length} Trainer Application(s) Awaiting Review
                      </div>
                      <div className="text-xs text-amber-700">
                        New coach signups must be verified before they can publish classes or assign tasks.
                      </div>
                    </div>
                  </div>
                  <Button
                    onClick={() => setActiveTab('trainers')}
                    variant="accent"
                    size="sm"
                  >
                    Review Now
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: TODAY'S LIVE SUBMISSIONS */}
          {activeTab === 'today' && (
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 text-white flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl">
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-indigo-300 uppercase tracking-wider">
                    Today's Real-Time Submission Velocity
                  </div>
                  <h3 className="text-2xl font-black">
                    {metrics.todaySubmitted} Submitted · {metrics.todayPending} Pending
                  </h3>
                  <p className="text-xs text-slate-300">
                    Midnight deadline approaching in 11 hours. Automatic fine and freeze shield deduction triggers at 12:00 AM IST.
                  </p>
                </div>

                <Button
                  onClick={handleBroadcastReminder}
                  variant="accent"
                  size="md"
                  className="gap-2 flex-shrink-0"
                >
                  <Send className="w-4 h-4" />
                  <span>Send Broadcast WhatsApp/Push</span>
                </Button>
              </div>
            </div>
          )}

          {/* TAB 3: TRAINER GOVERNANCE */}
          {activeTab === 'trainers' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 text-base">Trainer Applications & Verification</h4>
                  <p className="text-xs text-slate-500">Approve or reject professional coach accounts.</p>
                </div>
                <Badge variant="info">{trainers.length} Registered Trainers</Badge>
              </div>

              <div className="space-y-3">
                {trainers.map((tr) => (
                  <Card key={tr.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">{tr.name}</span>
                        <Badge variant={tr.status === 'ACTIVE' ? 'success' : 'amber'}>
                          {tr.status}
                        </Badge>
                      </div>
                      <div className="text-xs text-slate-500">{tr.email} · Applied on {tr.appliedAt}</div>
                      <div className="text-xs text-slate-700 bg-slate-50 p-2 rounded-lg border border-slate-100">
                        🎓 <strong>Qualifications:</strong> {tr.qualifications.join(' · ')}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {tr.status === 'PENDING_APPROVAL' ? (
                        <>
                          <Button
                            onClick={() => handleApproveTrainer(tr.id, 'ACTIVE')}
                            variant="primary"
                            size="sm"
                            className="gap-1 bg-emerald-600 hover:bg-emerald-700"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Approve</span>
                          </Button>
                          <Button
                            onClick={() => handleApproveTrainer(tr.id, 'REJECTED')}
                            variant="danger"
                            size="sm"
                            className="gap-1"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Reject</span>
                          </Button>
                        </>
                      ) : (
                        <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                          Verified & Active
                        </span>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: ALL CLASSES */}
          {activeTab === 'classes' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 text-base">Global Class Directory</h4>
                  <p className="text-xs text-slate-500">Every cohort active across all registered trainers.</p>
                </div>
                <Badge variant="info">{classes.length} Total Cohorts</Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {classes.map((c) => (
                  <Card key={c.id} className="p-5 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <h5 className="font-bold text-slate-900 text-sm">{c.title}</h5>
                        <div className="text-xs text-slate-500">Assigned Coach: {c.trainerName}</div>
                      </div>
                      <Badge variant="info" className="font-mono">{c.classCode}</Badge>
                    </div>
                    <div className="flex justify-between text-xs pt-2 border-t border-slate-100 text-slate-600">
                      <span>👥 {c.studentsCount} Students Enrolled</span>
                      <span className="font-bold text-emerald-600">{c.status}</span>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* TAB 5: ALL STUDENTS */}
          {activeTab === 'students' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 text-base">Global Student Registry</h4>
                  <p className="text-xs text-slate-500">All registered students across every cohort.</p>
                </div>
                <Badge variant="info">{students.length} Students</Badge>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase font-bold text-slate-500">
                    <tr>
                      <th className="py-3.5 px-4">Student</th>
                      <th className="py-3.5 px-4">Cohort</th>
                      <th className="py-3.5 px-4">Streak</th>
                      <th className="py-3.5 px-4">Monthly Score</th>
                      <th className="py-3.5 px-4">Wallet Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {students.map((st) => (
                      <tr key={st.id} className="hover:bg-slate-50/50">
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-900">{st.name}</div>
                          <div className="text-xs text-slate-400">{st.email}</div>
                        </td>
                        <td className="py-3.5 px-4 font-mono font-bold text-blue-700">{st.classCode}</td>
                        <td className="py-3.5 px-4 font-bold text-amber-600">🔥 {st.streak}d</td>
                        <td className="py-3.5 px-4 font-bold text-blue-600">🏆 {st.score} pts</td>
                        <td className="py-3.5 px-4 font-bold text-emerald-600">₹{st.wallet}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 6: QUESTION BANK */}
          {activeTab === 'questions' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 text-base">Daily Question Bank & Scheduler</h4>
                  <p className="text-xs text-slate-500">Automated daily question publisher fires at 8:00 AM IST.</p>
                </div>
                <Button
                  onClick={() => alert('New curriculum question added to scheduling pool!')}
                  variant="primary"
                  size="sm"
                >
                  Add Question
                </Button>
              </div>

              <div className="space-y-3">
                {questions.map((q) => (
                  <Card key={q.id} className="p-4 flex justify-between items-center">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-slate-500">{q.date}</span>
                        <Badge variant={q.status === 'ACTIVE_TODAY' ? 'success' : 'info'}>{q.status}</Badge>
                        <span className="text-xs text-indigo-600 font-bold">[{q.cefr}]</span>
                      </div>
                      <div className="text-sm font-semibold text-slate-900">{q.question}</div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* TAB 7: WALLET & FINANCIALS */}
          {activeTab === 'wallet' && (
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-emerald-600 to-teal-700 rounded-3xl p-6 text-white flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <div className="text-xs text-emerald-200">Total Platform Prizes Disbursed</div>
                  <div className="text-3xl font-black">₹{metrics.totalCashPrizesAwarded.toFixed(2)}</div>
                  <div className="text-xs text-emerald-100 mt-1">Sum of all trainer awards, streak bonuses, and referrals</div>
                </div>
                <Button
                  onClick={() => alert('Platform financial audit exported!')}
                  variant="accent"
                  size="md"
                >
                  Export Audit CSV
                </Button>
              </div>

              <Card className="p-6 space-y-4">
                <h4 className="font-bold text-slate-900 text-sm">Recent Cash Prize Disbursements</h4>
                <div className="divide-y divide-slate-100">
                  {transactions.map((tx) => (
                    <div key={tx.id} className="py-3 flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{tx.user}</div>
                        <div className="text-xs text-slate-500">Awarded by: {tx.trainer} · {tx.date}</div>
                      </div>
                      <span className="text-sm font-bold text-emerald-600">+₹{tx.amount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {/* TAB 8: LIVE ROOMS MONITOR */}
          {activeTab === 'live' && (
            <Card className="p-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
                <Radio className="w-8 h-8 animate-pulse text-rose-600" />
              </div>
              <h4 className="font-bold text-slate-900 text-lg">Active LiveKit WebRTC Rooms</h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                All video streams across trainers are running via LiveKit server infrastructure.
              </p>
              <Badge variant="success">All LiveKit SFU Nodes Healthy</Badge>
            </Card>
          )}

          {/* TAB 9: HELP DESK */}
          {activeTab === 'help' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 text-base">Global Help Desk & Support</h4>
                  <p className="text-xs text-slate-500">Inquiries submitted by students and trainers across the platform.</p>
                </div>
                <Badge variant="info">{helpTickets.length} Tickets</Badge>
              </div>

              <div className="space-y-3">
                {helpTickets.map((t) => (
                  <Card key={t.id} className="p-4 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-slate-900 text-sm">{t.user}</span>
                        <Badge variant={t.status === 'RESOLVED' ? 'success' : 'amber'}>{t.status}</Badge>
                      </div>
                      <div className="text-xs text-slate-600">{t.subject}</div>
                    </div>
                    <Button
                      onClick={() => alert(`Opening ticket ${t.id} resolution console...`)}
                      variant="outline"
                      size="sm"
                    >
                      Resolve
                    </Button>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* TAB 10: SETTINGS */}
          {activeTab === 'settings' && (
            <Card className="p-6 space-y-6">
              <h4 className="font-bold text-slate-900 text-base">Platform Automations & Crons</h4>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <div className="font-bold text-sm text-slate-900">12:00 AM Midnight Daily Reset Cron</div>
                    <div className="text-xs text-slate-500">Evaluates daily streaks, deducts freeze shields, resets submission counters</div>
                  </div>
                  <Badge variant="success">SCHEDULED</Badge>
                </div>

                <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <div className="font-bold text-sm text-slate-900">08:00 AM Daily Question Publishing Cron</div>
                    <div className="text-xs text-slate-500">Publishes next question from question bank to student dashboards</div>
                  </div>
                  <Badge variant="success">SCHEDULED</Badge>
                </div>
              </div>
            </Card>
          )}
        </main>
      </div>
    </div>
  );
}
