"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTicketSchema = exports.trainerApprovalSchema = exports.withdrawRequestSchema = exports.awardPrizeSchema = exports.createTaskSchema = exports.preEnrollStudentSchema = exports.joinClassSchema = exports.updateClassSchema = exports.createClassSchema = exports.resetPasswordSchema = exports.forgotPasswordSchema = exports.trainerRegisterSchema = exports.studentRegisterSchema = exports.loginSchema = void 0;
const zod_1 = require("zod");
// ── Auth Schemas ─────────────────────────────────────────────────────────────
exports.loginSchema = zod_1.z.object({
    identifier: zod_1.z
        .string()
        .min(3, 'Phone or email must be at least 3 characters')
        .max(100, 'Identifier is too long'),
    password: zod_1.z
        .string()
        .min(6, 'Password must be at least 6 characters')
        .max(100, 'Password is too long'),
});
exports.studentRegisterSchema = zod_1.z.object({
    name: zod_1.z
        .string()
        .min(2, 'Name must be at least 2 characters')
        .max(50, 'Name cannot exceed 50 characters')
        .trim(),
    email: zod_1.z
        .string()
        .email('Please enter a valid email address')
        .toLowerCase()
        .trim(),
    phone: zod_1.z
        .string()
        .regex(/^[0-9+\-\s]{8,15}$/, 'Please enter a valid phone number')
        .optional(),
    password: zod_1.z
        .string()
        .min(6, 'Password must be at least 6 characters')
        .max(100, 'Password is too long'),
    classCode: zod_1.z
        .string()
        .min(4, 'Class code must be at least 4 characters')
        .max(20, 'Invalid class code format')
        .toUpperCase()
        .trim()
        .optional(),
    referralCode: zod_1.z
        .string()
        .max(20, 'Invalid referral code')
        .optional(),
});
exports.trainerRegisterSchema = zod_1.z.object({
    name: zod_1.z
        .string()
        .min(2, 'Name must be at least 2 characters')
        .max(50, 'Name cannot exceed 50 characters')
        .trim(),
    email: zod_1.z
        .string()
        .email('Please enter a valid email address')
        .toLowerCase()
        .trim(),
    phone: zod_1.z
        .string()
        .regex(/^[0-9+\-\s]{8,15}$/, 'Please enter a valid phone number'),
    password: zod_1.z
        .string()
        .min(8, 'Password must be at least 8 characters')
        .max(100, 'Password is too long'),
    bio: zod_1.z
        .string()
        .max(500, 'Bio cannot exceed 500 characters')
        .optional(),
    qualifications: zod_1.z
        .array(zod_1.z.string().trim().min(2))
        .min(1, 'Please provide at least one qualification/experience summary'),
});
exports.forgotPasswordSchema = zod_1.z.object({
    identifier: zod_1.z
        .string()
        .min(3, 'Please enter your registered email or phone')
        .trim(),
});
exports.resetPasswordSchema = zod_1.z.object({
    identifier: zod_1.z
        .string()
        .min(3, 'Please enter your registered email or phone')
        .trim(),
    otp: zod_1.z
        .string()
        .length(6, 'OTP must be exactly 6 digits')
        .regex(/^\d+$/, 'OTP must contain numbers only'),
    newPassword: zod_1.z
        .string()
        .min(6, 'New password must be at least 6 characters')
        .max(100, 'Password is too long'),
});
// ── Class Schemas ────────────────────────────────────────────────────────────
exports.createClassSchema = zod_1.z.object({
    title: zod_1.z
        .string()
        .min(3, 'Class title must be at least 3 characters')
        .max(100, 'Class title cannot exceed 100 characters')
        .trim(),
    description: zod_1.z
        .string()
        .max(500, 'Description cannot exceed 500 characters')
        .optional(),
    startDate: zod_1.z.string().datetime().optional(),
    endDate: zod_1.z.string().datetime().optional(),
});
exports.updateClassSchema = exports.createClassSchema.partial().extend({
    status: zod_1.z.enum(['ACTIVE', 'COMPLETED', 'ARCHIVED']).optional(),
});
exports.joinClassSchema = zod_1.z.object({
    classCode: zod_1.z
        .string()
        .min(4, 'Class code is too short')
        .max(20, 'Class code is too long')
        .toUpperCase()
        .trim(),
});
exports.preEnrollStudentSchema = zod_1.z.object({
    name: zod_1.z
        .string()
        .min(2, 'Student name must be at least 2 characters')
        .max(50, 'Student name cannot exceed 50 characters')
        .trim(),
    email: zod_1.z
        .string()
        .email('Please enter a valid email address')
        .toLowerCase()
        .trim(),
    phone: zod_1.z
        .string()
        .regex(/^[0-9+\-\s]{8,15}$/, 'Please enter a valid phone number')
        .optional(),
});
// ── Task Schemas ─────────────────────────────────────────────────────────────
exports.createTaskSchema = zod_1.z.object({
    classId: zod_1.z.string().min(1, 'Class ID is required'),
    title: zod_1.z
        .string()
        .min(3, 'Task title must be at least 3 characters')
        .max(120, 'Title cannot exceed 120 characters')
        .trim(),
    description: zod_1.z
        .string()
        .min(10, 'Task description must provide clear guidelines')
        .max(2000, 'Description cannot exceed 2000 characters'),
    type: zod_1.z.enum([
        'DAILY',
        'STORY',
        'PICTURE',
        'REFLECTION',
        'MONTHLY_GOALS',
        'MONTHLY_REFLECTION',
    ]),
    vocabularyChallengeWords: zod_1.z
        .array(zod_1.z.string().trim().min(2))
        .max(5, 'Maximum of 5 vocabulary challenge words')
        .optional(),
    referenceImageUrl: zod_1.z.string().url().optional(),
    storyPrompt: zod_1.z.string().max(1000).optional(),
    minDurationSeconds: zod_1.z.number().int().min(15).max(300).default(30),
    maxDurationSeconds: zod_1.z.number().int().min(30).max(600).default(120),
    prizePool: zod_1.z.number().min(0).max(50000).optional(),
    dueDate: zod_1.z.string().datetime(),
});
// ── Wallet & Prize Schemas ───────────────────────────────────────────────────
exports.awardPrizeSchema = zod_1.z.object({
    studentId: zod_1.z.string().min(1, 'Student ID is required'),
    classId: zod_1.z.string().min(1, 'Class ID is required'),
    taskId: zod_1.z.string().optional(),
    amount: zod_1.z.number().positive('Prize amount must be greater than zero'),
    reason: zod_1.z.string().min(3, 'Reason for reward is required').max(200),
});
exports.withdrawRequestSchema = zod_1.z.object({
    amount: zod_1.z.number().positive('Withdrawal amount must be greater than zero'),
    payoutMethod: zod_1.z.enum(['UPI', 'BANK_TRANSFER']),
    payoutDetails: zod_1.z.object({
        upiId: zod_1.z.string().optional(),
        accountNumber: zod_1.z.string().optional(),
        ifscCode: zod_1.z.string().optional(),
        accountHolderName: zod_1.z.string().optional(),
    }),
});
// ── Admin Governance Schemas ─────────────────────────────────────────────────
exports.trainerApprovalSchema = zod_1.z.object({
    status: zod_1.z.enum(['ACTIVE', 'REJECTED', 'SUSPENDED']),
    reviewNotes: zod_1.z.string().max(500).optional(),
});
// ── Ticket Schemas ───────────────────────────────────────────────────────────
exports.createTicketSchema = zod_1.z.object({
    subject: zod_1.z.string().min(5).max(150).trim(),
    category: zod_1.z.enum(['PAYMENT', 'VIDEO_ANALYSIS', 'CLASS_ACCESS', 'BUG', 'OTHER']),
    priority: zod_1.z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
    message: zod_1.z.string().min(10).max(2000).trim(),
});
