/**
 * @speak-shine/shared-types
 * Domain contracts, enums, and data interfaces for Speak & Shine V2
 */

// ── User & Role Entities ─────────────────────────────────────────────────────

export enum Role {
  ADMIN = 'ADMIN',
  TRAINER = 'TRAINER',
  STUDENT = 'STUDENT',
}

export enum TrainerApprovalStatus {
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  ACTIVE = 'ACTIVE',
  REJECTED = 'REJECTED',
  SUSPENDED = 'SUSPENDED',
}

export interface UserSummary {
  id: string;
  email: string;
  phone?: string;
  name: string;
  role: Role;
  avatarUrl?: string;
  isActive: boolean;
  createdAt: string;
}

export interface StudentProfileSummary extends UserSummary {
  role: Role.STUDENT;
  classId?: string;
  trainerId?: string;
  streak: number;
  streakFreeze: number;
  monthlyScore: number;
  walletBalance: number;
  earnedBadges: string[];
}

export interface TrainerProfileSummary extends UserSummary {
  role: Role.TRAINER;
  approvalStatus: TrainerApprovalStatus;
  bio?: string;
  qualifications?: string[];
  activeClassCount: number;
  totalStudentsTaught: number;
  walletBalance: number;
}

// ── Class & Batch Entities ───────────────────────────────────────────────────

export enum ClassStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  ARCHIVED = 'ARCHIVED',
}

export interface ClassSummary {
  id: string;
  title: string;
  description?: string;
  classCode: string; // e.g. "SHINE-8092"
  trainerId: string;
  trainerName?: string;
  status: ClassStatus;
  studentCount: number;
  startDate?: string;
  endDate?: string;
  createdAt: string;
}

export interface ClassRosterStudent {
  studentId: string;
  name: string;
  email: string;
  phone?: string;
  joinedAt: string;
  streak: number;
  monthlyScore: number;
  totalSubmissions: number;
  lastActiveAt?: string;
}

// ── Task & Challenge Entities ────────────────────────────────────────────────

export enum TaskType {
  DAILY = 'DAILY',
  STORY = 'STORY',
  PICTURE = 'PICTURE',
  REFLECTION = 'REFLECTION',
  MONTHLY_GOALS = 'MONTHLY_GOALS',
  MONTHLY_REFLECTION = 'MONTHLY_REFLECTION',
}

export enum TaskSubmissionStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export interface TaskSummary {
  id: string;
  classId: string;
  trainerId: string;
  title: string;
  description: string;
  type: TaskType;
  vocabularyChallengeWords?: string[]; // 5 target words
  referenceImageUrl?: string;          // For Picture Description
  storyPrompt?: string;               // For Story Narration
  minDurationSeconds: number;
  maxDurationSeconds: number;
  prizePool?: number;                 // Optional cash reward in INR
  dueDate: string;
  createdAt: string;
}

// ── Video Analysis & AI Feedback ─────────────────────────────────────────────

export interface GrammarErrorFeedback {
  original: string;
  correction: string;
  rule: string;
}

export interface VideoAcousticStats {
  durationSeconds: number;
  wpm: number;
  fillerWords: Record<string, number>;
  fillerTotal: number;
  pauses: number;
  wordCount: number;
  cefrLevel: {
    level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
    description: string;
  };
  rhythm: {
    speechRatio: number;
    rushesAtStart: boolean;
    rushesAtEnd: boolean;
    paceConsistency: number;
  };
}

export interface VideoReportAnalysis {
  scores: {
    fluency: number;         // 0 - 10
    grammar: number;         // 0 - 10
    confidence: number;      // 0 - 10
    vocabulary: number;      // 0 - 10
    coherence: number;       // 0 - 10
    topicRelevance: number;  // 0 - 10
    eyeContact: number;      // 0 - 10
    bodyLanguage: number;    // 0 - 10
    facialExpression: number;// 0 - 10
    overallPresence: number; // 0 - 10
  };
  transcription: string;
  overallComment: string;
  strongPoints: string[];
  suggestions: string[];
  grammarErrors: GrammarErrorFeedback[];
  vocabularyHighlights: {
    strong: string[];
    weak: string[];
  };
  vocabularyChallenge?: {
    score: number;           // 0 - 10
    wordsUsed: string[];     // target words correctly utilized
  };
  stats: VideoAcousticStats;
  compositeScore: number;    // 0 - 100
}

export interface VideoReportSummary {
  id: string;
  userId: string;
  taskId?: string;
  classId?: string;
  videoUrl?: string;
  videoDurationSeconds: number;
  status: TaskSubmissionStatus;
  analysis?: VideoReportAnalysis;
  submittedAt: string;
}

// ── Wallet & Payment Entities ────────────────────────────────────────────────

export enum TransactionType {
  CREDIT = 'CREDIT',
  DEBIT = 'DEBIT',
}

export enum TransactionCategory {
  CASH_PRIZE = 'CASH_PRIZE',
  REFERRAL_BONUS = 'REFERRAL_BONUS',
  WITHDRAWAL = 'WITHDRAWAL',
  CLASS_FEE = 'CLASS_FEE',
  MISSED_DAY_FINE = 'MISSED_DAY_FINE',
}

export enum TransactionStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED',
}

export interface WalletTransactionSummary {
  id: string;
  userId: string;
  type: TransactionType;
  category: TransactionCategory;
  amount: number;
  reason: string;
  balanceAfter: number;
  status: TransactionStatus;
  createdAt: string;
}

// ── Live Sessions (LiveKit) ──────────────────────────────────────────────────

export enum LiveSessionStatus {
  SCHEDULED = 'SCHEDULED',
  LIVE = 'LIVE',
  ENDED = 'ENDED',
}

export interface LiveSessionSummary {
  id: string;
  classId: string;
  trainerId: string;
  roomName: string;
  title: string;
  status: LiveSessionStatus;
  scheduledAt: string;
  startedAt?: string;
  endedAt?: string;
  attendeeCount: number;
}

// ── Support / Help Desk ──────────────────────────────────────────────────────

export enum TicketStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
}

export enum TicketPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export interface HelpTicketSummary {
  id: string;
  ticketNumber: string;
  creatorId: string;
  creatorName: string;
  creatorRole: Role;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string;
  updatedAt: string;
}

// ── API Response Envelope ────────────────────────────────────────────────────

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data: T;
  timestamp: string;
}
