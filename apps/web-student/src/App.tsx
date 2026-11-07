import React, { useState, useRef, useEffect, useMemo } from 'react';
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
  RotateCcw,
  Lock,
  Check,
  ExternalLink,
  Zap,
  Target,
  Sliders,
  Sparkle,
  Heart,
  MessageCircle,
  Filter
} from 'lucide-react';

// ── Tab Navigation Keys ──
type StudentTab =
  | 'mission'
  | 'studio'
  | 'community'
  | 'cohort'
  | 'performance'
  | 'submissions'
  | 'live'
  | 'wallet'
  | 'doubts';

// ── Audio Waveform Visualizer Pattern from main ──
const WAVE_PATTERN = [
  14, 20, 16, 26, 22, 14, 18, 24, 12, 22, 28, 18, 24, 16, 20,
  28, 22, 18, 26, 20, 14, 18, 24, 16, 22, 26, 18, 14
];

// ── Target Vocabulary Database with Phonetics and CEFR ──
const TARGET_VOCABULARY = [
  {
    word: 'Nuanced',
    level: 'C1',
    phonetic: '/ˈnjuː.ɑːnst/',
    definition: 'Characterized by subtle distinctions or shades of meaning.',
    context: 'Present a nuanced architecture roadmap rather than a binary plan.',
  },
  {
    word: 'Leverage',
    level: 'B2',
    phonetic: '/ˈlev.ər.ɪdʒ/',
    definition: 'Use existing assets or capabilities to maximum advantage.',
    context: 'Leverage our cloud-native stack to accelerate release velocity.',
  },
  {
    word: 'Synthesize',
    level: 'C1',
    phonetic: '/ˈsɪn.θə.saɪz/',
    definition: 'Combine distinct concepts or data into a coherent executive message.',
    context: 'Synthesize multiple metrics into clear executive takeaways.',
  },
  {
    word: 'Sustainable Growth',
    level: 'B2',
    phonetic: '/səˈsteɪ.nə.bəl ɡroʊθ/',
    definition: 'Long-term resilient business expansion without degrading core systems.',
    context: 'Balance aggressive client acquisition with sustainable growth.',
  },
  {
    word: 'Paradigm Shift',
    level: 'C2',
    phonetic: '/ˈpær.ə.daɪm ʃɪft/',
    definition: 'A fundamental transformation in approach or underlying assumptions.',
    context: 'This architecture represents a paradigm shift in data privacy.',
  },
];

