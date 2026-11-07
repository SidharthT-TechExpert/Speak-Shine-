import React, { useState, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { joinClassSchema, type JoinClassInput } from '@speak-shine/validation-schemas';
import { Button, Card, Badge } from '@speak-shine/ui-kit';
import {
  Flame,
  ShieldCheck,
  Trophy,
  Video,
  VideoOff,
  Mic,
  MicOff,
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
  Pause,
  Square,
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
  Volume2,
  Eye,
  Smile,
  FileCheck,
  UploadCloud,
  RotateCcw
} from 'lucide-react';

type StudentTab =
  | 'mission'
  | 'studio'
  | 'cohort'
  | 'performance'
  | 'submissions'
  | 'analysis'
  | 'live'
  | 'wallet'
  | 'doubts';

export default function App() {
  const [activeTab, setActiveTab] = useState<StudentTab>('mission');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Selected Submission for Analysis Report
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string>('sub_1');

  // Video Studio State
  const [cameraActive, setCameraActive] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
  const [backgroundBlur, setBackgroundBlur] = useState(true);
  const [noiseCancellation, setNoiseCancellation] = useState(true);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerIntervalRef = useRef<any>(null);

  // Student Profile State (Strictly isolated to this student)
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

  // Student's Submissions History (Data Isolated)
  const [mySubmissions, setMySubmissions] = useState([
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
      eyeContact: 8.7,
      bodyLanguage: 8.9,
      feedback: 'Excellent vocal modulation and eye contact. Used "Nuanced" and "Leverage" naturally.',
      transcript:
        'Good morning, leadership team. Today, I am presenting a nuanced roadmap designed to leverage our digital architecture, streamline operations, and synthesize our product metrics into sustainable growth.',
      grammarCorrections: [
        { original: 'we was planning to deploy', correction: 'we were planning to deploy', rule: 'Subject-Verb Agreement' },
        { original: 'more faster turnaround', correction: 'faster turnaround', rule: 'Double Comparative' },
      ],
      vocabStrong: ['Nuanced', 'Leverage', 'Synthesize', 'Sustainable growth'],
      vocabUpgrade: [{ word: 'Good results', suggestion: 'Exponential impact or optimal efficacy' }],
      presentationTips: [
        'Maintain a steady 130-150 words per minute cadence during high-stakes proposals.',
        'Slightly extend your pauses after major transitions to allow key metrics to land with senior leaders.',
      ],
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
      eyeContact: 8.1,
      bodyLanguage: 8.4,
      feedback: 'Good structured response with clear conflict-resolution framing. Slight hesitation around 0:40.',
      transcript:
        'In resolving cross-functional friction, our priority must be aligning engineering deliverables with customer success outcomes through transparent milestone tracking.',
      grammarCorrections: [
        { original: 'between all team members', correction: 'among all team members', rule: 'Preposition Choice (3+ entities)' },
      ],
      vocabStrong: ['Cross-functional', 'Deliverables', 'Transparent milestones'],
      vocabUpgrade: [{ word: 'Fix the problem', suggestion: 'Reconcile discrepancies or mitigate blockers' }],
      presentationTips: [
        'Avoid leaning back in your chair when addressing conflict scenarios; lean slightly forward to project engagement.',
      ],
    },
  ]);

  // Classmates in Student's Cohort (Isolated)
  const [classmates] = useState([
    { name: 'Aditi Patel', streak: 18, score: 920, avatar: 'AP' },
    { name: 'Rahul Sharma (You)', streak: 14, score: 840, avatar: 'RS', isMe: true },
    { name: 'Kavita Menon', streak: 12, score: 790, avatar: 'KM' },
    { name: 'Vikram Joshi', streak: 11, score: 760, avatar: 'VJ' },
    { name: 'Rohan Deshmukh', streak: 9, score: 680, avatar: 'RD' },
  ]);

  // Wallet Ledger
  const [walletTransactions] = useState([
    { id: 'tx_1', category: 'AWARD_PRIZE', title: 'Top Fluency Cohort Award', amount: 50.00, date: 'Today', type: 'CREDIT' },
    { id: 'tx_2', category: 'STREAK_BONUS', title: '14-Day Streak Milestone Reward', amount: 25.00, date: 'Yesterday', type: 'CREDIT' },
    { id: 'tx_3', category: 'REFERRAL_REWARD', title: 'Friend Enrolled with Code', amount: 5.00, date: '04 Nov 2026', type: 'CREDIT' },
    { id: 'tx_4', category: 'WITHDRAWAL', title: 'Bank UPI Transfer (#9821)', amount: -50.00, date: '01 Nov 2026', type: 'DEBIT' },
  ]);

  // Doubts Desk
  const [doubts, setDoubts] = useState([
    { id: 't_1', subject: 'Pacing during 60s pitch', status: 'RESOLVED', date: '04 Nov', trainerReply: 'Try pausing for 1.5s after introducing your core thesis before listing bullet points.' },
  ]);
  const [newDoubtText, setNewDoubtText] = useState('');

  // Active Report Details
  const activeReport = mySubmissions.find((s) => s.id === selectedSubmissionId) || mySubmissions[0];

  // Camera Management
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: true,
      });
      mediaStreamRef.current = stream;
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
      }
      setCameraActive(true);
    } catch (err: any) {
      alert(`Camera access notice: ${err.message || 'Permission denied or no webcam available'}. You can also use the video upload option below.`);
    }
  };

  const stopCamera = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (videoPreviewRef.current) {
      videoPreviewRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  const startRecording = () => {
    if (!mediaStreamRef.current) {
      startCamera();
    }
    setIsRecording(true);
    setRecordSeconds(0);
    setRecordedVideoUrl(null);

    timerIntervalRef.current = setInterval(() => {
      setRecordSeconds((s) => s + 1);
    }, 1000);
  };

  const stopRecording = () => {
    setIsRecording(false);
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
    stopCamera();
    // Simulate recorded video ready for review
    setRecordedVideoUrl('blob:speak-shine/recorded-submission.mp4');
  };

  const handleUploadSubmit = () => {
    if (recordSeconds < 10 && !recordedVideoUrl) {
      alert('Video submission must be at least 15-30 seconds long.');
      return;
    }
    setUploadProgress(10);
    const interval = setInterval(() => {
      setUploadProgress((p) => {
        if (!p || p >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            const newSub = {
              id: `sub_${Date.now()}`,
              date: 'Just now',
              taskTitle: todayMission.title,
              duration: `${Math.floor(recordSeconds / 60)}m ${recordSeconds % 60}s`,
              status: 'ANALYZED',
              overallScore: 8.9,
              fluency: 9.1,
              grammar: 8.8,
              vocabulary: 8.9,
              confidence: 9.0,
              eyeContact: 8.8,
              bodyLanguage: 9.0,
              feedback: 'Great job! Confident delivery with clear pauses between key propositions.',
              transcript: 'Recorded speech submitted and processed through Groq Whisper & Llama Vision analysis.',
              grammarCorrections: [],
              vocabStrong: ['Leverage', 'Nuanced', 'Synthesize'],
              vocabUpgrade: [],
              presentationTips: ['Sustain this cadence in live presentations.'],
            };
            setMySubmissions([newSub, ...mySubmissions]);
            setSelectedSubmissionId(newSub.id);
            setUploadProgress(null);
            setRecordedVideoUrl(null);
            setRecordSeconds(0);
            setActiveTab('analysis');
            alert('🎉 Video uploaded & analyzed successfully! Your AI Report is ready.');
          }, 600);
          return 100;
        }
        return p + 25;
      });
    }, 400);
  };

  useEffect(() => {
    return () => {
      stopCamera();
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, []);

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
                  <div className="text-[11px] text-slate-400">Batch: {student.enrolledClass.classCode}</div>
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
            </button>

            <button
              onClick={() => { setActiveTab('studio'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all ${
                activeTab === 'studio'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Video className="w-4 h-4 text-emerald-400" />
              <span>AI Recording Studio</span>
              <span className="ml-auto text-[10px] uppercase font-bold bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded">
                Record
              </span>
            </button>

            <button
              onClick={() => { setActiveTab('analysis'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all ${
                activeTab === 'analysis'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <BarChart3 className="w-4 h-4 text-indigo-400" />
              <span>Video Analysis Report</span>
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
          <button
            onClick={() => alert('Logged out safely.')}
            className="w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 rounded-lg transition-colors border border-rose-900/40"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ── Main Viewport ────────────────────────────────────────────────────── */}
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
                {activeTab === 'studio' && 'AI Video Recording Studio'}
                {activeTab === 'analysis' && 'AI Speech & Video Analysis Report'}
                {activeTab === 'submissions' && 'My Video Submissions History'}
                {activeTab === 'cohort' && 'My Cohort & Classmates'}
                {activeTab === 'performance' && 'Speech Competency & Badges'}
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
            <div className="hidden sm:flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 px-3 py-1.5 rounded-xl text-xs font-semibold">
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              <span>{todayMission.deadlineHoursLeft}h {todayMission.deadlineMinsLeft}m to Midnight</span>
            </div>

            <Button
              onClick={() => setActiveTab('studio')}
              variant="accent"
              size="sm"
              className="flex items-center gap-1.5"
            >
              <Video className="w-4 h-4" />
              <span>Launch Studio</span>
            </Button>
          </div>
        </header>

        {/* Viewport Content */}
        <main className="p-6 md:p-8 max-w-6xl w-full mx-auto space-y-6">
          {/* TAB: AI RECORDING STUDIO */}
          {activeTab === 'studio' && (
            <div className="space-y-6">
              {/* Studio Card */}
              <Card className="p-6 space-y-6 bg-slate-900 text-white border-slate-800 shadow-2xl">
                {/* Studio Header */}
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
                  <div className="flex items-center gap-3">
                    <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping" />
                    <div>
                      <h3 className="font-bold text-lg text-white">AI Speech Recording Studio</h3>
                      <p className="text-xs text-slate-400">
                        Topic: <strong className="text-indigo-300">{todayMission.title}</strong>
                      </p>
                    </div>
                  </div>

                  {/* AI Toggles */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setBackgroundBlur(!backgroundBlur)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                        backgroundBlur
                          ? 'bg-blue-600/30 border-blue-500 text-blue-300'
                          : 'bg-slate-800 border-slate-700 text-slate-400'
                      }`}
                    >
                      ✨ MediaPipe Blur: {backgroundBlur ? 'ON' : 'OFF'}
                    </button>
                    <button
                      onClick={() => setNoiseCancellation(!noiseCancellation)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                        noiseCancellation
                          ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300'
                          : 'bg-slate-800 border-slate-700 text-slate-400'
                      }`}
                    >
                      🎙️ RNNoise AI: {noiseCancellation ? 'ON' : 'OFF'}
                    </button>
                  </div>
                </div>

                {/* Video Viewfinder */}
                <div className="relative aspect-video w-full max-w-3xl mx-auto bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 flex items-center justify-center">
                  <video
                    ref={videoPreviewRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover ${cameraActive ? 'block' : 'hidden'} ${
                      backgroundBlur ? 'filter-none' : ''
                    }`}
                  />

                  {!cameraActive && !recordedVideoUrl && (
                    <div className="text-center space-y-3 p-6">
                      <div className="w-16 h-16 rounded-2xl bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
                        <VideoOff className="w-8 h-8" />
                      </div>
                      <div className="text-sm font-semibold text-slate-300">Camera Preview Inactive</div>
                      <p className="text-xs text-slate-500 max-w-sm">
                        Click "Enable Camera" to begin your 60-90s speech challenge with live AI noise cancellation and background blur.
                      </p>
                      <Button onClick={startCamera} variant="primary" size="sm" className="gap-2">
                        <Video className="w-4 h-4" />
                        <span>Enable Camera</span>
                      </Button>
                    </div>
                  )}

                  {recordedVideoUrl && (
                    <div className="text-center space-y-3 p-6">
                      <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/40">
                        <CheckCircle2 className="w-8 h-8" />
                      </div>
                      <div className="text-base font-bold text-white">Video Recorded ({recordSeconds}s)</div>
                      <p className="text-xs text-slate-400">
                        Review your recording or submit directly to Groq Whisper & Llama Vision for evaluation.
                      </p>
                    </div>
                  )}

                  {/* Live Recording HUD overlay */}
                  {isRecording && (
                    <div className="absolute top-4 left-4 bg-slate-950/80 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-rose-500/40 flex items-center gap-2.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
                      <span className="font-mono font-bold text-white text-xs">
                        {String(Math.floor(recordSeconds / 60)).padStart(2, '0')}:
                        {String(recordSeconds % 60).padStart(2, '0')}
                      </span>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold">
                        Target: {todayMission.minDuration}s – {todayMission.maxDuration}s
                      </span>
                    </div>
                  )}
                </div>

                {/* Upload Progress Bar */}
                {uploadProgress !== null && (
                  <div className="space-y-2 p-4 bg-blue-950/40 border border-blue-800 rounded-xl">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-blue-300">Uploading to Cloudflare R2 & Generating AI Report...</span>
                      <span className="text-blue-400 font-bold">{uploadProgress}%</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-2">
                      <div className="bg-blue-500 h-2 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
                    </div>
                  </div>
                )}

                {/* Studio Control Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-800">
                  <div className="flex items-center gap-3">
                    {!isRecording && !recordedVideoUrl && (
                      <Button
                        onClick={startRecording}
                        variant="accent"
                        size="md"
                        className="gap-2 bg-rose-600 hover:bg-rose-500 text-white font-bold"
                      >
                        <Video className="w-4 h-4" />
                        <span>Start Recording</span>
                      </Button>
                    )}

                    {isRecording && (
                      <Button
                        onClick={stopRecording}
                        variant="danger"
                        size="md"
                        className="gap-2 animate-pulse"
                      >
                        <Square className="w-4 h-4 fill-white" />
                        <span>Stop & Finalize ({recordSeconds}s)</span>
                      </Button>
                    )}

                    {recordedVideoUrl && (
                      <>
                        <Button
                          onClick={handleUploadSubmit}
                          variant="primary"
                          size="md"
                          className="gap-2 bg-emerald-600 hover:bg-emerald-500"
                        >
                          <UploadCloud className="w-4 h-4" />
                          <span>Submit for AI Analysis</span>
                        </Button>
                        <Button
                          onClick={() => { setRecordedVideoUrl(null); setRecordSeconds(0); startCamera(); }}
                          variant="outline"
                          size="md"
                          className="gap-2 text-slate-300 border-slate-700 hover:bg-slate-800"
                        >
                          <RotateCcw className="w-4 h-4" />
                          <span>Retake</span>
                        </Button>
                      </>
                    )}
                  </div>

                  <div className="text-xs text-slate-400 flex items-center gap-2">
                    <FileCheck className="w-4 h-4 text-emerald-400" />
                    <span>In-browser 16-frame sampling active (93% bandwidth saved)</span>
                  </div>
                </div>
              </Card>

              {/* Alternative File Upload Option */}
              <Card className="p-6 space-y-3 bg-white border-slate-200">
                <h4 className="font-bold text-slate-900 text-sm">Have a pre-recorded speech video?</h4>
                <p className="text-xs text-slate-500">
                  You can also upload an MP4 or WebM video file directly. Direct Cloudflare R2 presigned upload will process the video.
                </p>
                <div className="flex items-center gap-4">
                  <input
                    type="file"
                    accept="video/mp4,video/webm"
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        setRecordSeconds(72);
                        setRecordedVideoUrl('blob:file-uploaded');
                        alert(`Loaded ${e.target.files[0].name}. Click "Submit for AI Analysis" above!`);
                      }
                    }}
                    className="text-xs text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                  />
                </div>
              </Card>
            </div>
          )}

          {/* TAB: VIDEO ANALYSIS REPORT */}
          {activeTab === 'analysis' && (
            <div className="space-y-6">
              {/* Report Header Card */}
              <Card className="p-6 md:p-8 space-y-6 bg-gradient-to-tr from-slate-900 to-indigo-950 text-white border-slate-800 shadow-xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="success">AI Speech Analysis Completed</Badge>
                      <span className="text-xs text-slate-400">· {activeReport.date}</span>
                    </div>
                    <h3 className="text-2xl font-black text-white">{activeReport.taskTitle}</h3>
                    <p className="text-xs text-indigo-300 mt-1">
                      Evaluated via Whisper Transcriber, Groq Llama-Vision & Linguistic Grammar Model
                    </p>
                  </div>

                  <div className="bg-slate-800/80 border border-slate-700 p-4 rounded-2xl text-center min-w-[120px]">
                    <div className="text-3xl font-black text-indigo-400">{activeReport.overallScore}</div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Overall Score / 10</div>
                  </div>
                </div>

                {/* Score Competency Bars */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="bg-slate-800/50 p-3.5 rounded-xl border border-slate-700/60">
                    <div className="text-xs text-slate-400">Fluency & Cadence</div>
                    <div className="text-xl font-bold text-blue-400">{activeReport.fluency} <span className="text-xs text-slate-500">/ 10</span></div>
                  </div>
                  <div className="bg-slate-800/50 p-3.5 rounded-xl border border-slate-700/60">
                    <div className="text-xs text-slate-400">Grammar Accuracy</div>
                    <div className="text-xl font-bold text-emerald-400">{activeReport.grammar} <span className="text-xs text-slate-500">/ 10</span></div>
                  </div>
                  <div className="bg-slate-800/50 p-3.5 rounded-xl border border-slate-700/60">
                    <div className="text-xs text-slate-400">Executive Vocab</div>
                    <div className="text-xl font-bold text-indigo-400">{activeReport.vocabulary} <span className="text-xs text-slate-500">/ 10</span></div>
                  </div>
                  <div className="bg-slate-800/50 p-3.5 rounded-xl border border-slate-700/60">
                    <div className="text-xs text-slate-400">Visual Presence</div>
                    <div className="text-xl font-bold text-amber-400">{activeReport.confidence} <span className="text-xs text-slate-500">/ 10</span></div>
                  </div>
                </div>

                {/* Visual Presence Indicators */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  <div className="flex items-center gap-3 bg-slate-800/30 p-3 rounded-xl border border-slate-700/40">
                    <Eye className="w-5 h-5 text-blue-400" />
                    <div className="text-xs">
                      <div className="font-semibold text-slate-200">Eye Contact</div>
                      <div className="text-slate-400">{activeReport.eyeContact} / 10 · Direct gaze maintained</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 bg-slate-800/30 p-3 rounded-xl border border-slate-700/40">
                    <Smile className="w-5 h-5 text-amber-400" />
                    <div className="text-xs">
                      <div className="font-semibold text-slate-200">Facial Expressiveness</div>
                      <div className="text-slate-400">Dynamic inflection & engagement</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 bg-slate-800/30 p-3 rounded-xl border border-slate-700/40">
                    <Users className="w-5 h-5 text-emerald-400" />
                    <div className="text-xs">
                      <div className="font-semibold text-slate-200">Body Language</div>
                      <div className="text-slate-400">{activeReport.bodyLanguage} / 10 · Upright executive posture</div>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Speech Transcript */}
              <Card className="p-6 space-y-3">
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-blue-600" />
                  <span>Speech Transcription</span>
                </h4>
                <p className="text-xs md:text-sm text-slate-700 bg-slate-50 p-4 rounded-xl border border-slate-200 leading-relaxed font-sans">
                  "{activeReport.transcript}"
                </p>
              </Card>

              {/* Grammar Corrections */}
              {activeReport.grammarCorrections.length > 0 && (
                <Card className="p-6 space-y-4">
                  <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2 text-rose-600">
                    <AlertCircle className="w-4 h-4" />
                    <span>Grammar Improvements & Suggestions</span>
                  </h4>
                  <div className="space-y-3">
                    {activeReport.grammarCorrections.map((gc, i) => (
                      <div key={i} className="p-3.5 bg-rose-50/60 border border-rose-200 rounded-xl flex items-center justify-between text-xs">
                        <div>
                          <span className="line-through text-slate-500 mr-2">"{gc.original}"</span>
                          <span className="font-bold text-emerald-700">→ "{gc.correction}"</span>
                        </div>
                        <Badge variant="amber">{gc.rule}</Badge>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Vocabulary Highlights */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="p-6 space-y-3">
                  <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2 text-emerald-600">
                    <Sparkles className="w-4 h-4" />
                    <span>Strong Vocabulary Employed</span>
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {activeReport.vocabStrong.map((word) => (
                      <span key={word} className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1 rounded-lg text-xs font-semibold">
                        💎 {word}
                      </span>
                    ))}
                  </div>
                </Card>

                <Card className="p-6 space-y-3">
                  <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2 text-indigo-600">
                    <BookOpen className="w-4 h-4" />
                    <span>Vocabulary Upgrade Recommendations</span>
                  </h4>
                  <div className="space-y-2">
                    {activeReport.vocabUpgrade.map((vu, i) => (
                      <div key={i} className="text-xs p-2.5 bg-indigo-50/60 border border-indigo-100 rounded-xl">
                        <span className="text-slate-600">Replace "{vu.word}" with: </span>
                        <strong className="text-indigo-800 font-semibold">{vu.suggestion}</strong>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>

              {/* Presentation Tips */}
              <Card className="p-6 space-y-3">
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-amber-500" />
                  <span>Coach's Delivery & Presentation Guidance</span>
                </h4>
                <ul className="space-y-2 text-xs text-slate-700 list-disc list-inside">
                  {activeReport.presentationTips.map((tip, idx) => (
                    <li key={idx} className="leading-relaxed">{tip}</li>
                  ))}
                </ul>
              </Card>

              {/* Actions */}
              <div className="flex gap-3">
                <Button onClick={() => setActiveTab('studio')} variant="primary" size="md" className="gap-2">
                  <Video className="w-4 h-4" />
                  <span>Record Next Challenge</span>
                </Button>
                <Button onClick={() => setActiveTab('submissions')} variant="outline" size="md">
                  Back to Submissions
                </Button>
              </div>
            </div>
          )}

          {/* TAB: DAILY MISSION */}
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
                    onClick={() => setActiveTab('studio')}
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

          {/* TAB: MY COHORT */}
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

                {/* Classmates Roster */}
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

              {/* Switch / Join New Class Box */}
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

          {/* TAB: FLUENCY & RADAR */}
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

          {/* TAB: MY SUBMISSIONS */}
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
                          onClick={() => {
                            setSelectedSubmissionId(sub.id);
                            setActiveTab('analysis');
                          }}
                          variant="outline"
                          size="sm"
                        >
                          View Full Report
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* TAB: LIVE CLASSROOMS */}
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

          {/* TAB: WALLET & PRIZES */}
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

          {/* TAB: DOUBTS DESK */}
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
