import { z } from 'zod';

// ── Auth Schemas ─────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  identifier: z
    .string()
    .min(3, 'Phone or email must be at least 3 characters')
    .max(100, 'Identifier is too long'),
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters')
    .max(100, 'Password is too long'),
});

export const studentRegisterSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(50, 'Name cannot exceed 50 characters')
    .trim(),
  email: z
    .string()
    .email('Please enter a valid email address')
    .toLowerCase()
    .trim(),
  phone: z
    .string()
    .regex(/^[0-9+\-\s]{8,15}$/, 'Please enter a valid phone number')
    .optional(),
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters')
    .max(100, 'Password is too long'),
  classCode: z
    .string()
    .min(4, 'Class code must be at least 4 characters')
    .max(20, 'Invalid class code format')
    .toUpperCase()
    .trim()
    .optional(),
  referralCode: z
    .string()
    .max(20, 'Invalid referral code')
    .optional(),
});

export const trainerRegisterSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(50, 'Name cannot exceed 50 characters')
    .trim(),
  email: z
    .string()
    .email('Please enter a valid email address')
    .toLowerCase()
    .trim(),
  phone: z
    .string()
    .regex(/^[0-9+\-\s]{8,15}$/, 'Please enter a valid phone number'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password is too long'),
  bio: z
    .string()
    .max(500, 'Bio cannot exceed 500 characters')
    .optional(),
  qualifications: z
    .array(z.string().trim().min(2))
    .min(1, 'Please provide at least one qualification/experience summary'),
});

export const forgotPasswordSchema = z.object({
  identifier: z
    .string()
    .min(3, 'Please enter your registered email or phone')
    .trim(),
});

export const resetPasswordSchema = z.object({
  identifier: z
    .string()
    .min(3, 'Please enter your registered email or phone')
    .trim(),
  otp: z
    .string()
    .length(6, 'OTP must be exactly 6 digits')
    .regex(/^\d+$/, 'OTP must contain numbers only'),
  newPassword: z
    .string()
    .min(6, 'New password must be at least 6 characters')
    .max(100, 'Password is too long'),
});

// ── Class Schemas ────────────────────────────────────────────────────────────

export const createClassSchema = z.object({
  title: z
    .string()
    .min(3, 'Class title must be at least 3 characters')
    .max(100, 'Class title cannot exceed 100 characters')
    .trim(),
  description: z
    .string()
    .max(500, 'Description cannot exceed 500 characters')
    .optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export const updateClassSchema = createClassSchema.partial().extend({
  status: z.enum(['ACTIVE', 'COMPLETED', 'ARCHIVED']).optional(),
});

export const joinClassSchema = z.object({
  classCode: z
    .string()
    .min(4, 'Class code is too short')
    .max(20, 'Class code is too long')
    .toUpperCase()
    .trim(),
});

export const preEnrollStudentSchema = z.object({
  name: z
    .string()
    .min(2, 'Student name must be at least 2 characters')
    .max(50, 'Student name cannot exceed 50 characters')
    .trim(),
  email: z
    .string()
    .email('Please enter a valid email address')
    .toLowerCase()
    .trim(),
  phone: z
    .string()
    .regex(/^[0-9+\-\s]{8,15}$/, 'Please enter a valid phone number')
    .optional(),
});

// ── Task Schemas ─────────────────────────────────────────────────────────────

export const createTaskSchema = z.object({
  classId: z.string().min(1, 'Class ID is required'),
  title: z
    .string()
    .min(3, 'Task title must be at least 3 characters')
    .max(120, 'Title cannot exceed 120 characters')
    .trim(),
  description: z
    .string()
    .min(10, 'Task description must provide clear guidelines')
    .max(2000, 'Description cannot exceed 2000 characters'),
  type: z.enum([
    'DAILY',
    'STORY',
    'PICTURE',
    'REFLECTION',
    'MONTHLY_GOALS',
    'MONTHLY_REFLECTION',
  ]),
  vocabularyChallengeWords: z
    .array(z.string().trim().min(2))
    .max(5, 'Maximum of 5 vocabulary challenge words')
    .optional(),
  referenceImageUrl: z.string().url().optional(),
  storyPrompt: z.string().max(1000).optional(),
  minDurationSeconds: z.number().int().min(15).max(300).default(30),
  maxDurationSeconds: z.number().int().min(30).max(600).default(120),
  prizePool: z.number().min(0).max(50000).optional(),
  dueDate: z.string().datetime(),
});

// ── Wallet & Prize Schemas ───────────────────────────────────────────────────

export const awardPrizeSchema = z.object({
  studentId: z.string().min(1, 'Student ID is required'),
  classId: z.string().min(1, 'Class ID is required'),
  taskId: z.string().optional(),
  amount: z.number().positive('Prize amount must be greater than zero'),
  reason: z.string().min(3, 'Reason for reward is required').max(200),
});

export const withdrawRequestSchema = z.object({
  amount: z.number().positive('Withdrawal amount must be greater than zero'),
  payoutMethod: z.enum(['UPI', 'BANK_TRANSFER']),
  payoutDetails: z.object({
    upiId: z.string().optional(),
    accountNumber: z.string().optional(),
    ifscCode: z.string().optional(),
    accountHolderName: z.string().optional(),
  }),
});

// ── Admin Governance Schemas ─────────────────────────────────────────────────

export const trainerApprovalSchema = z.object({
  status: z.enum(['ACTIVE', 'REJECTED', 'SUSPENDED']),
  reviewNotes: z.string().max(500).optional(),
});

// ── Ticket Schemas ───────────────────────────────────────────────────────────

export const createTicketSchema = z.object({
  subject: z.string().min(5).max(150).trim(),
  category: z.enum(['PAYMENT', 'VIDEO_ANALYSIS', 'CLASS_ACCESS', 'BUG', 'OTHER']),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
  message: z.string().min(10).max(2000).trim(),
});

// Inferred TypeScript Types
export type LoginInput = z.infer<typeof loginSchema>;
export type StudentRegisterInput = z.infer<typeof studentRegisterSchema>;
export type TrainerRegisterInput = z.infer<typeof trainerRegisterSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type CreateClassInput = z.infer<typeof createClassSchema>;
export type UpdateClassInput = z.infer<typeof updateClassSchema>;
export type JoinClassInput = z.infer<typeof joinClassSchema>;
export type PreEnrollStudentInput = z.infer<typeof preEnrollStudentSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type AwardPrizeInput = z.infer<typeof awardPrizeSchema>;
export type WithdrawRequestInput = z.infer<typeof withdrawRequestSchema>;
export type TrainerApprovalInput = z.infer<typeof trainerApprovalSchema>;
export type CreateTicketInput = z.infer<typeof createTicketSchema>;