// ── Midnight Countdown Timer with Dynamic Green/Orange/Red Urgency Cycle ──
function MidnightCountdownTimer() {
  const calc = () => {
    const now = new Date();
    const nowIST = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const midnight = new Date(nowIST);
    midnight.setDate(midnight.getDate() + 1);
    midnight.setHours(0, 0, 0, 0);

    const diffSec = Math.max(0, Math.floor((midnight.getTime() - nowIST.getTime()) / 1000));
    const totalHours = diffSec / 3600;
    const hrs = String(Math.floor(diffSec / 3600)).padStart(2, '0');
    const mins = String(Math.floor((diffSec % 3600) / 60)).padStart(2, '0');
    const secs = String(diffSec % 60).padStart(2, '0');

    let cycle: 'green' | 'orange' | 'red' = 'green';
    if (totalHours <= 2) cycle = 'red';
    else if (totalHours <= 8) cycle = 'orange';

    return { hrs, mins, secs, totalHours, cycle };
  };

  const [t, setT] = useState(calc);

  useEffect(() => {
    const interval = setInterval(() => setT(calc()), 1000);
    return () => clearInterval(interval);
  }, []);

  const cycleConfig = {
    green: {
      color: '#16a34a',
      badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      boxBg: 'bg-gradient-to-b from-white to-emerald-50/60 border-emerald-200 shadow-sm shadow-emerald-500/10',
      label: 'Active Window · Ample Time',
      dotColor: 'bg-emerald-500',
    },
    orange: {
      color: '#ea580c',
      badgeBg: 'bg-amber-50 text-amber-700 border-amber-200',
      boxBg: 'bg-gradient-to-b from-white to-amber-50/60 border-amber-200 shadow-sm shadow-amber-500/10',
      label: 'Evening Practice Window',
      dotColor: 'bg-amber-500',
    },
    red: {
      color: '#dc2626',
      badgeBg: 'bg-rose-50 text-rose-700 border-rose-200',
      boxBg: 'bg-gradient-to-b from-white to-rose-50/60 border-rose-200 shadow-sm shadow-rose-500/10',
      label: 'Closing at Midnight IST',
      dotColor: 'bg-rose-500',
    },
  }[t.cycle];

  return (
    <div className="bg-slate-900/40 backdrop-blur-md border border-white/10 rounded-2xl p-4 sm:p-5 text-white">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <span className="text-[11px] font-bold uppercase tracking-widest text-slate-300">
          Daily Practice Window
        </span>
        <div
          className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border flex items-center gap-1.5 ${cycleConfig.badgeBg}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${cycleConfig.dotColor} animate-pulse`} />
          <span>{cycleConfig.label}</span>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 sm:gap-3">
        <div className="flex-1 bg-white/10 border border-white/15 rounded-xl p-2.5 sm:p-3 text-center">
          <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight font-mono">
            {t.hrs}
          </div>
          <div className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-300 mt-0.5">
            HRS
          </div>
        </div>

        <span className="text-xl sm:text-2xl font-black text-white/50 pb-3 select-none">:</span>

        <div className="flex-1 bg-white/10 border border-white/15 rounded-xl p-2.5 sm:p-3 text-center">
          <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight font-mono">
            {t.mins}
          </div>
          <div className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-300 mt-0.5">
            MINS
          </div>
        </div>

        <span className="text-xl sm:text-2xl font-black text-white/50 pb-3 select-none">:</span>

        <div className="flex-1 bg-white/10 border border-white/15 rounded-xl p-2.5 sm:p-3 text-center">
          <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight font-mono">
            {t.secs}
          </div>
          <div className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-300 mt-0.5">
            SECS
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Realistic Audio Waveform Visualizer & Speech TTS Player ──
function AudioPromptWaveform({ promptText }: { promptText: string }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(1.0);
  const [activeBar, setActiveBar] = useState<number>(0);

  const togglePlay = () => {
    if (isPlaying) {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setIsPlaying(false);
    } else {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(promptText);
        utterance.rate = speed;
        utterance.onend = () => setIsPlaying(false);
        utterance.onerror = () => setIsPlaying(false);
        window.speechSynthesis.speak(utterance);
      }
      setIsPlaying(true);
    }
  };

  useEffect(() => {
    let timer: any;
    if (isPlaying) {
      timer = setInterval(() => {
        setActiveBar((prev) => (prev + 1) % WAVE_PATTERN.length);
      }, 180 / speed);
    } else {
      setActiveBar(0);
    }
    return () => clearInterval(timer);
  }, [isPlaying, speed]);

  return (
    <div className="bg-slate-900/50 backdrop-blur-md border border-white/15 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between text-xs text-slate-300">
        <span className="font-semibold flex items-center gap-1.5">
          <Volume2 className="w-4 h-4 text-amber-400" />
          <span>Challenge Audio Prompt & Cadence Sample</span>
        </span>
        <div className="flex items-center gap-1">
          {[0.75, 1.0, 1.25].map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                speed === s
                  ? 'bg-amber-400 text-slate-950 shadow-sm'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={togglePlay}
          className="w-10 h-10 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 flex items-center justify-center shadow-lg shadow-amber-500/20 transition-all flex-shrink-0"
        >
          {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
        </button>

        <div className="flex-1 flex items-center gap-1 h-10 px-2 bg-black/25 rounded-xl border border-white/10 overflow-hidden">
          {WAVE_PATTERN.map((h, i) => {
            const isCurrent = i === activeBar && isPlaying;
            const isPassed = i < activeBar && isPlaying;
            return (
              <div
                key={i}
                className={`flex-1 rounded-full transition-all duration-150 ${
                  isCurrent
                    ? 'bg-amber-300 scale-y-125'
                    : isPassed
                    ? 'bg-amber-400'
                    : 'bg-white/30'
                }`}
                style={{ height: `${h}px` }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Interactive SVG Area Chart Component ──
function TrajectoryAreaChart({
  scores,
}: {
  scores: { session: string; pts: number; date: string; isSundayBonus?: boolean }[];
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const minPts = 6.0;
  const maxPts = 10.0;
  const width = 600;
  const height = 180;
  const paddingX = 40;
  const paddingY = 25;

  const points = scores.map((s, i) => {
    const x = paddingX + (i / (scores.length - 1)) * (width - 2 * paddingX);
    const y = height - paddingY - ((s.pts - minPts) / (maxPts - minPts)) * (height - 2 * paddingY);
    return { x, y, ...s };
  });

  const pathD = points.reduce((acc, p, i) => {
    return i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
  }, '');

  const areaD = `${pathD} L ${points[points.length - 1].x} ${height - paddingY} L ${points[0].x} ${
    height - paddingY
  } Z`;

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-48 overflow-visible"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="purpleWaveGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {[6.0, 7.0, 8.0, 9.0, 10.0].map((val) => {
          const y = height - paddingY - ((val - minPts) / (maxPts - minPts)) * (height - 2 * paddingY);
          return (
            <g key={val}>
              <line
                x1={paddingX}
                y1={y}
                x2={width - paddingX}
                y2={y}
                stroke="#e2e8f0"
                strokeDasharray="4 4"
                strokeWidth="1"
              />
              <text x={10} y={y + 4} fontSize="10" fill="#94a3b8" fontWeight="600">
                {val.toFixed(1)}
              </text>
            </g>
          );
        })}

        <path d={areaD} fill="url(#purpleWaveGradient)" />
        <path d={pathD} fill="none" stroke="#8b5cf6" strokeWidth="3" strokeLinecap="round" />

        {points.map((p, i) => (
          <g
            key={i}
            className="cursor-pointer group"
            onMouseEnter={() => setHoverIndex(i)}
            onMouseLeave={() => setHoverIndex(null)}
          >
            <circle
              cx={p.x}
              cy={p.y}
              r={hoverIndex === i ? 7 : 5}
              fill="#ffffff"
              stroke="#8b5cf6"
              strokeWidth="3"
              className="transition-all duration-150"
            />
            {p.isSundayBonus && (
              <text x={p.x - 8} y={p.y - 12} fontSize="12">
                🎉
              </text>
            )}
            <text
              x={p.x}
              y={height - 6}
              textAnchor="middle"
              fontSize="10"
              fill="#64748b"
              fontWeight="600"
            >
              {p.session}
            </text>
          </g>
        ))}
      </svg>

      {hoverIndex !== null && (
        <div
          className="absolute -top-12 bg-slate-900 text-white text-xs px-3 py-1.5 rounded-lg shadow-xl pointer-events-none transform -translate-x-1/2 transition-all flex items-center gap-2 border border-slate-700"
          style={{ left: `${(points[hoverIndex].x / width) * 100}%` }}
        >
          <span className="font-bold text-amber-400">{points[hoverIndex].pts} / 10 Pts</span>
          <span className="text-slate-400 text-[10px]">· {points[hoverIndex].date}</span>
          {points[hoverIndex].isSundayBonus && (
            <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1 rounded">2x Sunday Bonus</span>
          )}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<StudentTab>('mission');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Selected Submission for Detailed Analysis Modal
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string>('sub_1');
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);

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
  const timerIntervalRef = useRef<any>(null);

  // Vocabulary checklist planned state
  const [plannedWords, setPlannedWords] = useState<Record<string, boolean>>({
    Nuanced: true,
    Leverage: true,
    Synthesize: true,
  });

  // Performance center tab
  const [perfTab, setPerfTab] = useState<'points' | 'skills' | 'history'>('points');

  // Community Feed filter tab
  const [communityFilter, setCommunityFilter] = useState<'all' | 'top' | 'trainer' | 'my'>('all');
  const [newCommentText, setNewCommentText] = useState<Record<string, string>>({});

  // Student Profile State (Strictly isolated to this student)
  const [student] = useState({
    name: 'Rahul Sharma',
    email: 'rahul.s@example.com',
    role: 'STUDENT',
    streak: 14,
    streakFreeze: 2,
    freezeStreakProgress: 5,
    monthlyScore: 840,
    walletBalance: 150.0,
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

  // Today's Daily Mission
  const [todayMission] = useState({
    id: 'task_daily_1',
    category: 'PERSUASIVE PITCH',
    cefrLevel: 'B2 · UPPER INTERMEDIATE',
    title: 'Executive Presentation Opening Pitch',
    prompt:
      'Record a 60-90 second introduction presenting a complex product roadmap to senior stakeholders. Focus on vocal inflection, executive cadence, and structured signposting.',
    bulletPoints: [
      'Hook leadership within the first 15 seconds with a tangible business outcome.',
      'Articulate the architectural advantages and team operational readiness.',
      'Conclude with an unequivocal call-to-action for budget sign-off.',
    ],
    minDuration: 45,
    maxDuration: 90,
    prizePool: 50,
  });

  // ── TENANT-ISOLATED COHORT COMMUNITY SUBMISSIONS (SHINE-9402 only) ──
  const [cohortFeed, setCohortFeed] = useState([
    {
      id: 'feed_1',
      studentId: 'std_aditi',
      studentName: 'Aditi Patel',
      avatar: 'AP',
      isMe: false,
      streak: 18,
      classCode: 'SHINE-9402',
      date: '45m ago',
      duration: '1m 20s',
      overallScore: 9.1,
      fluency: 9.2,
      grammar: 8.9,
      confidence: 9.3,
      vocabulary: 9.0,
      transcript:
        'Good morning, leadership. To accelerate our enterprise trajectory, our roadmap must synthesize cross-functional velocity with rigorous risk mitigation. By leveraging our modular platform, we eliminate technical debt while achieving sustainable scalability.',
      feedback: 'Flawless signposting and executive posture! Used "Synthesize" and "Leveraging" with natural cadence.',
      topVocab: ['Synthesize', 'Leveraging', 'Cross-functional', 'Sustainable scalability'],
      reactions: { claps: 14, fire: 9, heart: 7, star: 5, userReacted: null as string | null },
      comments: [
        {
          id: 'c_1',
          author: 'Ananya Verma',
          isTrainer: true,
          avatar: 'AV',
          timeAgo: '30m ago',
          text: 'Masterclass in vocal pacing, Aditi! Your transition into risk governance was exceptionally crisp.',
        },
        {
          id: 'c_2',
          author: 'Rahul Sharma (You)',
          isTrainer: false,
          avatar: 'RS',
          timeAgo: '15m ago',
          text: 'Inspiring delivery! Really liked how you balanced velocity and risk.',
        },
      ],
    },
    {
      id: 'sub_1',
      studentId: 'std_rahul',
      studentName: 'Rahul Sharma (You)',
      avatar: 'RS',
      isMe: true,
      streak: 14,
      classCode: 'SHINE-9402',
      date: '2h ago',
      duration: '1m 18s',
      overallScore: 8.8,
      fluency: 9.0,
      grammar: 8.5,
      confidence: 9.0,
      vocabulary: 8.8,
      transcript:
        'Good morning, leadership team. Today, I am presenting a nuanced roadmap designed to leverage our digital architecture, streamline operations, and synthesize our product metrics into sustainable growth.',
      feedback: 'Excellent vocal modulation and eye contact. Used "Nuanced" and "Leverage" naturally.',
      topVocab: ['Nuanced', 'Leverage', 'Synthesize', 'Sustainable growth'],
      reactions: { claps: 11, fire: 6, heart: 5, star: 3, userReacted: 'claps' as string | null },
      comments: [
        {
          id: 'c_3',
          author: 'Ananya Verma',
          isTrainer: true,
          avatar: 'AV',
          timeAgo: '1h ago',
          text: 'Great energy today Rahul. Focus on slowing down slightly during the financial sign-off segment.',
        },
      ],
    },
    {
      id: 'feed_3',
      studentId: 'std_kavita',
      studentName: 'Kavita Menon',
      avatar: 'KM',
      isMe: false,
      streak: 12,
      classCode: 'SHINE-9402',
      date: '3h ago',
      duration: '1m 12s',
      overallScore: 8.4,
      fluency: 8.3,
      grammar: 8.6,
      confidence: 8.2,
      vocabulary: 8.5,
      transcript:
        'In reconciling stakeholder requirements with engineering reality, our team will introduce transparent bi-weekly sprints to guarantee predictable feature releases.',
      feedback: 'Clear problem-framing and confident tone. Work on expanding pause length after key transitions.',
      topVocab: ['Reconciling', 'Predictable', 'Transparent sprints'],
      reactions: { claps: 8, fire: 4, heart: 3, star: 2, userReacted: null as string | null },
      comments: [
        {
          id: 'c_4',
          author: 'Aditi Patel',
          isTrainer: false,
          avatar: 'AP',
          timeAgo: '2h ago',
          text: 'Loved the clarity on bi-weekly sprints Kavita! Very convincing.',
        },
      ],
    },
    {
      id: 'feed_4',
      studentId: 'std_vikram',
      studentName: 'Vikram Joshi',
      avatar: 'VJ',
      isMe: false,
      streak: 11,
      classCode: 'SHINE-9402',
      date: '4h ago',
      duration: '1m 05s',
      overallScore: 8.0,
      fluency: 7.9,
      grammar: 8.2,
      confidence: 8.1,
      vocabulary: 7.8,
      transcript:
        'Our priority for the upcoming quarter is optimizing core infrastructure reliability to support double-digit throughput expansion.',
      feedback: 'Solid technical rationale. Try raising pitch inflection slightly at the conclusion.',
      topVocab: ['Throughput', 'Reliability', 'Core infrastructure'],
      reactions: { claps: 6, fire: 3, heart: 2, star: 1, userReacted: null as string | null },
      comments: [],
    },
  ]);

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
      eyeContact: 8.5,
      bodyLanguage: 8.7,
      feedback: 'Strong opening hook. Metaphor regarding "river and currents" was vivid and impactful.',
      transcript:
        'Navigating rapid tech transformations is like steering through turbulent currents; without disciplined agility, the swell overtakes you.',
      grammarCorrections: [],
      vocabStrong: ['Turbulent currents', 'Disciplined agility'],
      vocabUpgrade: [],
      presentationTips: ['Vary your pitch dynamically on metaphors.'],
    },
  ]);

  // Score History for Trajectory Area Chart
  const scoreTrajectory = [
    { session: '#1', pts: 7.4, date: '01 Nov' },
    { session: '#2', pts: 7.8, date: '02 Nov' },
    { session: '#3', pts: 8.1, date: '03 Nov' },
    { session: '#4', pts: 8.2, date: '04 Nov' },
    { session: '#5', pts: 8.8, date: 'Today', isSundayBonus: true },
  ];

  // Classmates in Student's Cohort (Strict Data Isolation)
  const [classmates] = useState([
    { name: 'Aditi Patel', streak: 18, score: 920, avatar: 'AP', prizeBadge: '🥇 1st Place' },
    { name: 'Rahul Sharma (You)', streak: 14, score: 840, avatar: 'RS', isMe: true, prizeBadge: '🥈 2nd Place' },
    { name: 'Kavita Menon', streak: 12, score: 790, avatar: 'KM', prizeBadge: '🥉 3rd Place' },
    { name: 'Vikram Joshi', streak: 11, score: 760, avatar: 'VJ' },
    { name: 'Rohan Deshmukh', streak: 9, score: 680, avatar: 'RD' },
  ]);

  // Wallet Ledger
  const [walletTransactions] = useState([
    { id: 'tx_1', category: 'AWARD_PRIZE', title: 'Top Fluency Cohort Award', amount: 50.0, date: 'Today', type: 'CREDIT' },
    { id: 'tx_2', category: 'STREAK_BONUS', title: '14-Day Streak Milestone Reward', amount: 25.0, date: 'Yesterday', type: 'CREDIT' },
    { id: 'tx_3', category: 'REFERRAL_REWARD', title: 'Friend Enrolled with Code', amount: 5.0, date: '04 Nov 2026', type: 'CREDIT' },
    { id: 'tx_4', category: 'WITHDRAWAL', title: 'Bank UPI Transfer (#9821)', amount: -50.0, date: '01 Nov 2026', type: 'DEBIT' },
  ]);

  // Doubts Desk
  interface DoubtItem {
    id: string;
    subject: string;
    status: string;
    date: string;
    trainerReply?: string;
  }

  const [doubts, setDoubts] = useState<DoubtItem[]>([
    {
      id: 't_1',
      subject: 'Pacing during 60s pitch',
      status: 'RESOLVED',
      date: '04 Nov',
      trainerReply: 'Try pausing for 1.5s after introducing your core thesis before listing bullet points.',
    },
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
              grammar: 8.7,
              vocabulary: 8.9,
              confidence: 9.2,
              eyeContact: 8.8,
              bodyLanguage: 9.0,
              feedback: 'Outstanding structured delivery! High vocal presence and pitch modulation.',
              transcript:
                'Good morning. Our team has successfully architected a resilient pipeline that will accelerate feature velocity while ensuring multi-tenant data isolation.',
              grammarCorrections: [],
              vocabStrong: ['Resilient pipeline', 'Feature velocity', 'Data isolation'],
              vocabUpgrade: [{ word: 'Good work', suggestion: 'Exemplary craftsmanship' }],
              presentationTips: ['Slightly lower chin tilt during opening statement for direct engagement.'],
            };
            setMySubmissions([newSub, ...mySubmissions]);
            setSelectedSubmissionId(newSub.id);
            setUploadProgress(null);
            setRecordedVideoUrl(null);
            setRecordSeconds(0);
            setShowAnalysisModal(true);
          }, 800);
          return 100;
        }
        return p + 25;
      });
    }, 400);
  };

  const speakVocabWord = (word: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(word);
      u.rate = 0.9;
      window.speechSynthesis.speak(u);
    }
  };

  const togglePlannedWord = (word: string) => {
    setPlannedWords((prev) => ({
      ...prev,
      [word]: !prev[word],
    }));
  };

  // Reactions Handler for Cohort Community Feed
  const handleToggleReaction = (feedId: string, reactionType: 'claps' | 'fire' | 'heart' | 'star') => {
    setCohortFeed((prev) =>
      prev.map((item) => {
        if (item.id !== feedId) return item;
        const currentReacted = item.reactions.userReacted;
        const isSame = currentReacted === reactionType;

        return {
          ...item,
          reactions: {
            ...item.reactions,
            [reactionType]: isSame ? item.reactions[reactionType] - 1 : item.reactions[reactionType] + 1,
            userReacted: isSame ? null : reactionType,
          },
        };
      })
    );
  };

  // Add Comment to Cohort Video
  const handleAddComment = (feedId: string) => {
    const text = newCommentText[feedId];
    if (!text || !text.trim()) return;

    setCohortFeed((prev) =>
      prev.map((item) => {
        if (item.id !== feedId) return item;
        return {
          ...item,
          comments: [
            ...item.comments,
            {
              id: `c_${Date.now()}`,
              author: 'Rahul Sharma (You)',
              isTrainer: false,
              avatar: 'RS',
              timeAgo: 'Just now',
              text: text.trim(),
            },
          ],
        };
      })
    );

    setNewCommentText((prev) => ({ ...prev, [feedId]: '' }));
  };

  // Join Class Form
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<JoinClassInput>({
    resolver: zodResolver(joinClassSchema),
  });

  const onJoinClass = async (data: JoinClassInput) => {
    await new Promise((r) => setTimeout(r, 800));
    alert(`Successfully enrolled in class: ${data.classCode}! Your new cohort is ready.`);
    reset();
  };

  const handlePostDoubt = () => {
    if (!newDoubtText.trim()) return;
    setDoubts([
      ...doubts,
      {
        id: `t_${Date.now()}`,
        subject: newDoubtText,
        status: 'OPEN',
        date: 'Today',
      },
    ]);
    setNewDoubtText('');
  };

  // ── STRICT TENANT DATA ISOLATION FILTER ──
  // Only entries that strictly match the student's enrolled class code
  const filteredCohortFeed = useMemo(() => {
    let feed = cohortFeed.filter((item) => item.classCode === student.enrolledClass.classCode);
    if (communityFilter === 'top') {
      feed = feed.filter((item) => item.overallScore >= 8.5);
    } else if (communityFilter === 'trainer') {
      feed = feed.filter((item) => item.comments.some((c) => c.isTrainer));
    } else if (communityFilter === 'my') {
      feed = feed.filter((item) => item.isMe);
    }
    return feed;
  }, [cohortFeed, student.enrolledClass.classCode, communityFilter]);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      {/* TOPBAR */}
      <header className="sticky top-0 z-40 bg-slate-950/90 backdrop-blur-md border-b border-white/10 px-4 sm:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-amber-500 flex items-center justify-center shadow-lg shadow-purple-600/30">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-extrabold text-base tracking-tight text-white">Speak & Shine</span>
              <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest block -mt-1">
                Student Portal
              </span>
            </div>
          </div>
        </div>

        {/* Global Action & Status Badges */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveTab('studio')}
            className="hidden sm:flex items-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs px-3.5 py-2 rounded-xl shadow-md shadow-purple-600/25 transition-all"
          >
            <Video className="w-4 h-4" />
            <span>Launch Studio</span>
          </button>

          <div className="hidden lg:flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl text-xs">
            <Flame className="w-4 h-4 text-amber-400 fill-amber-400" />
            <span className="font-bold text-white">{student.streak} Days Streak</span>
          </div>

          <div className="flex items-center gap-2 pl-2 border-l border-white/10">
            <div className="w-8 h-8 rounded-full bg-purple-600/40 border border-purple-400/30 flex items-center justify-center font-bold text-xs text-purple-200">
              RS
            </div>
            <div className="hidden sm:block text-left">
              <div className="text-xs font-bold text-white">{student.name}</div>
              <div className="text-[10px] text-slate-400">{student.enrolledClass.classCode}</div>
            </div>
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <div className="flex-1 flex overflow-hidden">
        {/* RESPONSIVE PERSISTENT SIDEBAR */}
        <aside
          className={`fixed md:static inset-y-0 left-0 z-30 w-64 bg-slate-950/95 border-r border-white/10 p-4 flex flex-col justify-between transition-transform duration-200 ease-in-out ${
            mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
          }`}
        >
          <div className="space-y-6">
            {/* Student Info Card */}
            <div className="bg-gradient-to-br from-purple-950/60 to-slate-900 border border-purple-500/20 rounded-2xl p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center text-white font-bold text-sm shadow-md">
                  RS
                </div>
                <div>
                  <div className="text-sm font-bold text-white">{student.name}</div>
                  <div className="text-[11px] text-purple-300 font-semibold">{student.enrolledClass.title.slice(0, 22)}...</div>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-purple-500/20 flex items-center justify-between text-[11px] text-slate-300">
                <span className="flex items-center gap-1 font-semibold text-amber-400">
                  <Flame className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  {student.streak} Days
                </span>
                <span className="font-semibold text-emerald-400">
                  ₹{student.walletBalance.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Navigation Tabs (Converted Speech Analysis to Cohort Community) */}
            <nav className="space-y-1">
              {[
                { id: 'mission', label: 'Dashboard & Mission', icon: Flame, badge: 'Live' },
                { id: 'studio', label: 'AI Recording Studio', icon: Video },
                { id: 'community', label: 'Cohort Community', icon: MessageSquare, badge: 'Feed' },
                { id: 'cohort', label: 'My Cohort Roster', icon: Users },
                { id: 'performance', label: 'Fluency & Radar', icon: BarChart3 },
                { id: 'submissions', label: 'My Submissions', icon: FileCheck },
                { id: 'live', label: 'Live Classrooms', icon: Radio },
                { id: 'wallet', label: 'Prize Wallet', icon: Wallet },
                { id: 'doubts', label: 'Doubts Desk', icon: HelpCircle },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id as StudentTab);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                      isActive
                        ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                      <span>{tab.label}</span>
                    </div>
                    {tab.badge && (
                      <span className="text-[10px] bg-amber-400 text-slate-950 font-extrabold px-1.5 py-0.2 rounded-md">
                        {tab.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Sidebar Footer */}
          <div className="pt-4 border-t border-white/10 space-y-2">
            <div className="text-[11px] text-slate-400 px-2 flex items-center justify-between">
              <span>Assigned Coach:</span>
              <strong className="text-white">{student.enrolledClass.trainerName}</strong>
            </div>
            <button
              onClick={() => alert('Signing out of student account...')}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Log Out</span>
            </button>
          </div>
        </aside>

        {/* CONTENT AREA */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-slate-900/60">
          {/* TAB: REDESIGNED STUDENT DASHBOARD & MISSION */}
          {activeTab === 'mission' && (
            <div className="space-y-6 max-w-6xl mx-auto">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-purple-900/40 via-indigo-900/30 to-slate-900 border border-purple-500/20 rounded-3xl p-5 sm:p-6">
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest text-amber-400 flex items-center gap-2 mb-1">
                    <Sparkle className="w-3.5 h-3.5 fill-amber-400" />
                    <span>Executive Speech Program · Active Session</span>
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                    Good Day, {student.name.split(' ')[0]}! 👋
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl leading-relaxed">
                    "Champions don't wait for the perfect moment — they create it with practice. Record your challenge video before midnight IST."
                  </p>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                  <div className="bg-purple-950/80 border border-purple-400/30 px-3.5 py-2 rounded-2xl text-left">
                    <div className="text-[10px] text-purple-300 font-bold uppercase tracking-wider">
                      Batch Code
                    </div>
                    <div className="text-sm font-extrabold text-white">
                      {student.enrolledClass.classCode}
                    </div>
                  </div>
                  <Button
                    onClick={() => setActiveTab('studio')}
                    variant="accent"
                    size="md"
                    className="flex items-center gap-2 shadow-lg shadow-amber-500/20"
                  >
                    <Video className="w-4 h-4" />
                    <span>Record Today's Video</span>
                  </Button>
                </div>
              </div>

              {/* DAILY SPEAKING CHALLENGE HERO CARD */}
              <div className="bg-gradient-to-br from-indigo-950 via-slate-950 to-purple-950 border border-indigo-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

                <div className="relative z-10 space-y-6">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                    <div className="lg:col-span-2 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-extrabold tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/30 px-3 py-1 rounded-full uppercase">
                          {todayMission.category}
                        </span>
                        <span className="text-[11px] font-extrabold tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-3 py-1 rounded-full">
                          {todayMission.cefrLevel}
                        </span>
                        <span className="text-[11px] font-extrabold tracking-wider bg-amber-400 text-slate-950 px-3 py-1 rounded-full flex items-center gap-1 shadow-sm">
                          <Trophy className="w-3.5 h-3.5" />
                          <span>₹{todayMission.prizePool} Cash Prize Pool</span>
                        </span>
                      </div>

                      <h3 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-tight">
                        {todayMission.title}
                      </h3>

                      <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
                        {todayMission.prompt}
                      </p>

                      <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2">
                        <div className="text-xs font-bold uppercase tracking-wider text-purple-300">
                          Key Signposts to Cover:
                        </div>
                        <ul className="space-y-1.5 text-xs text-slate-200">
                          {todayMission.bulletPoints.map((pt, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <span className="w-4 h-4 rounded-full bg-purple-500/30 text-purple-300 flex items-center justify-center font-bold text-[10px] mt-0.5 flex-shrink-0">
                                {i + 1}
                              </span>
                              <span>{pt}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <MidnightCountdownTimer />

                      <div className="bg-slate-900/40 backdrop-blur-md border border-white/10 rounded-2xl p-4 space-y-2 text-white">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                            <Clock className="w-4 h-4 text-purple-400" />
                            <span>Duration Window</span>
                          </span>
                          <span className="font-bold text-amber-400">
                            {todayMission.minDuration}s – {todayMission.maxDuration}s
                          </span>
                        </div>
                        <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden flex">
                          <div className="w-1/3 bg-slate-700" />
                          <div className="w-1/2 bg-gradient-to-r from-emerald-500 to-amber-500" />
                          <div className="w-1/6 bg-rose-500" />
                        </div>
                        <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                          <span>0s</span>
                          <span className="text-emerald-400 font-bold">Min: 45s</span>
                          <span className="text-amber-400 font-bold">Max: 90s</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <AudioPromptWaveform promptText={todayMission.prompt} />

                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2">
                        <Target className="w-4 h-4 text-amber-400" />
                        <span>Target Executive Vocabulary (Check words you plan to speak):</span>
                      </div>
                      <span className="text-[11px] text-slate-400">
                        {Object.values(plannedWords).filter(Boolean).length} of {TARGET_VOCABULARY.length} Planned
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {TARGET_VOCABULARY.map((item) => {
                        const isPlanned = plannedWords[item.word];
                        return (
                          <div
                            key={item.word}
                            onClick={() => togglePlannedWord(item.word)}
                            className={`p-3 rounded-2xl border transition-all cursor-pointer select-none ${
                              isPlanned
                                ? 'bg-purple-950/60 border-purple-400/40 shadow-sm shadow-purple-500/20'
                                : 'bg-white/5 border-white/10 hover:bg-white/10'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <span className="font-extrabold text-sm text-white">{item.word}</span>
                                <span className="text-[9px] font-bold bg-amber-400/20 text-amber-300 px-1.5 py-0.5 rounded">
                                  {item.level}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    speakVocabWord(item.word);
                                  }}
                                  className="p-1 rounded-md text-slate-400 hover:text-amber-300 hover:bg-white/10 transition-colors"
                                  title="Pronounce word"
                                >
                                  <Volume2 className="w-3.5 h-3.5" />
                                </button>
                                <div
                                  className={`w-4 h-4 rounded-md flex items-center justify-center transition-colors ${
                                    isPlanned ? 'bg-purple-600 text-white' : 'border border-slate-500'
                                  }`}
                                >
                                  {isPlanned && <Check className="w-3 h-3 stroke-[3]" />}
                                </div>
                              </div>
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono mb-1">{item.phonetic}</div>
                            <div className="text-xs text-slate-300 leading-snug line-clamp-2">{item.definition}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-white/15 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                      <Button
                        onClick={() => setActiveTab('studio')}
                        variant="accent"
                        size="lg"
                        className="w-full sm:w-auto flex items-center justify-center gap-2.5 shadow-xl shadow-amber-500/25 animate-pulse font-extrabold"
                      >
                        <Video className="w-5 h-5" />
                        <span>Record Challenge Video Now</span>
                      </Button>
                      <Button
                        onClick={() => setActiveTab('community')}
                        variant="outline"
                        size="lg"
                        className="w-full sm:w-auto flex items-center justify-center gap-2 text-white border-white/20 hover:bg-white/10"
                      >
                        <Users className="w-4 h-4 text-purple-300" />
                        <span>View Cohort Submissions</span>
                      </Button>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-slate-300">
                      <Sparkles className="w-4 h-4 text-purple-400" />
                      <span>Instant AI Evaluation & Cohort Peer Feedback</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 4-KPI SUMMARY GRID */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-950/70 border border-white/10 rounded-3xl p-5 space-y-2">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold">
                    <Flame className="w-5 h-5 fill-amber-400 text-amber-400" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 font-medium">Daily Streak</div>
                    <div className="text-2xl font-extrabold text-white">{student.streak} Days</div>
                    <div className="text-[11px] text-amber-400 font-semibold mt-0.5">Top 5% of cohort</div>
                  </div>
                </div>

                <div className="bg-slate-950/70 border border-white/10 rounded-3xl p-5 space-y-2">
                  <div className="w-10 h-10 rounded-2xl bg-purple-500/10 text-purple-400 flex items-center justify-center font-bold">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 font-medium">Freeze Shields</div>
                    <div className="text-2xl font-extrabold text-white">{student.streakFreeze} Active</div>
                    <div className="text-[11px] text-purple-300 font-semibold mt-0.5">Protection active</div>
                  </div>
                </div>

                <div className="bg-slate-950/70 border border-white/10 rounded-3xl p-5 space-y-2">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold">
                    <Trophy className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 font-medium">Monthly Score</div>
                    <div className="text-2xl font-extrabold text-white">{student.monthlyScore} Pts</div>
                    <div className="text-[11px] text-emerald-400 font-semibold mt-0.5">+40 pts vs yesterday</div>
                  </div>
                </div>

                <div className="bg-slate-950/70 border border-white/10 rounded-3xl p-5 space-y-2">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-bold">
                    <Wallet className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 font-medium">Prize Wallet</div>
                    <div className="text-2xl font-extrabold text-white">₹{student.walletBalance.toFixed(2)}</div>
                    <div className="text-[11px] text-indigo-300 font-semibold mt-0.5">Instant UPI withdrawal</div>
                  </div>
                </div>
              </div>

              {/* GAMIFICATION & MILESTONE SPRINT ROADMAP */}
              <div className="bg-slate-950/70 border border-white/10 rounded-3xl p-6 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Award className="w-4 h-4 text-amber-400" />
                      <span>Gamification & Milestone Sprint</span>
                    </div>
                    <h4 className="text-lg font-extrabold text-white mt-0.5">
                      Current Milestone: Two-Week Titan (14 Days) · Next: 21-Day Habit Master
                    </h4>
                  </div>
                  <div className="text-xs text-purple-300 font-semibold bg-purple-950/60 border border-purple-500/30 px-3 py-1 rounded-xl self-start sm:self-auto">
                    Progress: 67% to 21-Day Tier
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {[
                    { days: 3, label: '3d Rookie', icon: '🥉', state: 'unlocked' },
                    { days: 7, label: '7d Warrior', icon: '🥈', state: 'unlocked' },
                    { days: 14, label: '14d Titan', icon: '🔥', state: 'current' },
                    { days: 21, label: '21d Master', icon: '👑', state: 'locked' },
                    { days: 30, label: '30d Legend', icon: '💎', state: 'locked' },
                    { days: 60, label: '60d Champion', icon: '🏆', state: 'locked' },
                  ].map((m) => (
                    <div
                      key={m.days}
                      className={`p-3.5 rounded-2xl border text-center transition-all ${
                        m.state === 'current'
                          ? 'bg-gradient-to-b from-amber-500/20 to-purple-950/80 border-amber-400/60 shadow-lg shadow-amber-500/10'
                          : m.state === 'unlocked'
                          ? 'bg-white/5 border-emerald-500/30'
                          : 'bg-white/5 border-white/10 opacity-60'
                      }`}
                    >
                      <div className="text-2xl mb-1">{m.icon}</div>
                      <div className="text-xs font-extrabold text-white">{m.label}</div>
                      <div className="text-[10px] font-semibold mt-1">
                        {m.state === 'current' && <span className="text-amber-400">🔥 Current Tier</span>}
                        {m.state === 'unlocked' && <span className="text-emerald-400">✓ Unlocked</span>}
                        {m.state === 'locked' && <span className="text-slate-400">🔒 Locked</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* PERFORMANCE CENTER & TRAJECTORY CHARTS */}
              <div className="bg-slate-950/70 border border-white/10 rounded-3xl p-6 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                      <BarChart3 className="w-4 h-4 text-purple-400" />
                      <span>Speaking Trajectory & Performance Center</span>
                    </div>
                    <h4 className="text-lg font-extrabold text-white mt-0.5">
                      Speech Mastery Trends Across Sessions
                    </h4>
                  </div>

                  <div className="flex items-center gap-1 bg-white/5 border border-white/10 p-1 rounded-xl self-start sm:self-auto">
                    {[
                      { id: 'points', label: 'Points Trajectory' },
                      { id: 'skills', label: '4-Skill Breakdown' },
                      { id: 'history', label: 'Past Submissions' },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setPerfTab(tab.id as any)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          perfTab === tab.id
                            ? 'bg-purple-600 text-white shadow-md'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                {perfTab === 'points' && (
                  <div className="space-y-4">
                    <TrajectoryAreaChart scores={scoreTrajectory} />

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                      <div className="bg-emerald-950/30 border border-emerald-500/25 rounded-2xl p-4">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 mb-1">
                          🌟 Top Strength
                        </div>
                        <div className="text-sm font-extrabold text-white">
                          Vocabulary Precision <span className="text-emerald-400 font-bold">(8.8/10)</span>
                        </div>
                        <div className="text-xs text-slate-300 mt-1">
                          Natural integration of advanced business terminology with 0 hesitation.
                        </div>
                      </div>

                      <div className="bg-amber-950/30 border border-amber-500/25 rounded-2xl p-4">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-1">
                          🌱 Area to Nurture
                        </div>
                        <div className="text-sm font-extrabold text-white">
                          Grammar Concord <span className="text-amber-400 font-bold">(8.5/10)</span>
                        </div>
                        <div className="text-xs text-slate-300 mt-1">
                          Watch subject-verb agreement on high-velocity transitional clauses.
                        </div>
                      </div>

                      <div className="bg-purple-950/30 border border-purple-500/25 rounded-2xl p-4">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-purple-400 mb-1">
                          🚀 Recent Momentum
                        </div>
                        <div className="text-sm font-extrabold text-white">
                          3-Session Surge <span className="text-purple-300 font-bold">(+0.6 pts)</span>
                        </div>
                        <div className="text-xs text-slate-300 mt-1">
                          Continuous improvement over 3 consecutive evaluated video sessions.
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {perfTab === 'skills' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      {[
                        { name: 'Speech Fluency & Cadence', score: 9.0, delta: '+0.5', color: 'bg-purple-500' },
                        { name: 'Grammar Accuracy & Syntax', score: 8.5, delta: '+0.3', color: 'bg-emerald-500' },
                        { name: 'Vocabulary Breadth & Lexicon', score: 8.8, delta: '+0.4', color: 'bg-indigo-500' },
                        { name: 'Vocal Confidence & Projection', score: 9.0, delta: '+0.6', color: 'bg-amber-500' },
                        { name: 'Visual Eye Contact & Posture', score: 8.7, delta: '+0.2', color: 'bg-cyan-500' },
                      ].map((s) => (
                        <div key={s.name} className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-white">{s.name}</span>
                            <div className="flex items-center gap-1.5">
                              <span className="font-extrabold text-white">{s.score}/10</span>
                              <span className="text-[10px] text-emerald-400 font-bold">{s.delta}</span>
                            </div>
                          </div>
                          <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${s.color} rounded-full transition-all`}
                              style={{ width: `${(s.score / 10) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col justify-between">
                      <div className="space-y-2">
                        <div className="text-xs font-bold text-purple-300 uppercase tracking-wider">
                          Executive Speech Radar Insights
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">
                          Your overall articulation index is currently at <strong>8.8 / 10</strong>, placing you comfortably in the upper quartile of the <em>Executive Voice & Tone Cohort</em>.
                        </p>
                      </div>
                      <Button
                        onClick={() => {
                          setSelectedSubmissionId('sub_1');
                          setShowAnalysisModal(true);
                        }}
                        variant="primary"
                        size="sm"
                        className="mt-4 self-start"
                      >
                        Open Full AI Report
                      </Button>
                    </div>
                  </div>
                )}

                {perfTab === 'history' && (
                  <div className="space-y-3">
                    {mySubmissions.map((sub) => (
                      <div
                        key={sub.id}
                        className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-purple-600/30 border border-purple-400/30 text-purple-300 flex items-center justify-center font-bold">
                            <Video className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="text-sm font-bold text-white">{sub.taskTitle}</div>
                            <div className="text-xs text-slate-400">
                              {sub.date} · {sub.duration}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className="text-base font-extrabold text-amber-400">
                              {sub.overallScore} / 10
                            </div>
                            <div className="text-[10px] text-emerald-400 font-bold uppercase">
                              {sub.status}
                            </div>
                          </div>
                          <Button
                            onClick={() => {
                              setSelectedSubmissionId(sub.id);
                              setShowAnalysisModal(true);
                            }}
                            variant="outline"
                            size="sm"
                            className="text-white border-white/20 hover:bg-white/10"
                          >
                            View Report
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* TENANT-ISOLATED COHORT LEADERBOARD */}
              <div className="bg-slate-950/70 border border-white/10 rounded-3xl p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-amber-400" />
                      <span>Cohort Leaderboard · Scoped to Batch {student.enrolledClass.classCode}</span>
                    </div>
                    <h4 className="text-lg font-extrabold text-white mt-0.5">
                      {student.enrolledClass.title}
                    </h4>
                  </div>
                  <div className="text-xs text-slate-400">
                    Weekly Cash Prize Pool: <strong className="text-amber-400">₹50 Awarded Every Sunday</strong>
                  </div>
                </div>

                <div className="space-y-2">
                  {classmates.map((c, i) => (
                    <div
                      key={c.name}
                      className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${
                        c.isMe
                          ? 'bg-purple-950/60 border-purple-400/50 shadow-md shadow-purple-500/10'
                          : 'bg-white/5 border-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-6 font-bold text-slate-400 text-sm">{i + 1}</span>
                        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center font-bold text-xs text-white">
                          {c.avatar}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-white flex items-center gap-2">
                            <span>{c.name}</span>
                            {c.isMe && (
                              <span className="text-[10px] bg-purple-500 text-white font-extrabold px-1.5 py-0.5 rounded">
                                YOU
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-amber-400 font-semibold flex items-center gap-1">
                            <Flame className="w-3.5 h-3.5 fill-amber-400" />
                            <span>{c.streak} Days Active Streak</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {c.prizeBadge && (
                          <span className="hidden sm:inline-block text-xs font-bold text-amber-300 bg-amber-400/10 px-2.5 py-1 rounded-lg border border-amber-400/20">
                            {c.prizeBadge}
                          </span>
                        )}
                        <span className="font-extrabold text-white text-sm sm:text-base">
                          {c.score} <span className="text-xs text-slate-400 font-normal">pts</span>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB: COHORT COMMUNITY FEED (CONVERTED FROM SPEECH ANALYSIS TAB) */}
          {activeTab === 'community' && (
            <div className="space-y-6 max-w-4xl mx-auto">
              {/* Community Feed Banner */}
              <div className="bg-gradient-to-r from-purple-950 via-indigo-950 to-slate-950 border border-purple-500/25 rounded-3xl p-6 space-y-4 shadow-xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-extrabold uppercase tracking-widest bg-amber-400 text-slate-950 px-2 py-0.5 rounded">
                        Daily Challenge Feed
                      </span>
                      <span className="text-xs font-bold text-purple-300">
                        {todayMission.category} · {todayMission.cefrLevel}
                      </span>
                    </div>
                    <h3 className="text-2xl font-extrabold text-white">{todayMission.title}</h3>
                  </div>

                  <Button
                    onClick={() => setActiveTab('studio')}
                    variant="accent"
                    size="sm"
                    className="self-start sm:self-auto gap-2 shadow-md shadow-amber-500/20"
                  >
                    <Video className="w-4 h-4" />
                    <span>Submit Your Video</span>
                  </Button>
                </div>

                {/* Strict Data Isolation Indicator */}
                <div className="bg-white/5 border border-purple-500/20 rounded-2xl p-3 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-purple-200">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span>
                      <strong>Strict Cohort Isolation:</strong> Showing only submissions from your enrolled cohort{' '}
                      <span className="text-amber-400 font-bold">{student.enrolledClass.classCode}</span> ({student.enrolledClass.title}).
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-semibold whitespace-nowrap">
                    Coach: {student.enrolledClass.trainerName}
                  </span>
                </div>

                {/* Filter Pills */}
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/10">
                  {[
                    { id: 'all', label: `All Cohort Videos (${cohortFeed.length})` },
                    { id: 'top', label: 'Top Rated (8.5+)' },
                    { id: 'trainer', label: 'Coach Feedback' },
                    { id: 'my', label: 'My Submissions' },
                  ].map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setCommunityFilter(f.id as any)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        communityFilter === f.id
                          ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                          : 'bg-white/5 text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Feed Items (Strictly Scoped) */}
              <div className="space-y-6">
                {filteredCohortFeed.length === 0 ? (
                  <Card className="p-8 text-center space-y-2 bg-slate-950/70 border-white/10">
                    <div className="text-slate-400 text-sm font-semibold">No submissions match this filter.</div>
                    <Button onClick={() => setCommunityFilter('all')} variant="outline" size="sm">
                      Reset Filter
                    </Button>
                  </Card>
                ) : (
                  filteredCohortFeed.map((post) => (
                    <div
                      key={post.id}
                      className={`bg-slate-950/80 border rounded-3xl p-6 space-y-4 shadow-xl transition-all ${
                        post.isMe ? 'border-purple-400/40 ring-1 ring-purple-500/20' : 'border-white/10'
                      }`}
                    >
                      {/* Author Header */}
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-purple-700 to-indigo-600 text-white font-black text-sm flex items-center justify-center shadow-md">
                            {post.avatar}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-sm sm:text-base text-white">
                                {post.studentName}
                              </span>
                              {post.isMe && (
                                <span className="text-[10px] bg-purple-500 text-white font-extrabold px-1.5 py-0.5 rounded">
                                  YOU
                                </span>
                              )}
                              <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/20 flex items-center gap-1">
                                <Flame className="w-3 h-3 fill-amber-400" />
                                <span>{post.streak}d streak</span>
                              </span>
                            </div>
                            <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                              <span>{post.date}</span>
                              <span>·</span>
                              <span className="font-mono text-purple-300">{post.duration}</span>
                              <span>·</span>
                              <span className="text-[10px] bg-white/5 px-2 py-0.2 rounded border border-white/10">
                                {post.classCode}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Overall Score Chip */}
                        <div className="text-right">
                          <div className="text-2xl font-black text-amber-400">{post.overallScore}</div>
                          <div className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-400">
                            AI Score
                          </div>
                        </div>
                      </div>

                      {/* 4-Metric Score Pill Bar */}
                      <div className="grid grid-cols-4 gap-2 pt-1">
                        {[
                          { label: 'Fluency', score: post.fluency, color: 'text-purple-400' },
                          { label: 'Grammar', score: post.grammar, color: 'text-emerald-400' },
                          { label: 'Confidence', score: post.confidence, color: 'text-amber-400' },
                          { label: 'Vocabulary', score: post.vocabulary, color: 'text-indigo-400' },
                        ].map((m) => (
                          <div
                            key={m.label}
                            className="bg-white/5 border border-white/10 rounded-xl p-2 text-center"
                          >
                            <div className="text-[10px] text-slate-400 font-semibold">{m.label}</div>
                            <div className={`text-xs sm:text-sm font-extrabold ${m.color}`}>
                              {m.score}/10
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Video Player Frame with Watermark */}
                      <div className="relative aspect-video bg-black/60 rounded-2xl overflow-hidden border border-white/10 flex items-center justify-center group">
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 pointer-events-none" />

                        {/* Watermark for privacy protection */}
                        <div className="absolute top-3 left-3 text-[10px] font-mono font-bold text-white/50 bg-black/50 px-2.5 py-1 rounded-md backdrop-blur-sm pointer-events-none">
                          🔒 {post.classCode} · {post.studentName} · 24h Ephemeral
                        </div>

                        <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur-md border border-white/25 flex items-center justify-center text-white cursor-pointer group-hover:scale-110 transition-transform shadow-xl">
                          <Play className="w-6 h-6 fill-white ml-0.5" />
                        </div>

                        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-xs text-white pointer-events-none">
                          <span className="font-semibold">{todayMission.title}</span>
                          <span className="font-mono text-purple-300 bg-black/60 px-2 py-0.5 rounded">
                            {post.duration}
                          </span>
                        </div>
                      </div>

                      {/* Speech Excerpt */}
                      <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2">
                        <div className="text-xs font-bold uppercase tracking-wider text-purple-300">
                          Speech Excerpt:
                        </div>
                        <p className="text-xs sm:text-sm text-slate-200 italic leading-relaxed">
                          "{post.transcript}"
                        </p>
                      </div>

                      {/* Top Vocabulary Tags & AI Feedback */}
                      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] font-bold text-slate-400">Used Vocab:</span>
                          {post.topVocab.map((w) => (
                            <span
                              key={w}
                              className="text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-md"
                            >
                              ⚡ {w}
                            </span>
                          ))}
                        </div>

                        {/* Button to open speech analysis report modal */}
                        <button
                          onClick={() => {
                            setSelectedSubmissionId(post.id === 'feed_1' ? 'sub_1' : post.id);
                            setShowAnalysisModal(true);
                          }}
                          className="text-xs font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 underline underline-offset-4"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>View Full AI Analysis Report</span>
                        </button>
                      </div>

                      {/* Interactive Reactions Bar (👏, 🔥, ❤️, 🌟) */}
                      <div className="flex items-center gap-2 pt-2 border-t border-white/10">
                        {[
                          { key: 'claps', label: '👏', count: post.reactions.claps },
                          { key: 'fire', label: '🔥', count: post.reactions.fire },
                          { key: 'heart', label: '❤️', count: post.reactions.heart },
                          { key: 'star', label: '🌟', count: post.reactions.star },
                        ].map((rx) => {
                          const isActive = post.reactions.userReacted === rx.key;
                          return (
                            <button
                              key={rx.key}
                              onClick={() => handleToggleReaction(post.id, rx.key as any)}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                isActive
                                  ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30 scale-105'
                                  : 'bg-white/5 text-slate-300 hover:bg-white/10'
                              }`}
                            >
                              <span>{rx.label}</span>
                              <span className="font-mono text-[11px]">{rx.count}</span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Coach & Peer Comments */}
                      <div className="space-y-2 pt-2 border-t border-white/10">
                        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                          Cohort Discussion & Coach Feedback ({post.comments.length})
                        </div>

                        {post.comments.map((cm) => (
                          <div
                            key={cm.id}
                            className={`p-3 rounded-xl border text-xs space-y-1 ${
                              cm.isTrainer
                                ? 'bg-purple-950/40 border-purple-500/30'
                                : 'bg-white/5 border-white/10'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-white">{cm.author}</span>
                                {cm.isTrainer && (
                                  <span className="text-[9px] font-extrabold uppercase tracking-wider bg-amber-400 text-slate-950 px-1.5 py-0.2 rounded">
                                    🎓 Coach
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-400">{cm.timeAgo}</span>
                            </div>
                            <p className="text-slate-300 leading-relaxed">{cm.text}</p>
                          </div>
                        ))}

                        {/* Add Peer Encouragement Comment */}
                        <div className="flex gap-2 pt-2">
                          <input
                            value={newCommentText[post.id] || ''}
                            onChange={(e) =>
                              setNewCommentText((prev) => ({ ...prev, [post.id]: e.target.value }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleAddComment(post.id);
                            }}
                            placeholder="Add encouragement or constructive feedback..."
                            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-purple-400"
                          />
                          <Button
                            onClick={() => handleAddComment(post.id)}
                            variant="primary"
                            size="sm"
                            className="px-3"
                          >
                            <Send className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB: AI RECORDING STUDIO */}
          {activeTab === 'studio' && (
            <div className="space-y-6 max-w-4xl mx-auto">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <h3 className="text-2xl font-extrabold text-white">AI Video Recording Studio</h3>
                  <p className="text-xs text-slate-400">
                    Live camera feed with real-time background blur and RNNoise filtering.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => setBackgroundBlur(!backgroundBlur)}
                    variant="outline"
                    size="sm"
                    className={`gap-1.5 ${backgroundBlur ? 'bg-purple-950 text-purple-300 border-purple-500/40' : 'text-slate-400'}`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Blur: {backgroundBlur ? 'ON' : 'OFF'}</span>
                  </Button>
                  <Button
                    onClick={() => setNoiseCancellation(!noiseCancellation)}
                    variant="outline"
                    size="sm"
                    className={`gap-1.5 ${noiseCancellation ? 'bg-purple-950 text-purple-300 border-purple-500/40' : 'text-slate-400'}`}
                  >
                    <Mic className="w-3.5 h-3.5" />
                    <span>RNNoise: {noiseCancellation ? 'ON' : 'OFF'}</span>
                  </Button>
                </div>
              </div>

              <div className="relative aspect-video bg-slate-950 rounded-3xl overflow-hidden border border-white/10 shadow-2xl flex items-center justify-center">
                <video
                  ref={videoPreviewRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover transition-all ${
                    cameraActive ? 'block' : 'hidden'
                  } ${backgroundBlur ? 'backdrop-blur-md' : ''}`}
                />

                {!cameraActive && !recordedVideoUrl && (
                  <div className="text-center p-8 space-y-4">
                    <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-slate-400">
                      <Video className="w-8 h-8" />
                    </div>
                    <div>
                      <h4 className="text-base font-bold text-white">Camera Offline</h4>
                      <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                        Click Initialize Camera below to start your WebRTC camera stream.
                      </p>
                    </div>
                    <Button onClick={startCamera} variant="primary" size="md">
                      Initialize Camera
                    </Button>
                  </div>
                )}

                {isRecording && (
                  <div className="absolute top-4 left-4 flex items-center gap-3 bg-slate-950/80 backdrop-blur-md border border-white/15 px-3 py-1.5 rounded-full shadow-lg">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
                    <span className="text-xs font-mono font-bold text-white">
                      {Math.floor(recordSeconds / 60)}:{(recordSeconds % 60).toString().padStart(2, '0')}
                    </span>
                    <span className="text-[10px] text-slate-400 font-semibold">
                      (Min: {todayMission.minDuration}s / Max: {todayMission.maxDuration}s)
                    </span>
                  </div>
                )}

                {uploadProgress !== null && (
                  <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-6 space-y-4">
                    <UploadCloud className="w-12 h-12 text-purple-400 animate-bounce" />
                    <div className="text-center space-y-1">
                      <div className="font-extrabold text-white text-base">Uploading to Cloudflare R2...</div>
                      <div className="text-xs text-slate-400">Dispatching to Groq & Whisper AI pipeline</div>
                    </div>
                    <div className="w-64 h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-purple-500 to-amber-500 transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                    <div className="text-xs font-mono text-purple-300">{uploadProgress}%</div>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-slate-950/80 border border-white/10 rounded-2xl">
                <div className="flex items-center gap-3">
                  {!isRecording ? (
                    <Button
                      onClick={startRecording}
                      variant="accent"
                      size="md"
                      className="gap-2 shadow-lg shadow-amber-500/20"
                    >
                      <Video className="w-4 h-4" />
                      <span>Start Recording</span>
                    </Button>
                  ) : (
                    <Button onClick={stopRecording} variant="danger" size="md" className="gap-2 animate-pulse">
                      <Square className="w-4 h-4" />
                      <span>Stop & Review</span>
                    </Button>
                  )}

                  {cameraActive && (
                    <Button onClick={stopCamera} variant="outline" size="md">
                      Stop Camera
                    </Button>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  {recordedVideoUrl && (
                    <Button
                      onClick={handleUploadSubmit}
                      variant="primary"
                      size="md"
                      className="gap-2 shadow-lg shadow-purple-600/30"
                    >
                      <UploadCloud className="w-4 h-4" />
                      <span>Submit for AI Analysis</span>
                    </Button>
                  )}

                  <label className="cursor-pointer bg-white/5 hover:bg-white/10 border border-white/15 px-4 py-2 rounded-xl text-xs font-bold text-white transition-all flex items-center gap-2">
                    <UploadCloud className="w-4 h-4 text-slate-400" />
                    <span>Upload Video File</span>
                    <input
                      type="file"
                      accept="video/mp4,video/webm"
                      className="hidden"
                      onChange={() => {
                        setRecordedVideoUrl('blob:uploaded-video.mp4');
                        setRecordSeconds(65);
                        alert('Video file selected! Ready for submission.');
                      }}
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* TAB: MY COHORT ROSTER */}
          {activeTab === 'cohort' && (
            <div className="space-y-6 max-w-4xl mx-auto">
              <Card className="p-6 bg-slate-950/70 border-white/10 space-y-6">
                <div>
                  <Badge variant="info" className="mb-2">Your Enrolled Batch</Badge>
                  <h3 className="text-xl font-bold text-white">{student.enrolledClass.title}</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Coach: <strong className="text-white">{student.enrolledClass.trainerName}</strong> ({student.enrolledClass.trainerTitle})
                  </p>
                </div>

                <div className="space-y-3">
                  <h4 className="font-bold text-white text-sm">Classmate Roster (Scoped strictly to this batch)</h4>
                  <div className="space-y-2">
                    {classmates.map((c) => (
                      <div key={c.name} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-purple-600/30 text-purple-200 font-bold text-xs flex items-center justify-center">
                            {c.avatar}
                          </div>
                          <div>
                            <div className="text-sm font-bold text-white">{c.name}</div>
                            <div className="text-xs text-amber-400">{c.streak} Days Streak</div>
                          </div>
                        </div>
                        <span className="font-extrabold text-white text-sm">{c.score} pts</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>

              <Card className="p-6 bg-slate-950/70 border-white/10 space-y-4">
                <h4 className="font-bold text-white text-sm">Switch or Join Another Class</h4>
                <form onSubmit={handleSubmit(onJoinClass)} className="flex gap-3">
                  <input
                    {...register('classCode')}
                    placeholder="Enter Class Code (e.g. SHINE-7821)"
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs text-white"
                  />
                  <Button type="submit" variant="primary" size="sm" disabled={isSubmitting}>
                    {isSubmitting ? 'Joining...' : 'Join Class'}
                  </Button>
                </form>
              </Card>
            </div>
          )}

          {/* TAB: FLUENCY & RADAR */}
          {activeTab === 'performance' && (
            <div className="space-y-6 max-w-4xl mx-auto">
              <Card className="p-6 bg-slate-950/70 border-white/10 space-y-4">
                <h3 className="text-lg font-bold text-white">Fluency & Delivery Radar</h3>
                <TrajectoryAreaChart scores={scoreTrajectory} />
              </Card>
            </div>
          )}

          {/* TAB: MY SUBMISSIONS */}
          {activeTab === 'submissions' && (
            <div className="space-y-4 max-w-4xl mx-auto">
              <h3 className="text-xl font-bold text-white">My Evaluated Video Submissions</h3>
              <div className="space-y-3">
                {mySubmissions.map((sub) => (
                  <div
                    key={sub.id}
                    className="bg-slate-950/70 border border-white/10 rounded-2xl p-4 flex items-center justify-between gap-4"
                  >
                    <div>
                      <div className="text-sm font-bold text-white">{sub.taskTitle}</div>
                      <div className="text-xs text-slate-400">{sub.date} · {sub.duration}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-base font-extrabold text-amber-400">{sub.overallScore}/10</div>
                      <Button
                        onClick={() => {
                          setSelectedSubmissionId(sub.id);
                          setShowAnalysisModal(true);
                        }}
                        variant="outline"
                        size="sm"
                      >
                        View Full Report
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB: LIVE CLASSROOMS */}
          {activeTab === 'live' && (
            <Card className="p-8 text-center space-y-4 max-w-2xl mx-auto bg-slate-950/70 border-white/10">
              <div className="w-16 h-16 rounded-2xl bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto">
                <Radio className="w-8 h-8 animate-pulse" />
              </div>
              <h3 className="text-xl font-bold text-white">Live Classroom Portal</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Real-time LiveKit WebRTC cohort room. Audio-only and video speaking rooms with your coach.
              </p>
              <Button
                onClick={() => alert('Connecting to LiveKit Room: SHINE-9402 via LiveKit token...')}
                variant="accent"
                size="md"
              >
                Join Cohort Room
              </Button>
            </Card>
          )}

          {/* TAB: WALLET & PRIZES */}
          {activeTab === 'wallet' && (
            <div className="space-y-6 max-w-4xl mx-auto">
              <div className="bg-gradient-to-r from-emerald-950 to-teal-900 border border-emerald-500/30 rounded-3xl p-6 text-white flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
                <div>
                  <div className="text-xs font-bold text-emerald-300 uppercase tracking-widest">
                    Available Balance
                  </div>
                  <div className="text-3xl font-extrabold mt-1">₹{student.walletBalance.toFixed(2)}</div>
                  <div className="text-xs text-emerald-200 mt-1">
                    Earned through daily streak milestones & cohort awards
                  </div>
                </div>
                <Button
                  onClick={() => alert('Initiating instant UPI transfer to your linked VPA...')}
                  variant="accent"
                  size="md"
                >
                  Withdraw to UPI
                </Button>
              </div>

              <Card className="p-6 bg-slate-950/70 border-white/10 space-y-4">
                <h4 className="font-bold text-white text-sm">Reward Ledger</h4>
                <div className="space-y-2">
                  {walletTransactions.map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 text-xs">
                      <div>
                        <div className="font-bold text-white">{tx.title}</div>
                        <div className="text-[10px] text-slate-400">{tx.date}</div>
                      </div>
                      <span className={`font-mono font-bold ${tx.type === 'CREDIT' ? 'text-emerald-400' : 'text-slate-400'}`}>
                        {tx.type === 'CREDIT' ? '+' : ''}₹{Math.abs(tx.amount).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {/* TAB: DOUBTS DESK */}
          {activeTab === 'doubts' && (
            <div className="space-y-6 max-w-4xl mx-auto">
              <Card className="p-6 bg-slate-950/70 border-white/10 space-y-4">
                <h4 className="font-bold text-white text-sm">Ask Coach {student.enrolledClass.trainerName}</h4>
                <div className="flex gap-3">
                  <input
                    value={newDoubtText}
                    onChange={(e) => setNewDoubtText(e.target.value)}
                    placeholder="e.g. How should I pace my breathing during the 60s pitch?"
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs text-white"
                  />
                  <Button onClick={handlePostDoubt} variant="primary" size="sm">
                    Submit Doubt
                  </Button>
                </div>

                <div className="space-y-3 pt-3">
                  {doubts.map((d) => (
                    <div key={d.id} className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-white">{d.subject}</span>
                        <span className="text-[10px] text-emerald-400 font-bold">{d.status}</span>
                      </div>
                      {d.trainerReply && (
                        <div className="text-xs text-slate-300 bg-purple-950/40 border border-purple-500/20 p-3 rounded-lg">
                          <strong className="text-purple-300">Coach Reply:</strong> {d.trainerReply}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}
        </main>
      </div>

      {/* ── SPEECH ANALYSIS REPORT MODAL (Accessible from anywhere) ── */}
      {showAnalysisModal && (
        <div
          onClick={() => setShowAnalysisModal(false)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-950 border border-purple-500/30 rounded-3xl max-w-3xl w-full p-6 sm:p-8 space-y-6 shadow-2xl relative max-h-[90vh] overflow-y-auto"
          >
            {/* Close Button */}
            <button
              onClick={() => setShowAnalysisModal(false)}
              className="absolute top-6 right-6 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header */}
            <div className="space-y-1">
              <Badge variant="info" className="mb-1">
                AI Speech Evaluation Report
              </Badge>
              <h3 className="text-2xl font-extrabold text-white">{activeReport.taskTitle}</h3>
              <p className="text-xs text-slate-400">
                Recorded {activeReport.date} · Duration: {activeReport.duration} · Scoped to Batch {student.enrolledClass.classCode}
              </p>
            </div>

            {/* Score Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="p-4 bg-white/5 border-white/10 text-white space-y-1 text-center">
                <div className="text-[11px] text-slate-400 font-bold uppercase">Fluency</div>
                <div className="text-2xl font-black text-purple-400">{activeReport.fluency}/10</div>
              </Card>
              <Card className="p-4 bg-white/5 border-white/10 text-white space-y-1 text-center">
                <div className="text-[11px] text-slate-400 font-bold uppercase">Grammar</div>
                <div className="text-2xl font-black text-emerald-400">{activeReport.grammar}/10</div>
              </Card>
              <Card className="p-4 bg-white/5 border-white/10 text-white space-y-1 text-center">
                <div className="text-[11px] text-slate-400 font-bold uppercase">Vocabulary</div>
                <div className="text-2xl font-black text-amber-400">{activeReport.vocabulary}/10</div>
              </Card>
              <Card className="p-4 bg-white/5 border-white/10 text-white space-y-1 text-center">
                <div className="text-[11px] text-slate-400 font-bold uppercase">Visual Presence</div>
                <div className="text-2xl font-black text-indigo-400">{activeReport.eyeContact}/10</div>
              </Card>
            </div>

            {/* Speech Transcript */}
            <Card className="p-5 bg-white/5 border-white/10 space-y-2">
              <h4 className="text-xs font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-purple-400" />
                <span>Speech Transcript</span>
              </h4>
              <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-mono bg-black/40 p-4 rounded-xl border border-white/10">
                "{activeReport.transcript}"
              </p>
            </Card>

            {/* Grammar Enhancements */}
            <Card className="p-5 bg-white/5 border-white/10 space-y-2">
              <h4 className="text-xs font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Grammar Enhancements</span>
              </h4>
              {activeReport.grammarCorrections && activeReport.grammarCorrections.length > 0 ? (
                <div className="space-y-2">
                  {activeReport.grammarCorrections.map((gc, i) => (
                    <div key={i} className="bg-black/30 p-3 rounded-xl border border-white/10 text-xs space-y-1">
                      <div className="text-rose-400 line-through">✗ {gc.original}</div>
                      <div className="text-emerald-400 font-bold">✓ {gc.correction}</div>
                      <div className="text-[10px] text-slate-400 font-mono">Rule: {gc.rule}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-emerald-400 font-semibold">
                  ✓ Clean delivery! No high-severity grammatical errors detected.
                </p>
              )}
            </Card>

            {/* Coach's Delivery Advice */}
            <Card className="p-5 bg-white/5 border-white/10 space-y-2">
              <h4 className="text-xs font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Coach Ananya's Delivery Advice</span>
              </h4>
              <ul className="space-y-1.5 text-xs text-slate-300">
                {activeReport.presentationTips.map((tip, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-amber-400 font-bold">⚡</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </Card>

            {/* Modal Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <Button onClick={() => setShowAnalysisModal(false)} variant="outline" size="md">
                Close Report
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
