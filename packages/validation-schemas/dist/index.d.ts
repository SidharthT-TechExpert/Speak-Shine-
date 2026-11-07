import { z } from 'zod';
export declare const loginSchema: z.ZodObject<{
    identifier: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    identifier: string;
    password: string;
}, {
    identifier: string;
    password: string;
}>;
export declare const studentRegisterSchema: z.ZodObject<{
    name: z.ZodString;
    email: z.ZodString;
    phone: z.ZodOptional<z.ZodString>;
    password: z.ZodString;
    classCode: z.ZodOptional<z.ZodString>;
    referralCode: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    password: string;
    name: string;
    email: string;
    phone?: string | undefined;
    classCode?: string | undefined;
    referralCode?: string | undefined;
}, {
    password: string;
    name: string;
    email: string;
    phone?: string | undefined;
    classCode?: string | undefined;
    referralCode?: string | undefined;
}>;
export declare const trainerRegisterSchema: z.ZodObject<{
    name: z.ZodString;
    email: z.ZodString;
    phone: z.ZodString;
    password: z.ZodString;
    bio: z.ZodOptional<z.ZodString>;
    qualifications: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    password: string;
    name: string;
    email: string;
    phone: string;
    qualifications: string[];
    bio?: string | undefined;
}, {
    password: string;
    name: string;
    email: string;
    phone: string;
    qualifications: string[];
    bio?: string | undefined;
}>;
export declare const forgotPasswordSchema: z.ZodObject<{
    identifier: z.ZodString;
}, "strip", z.ZodTypeAny, {
    identifier: string;
}, {
    identifier: string;
}>;
export declare const resetPasswordSchema: z.ZodObject<{
    identifier: z.ZodString;
    otp: z.ZodString;
    newPassword: z.ZodString;
}, "strip", z.ZodTypeAny, {
    identifier: string;
    otp: string;
    newPassword: string;
}, {
    identifier: string;
    otp: string;
    newPassword: string;
}>;
export declare const createClassSchema: z.ZodObject<{
    title: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    startDate: z.ZodOptional<z.ZodString>;
    endDate: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    title: string;
    description?: string | undefined;
    startDate?: string | undefined;
    endDate?: string | undefined;
}, {
    title: string;
    description?: string | undefined;
    startDate?: string | undefined;
    endDate?: string | undefined;
}>;
export declare const updateClassSchema: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    startDate: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    endDate: z.ZodOptional<z.ZodOptional<z.ZodString>>;
} & {
    status: z.ZodOptional<z.ZodEnum<["ACTIVE", "COMPLETED", "ARCHIVED"]>>;
}, "strip", z.ZodTypeAny, {
    status?: "ACTIVE" | "COMPLETED" | "ARCHIVED" | undefined;
    title?: string | undefined;
    description?: string | undefined;
    startDate?: string | undefined;
    endDate?: string | undefined;
}, {
    status?: "ACTIVE" | "COMPLETED" | "ARCHIVED" | undefined;
    title?: string | undefined;
    description?: string | undefined;
    startDate?: string | undefined;
    endDate?: string | undefined;
}>;
export declare const joinClassSchema: z.ZodObject<{
    classCode: z.ZodString;
}, "strip", z.ZodTypeAny, {
    classCode: string;
}, {
    classCode: string;
}>;
export declare const preEnrollStudentSchema: z.ZodObject<{
    name: z.ZodString;
    email: z.ZodString;
    phone: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name: string;
    email: string;
    phone?: string | undefined;
}, {
    name: string;
    email: string;
    phone?: string | undefined;
}>;
export declare const createTaskSchema: z.ZodObject<{
    classId: z.ZodString;
    title: z.ZodString;
    description: z.ZodString;
    type: z.ZodEnum<["DAILY", "STORY", "PICTURE", "REFLECTION", "MONTHLY_GOALS", "MONTHLY_REFLECTION"]>;
    vocabularyChallengeWords: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    referenceImageUrl: z.ZodOptional<z.ZodString>;
    storyPrompt: z.ZodOptional<z.ZodString>;
    minDurationSeconds: z.ZodDefault<z.ZodNumber>;
    maxDurationSeconds: z.ZodDefault<z.ZodNumber>;
    prizePool: z.ZodOptional<z.ZodNumber>;
    dueDate: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "DAILY" | "STORY" | "PICTURE" | "REFLECTION" | "MONTHLY_GOALS" | "MONTHLY_REFLECTION";
    title: string;
    description: string;
    classId: string;
    minDurationSeconds: number;
    maxDurationSeconds: number;
    dueDate: string;
    vocabularyChallengeWords?: string[] | undefined;
    referenceImageUrl?: string | undefined;
    storyPrompt?: string | undefined;
    prizePool?: number | undefined;
}, {
    type: "DAILY" | "STORY" | "PICTURE" | "REFLECTION" | "MONTHLY_GOALS" | "MONTHLY_REFLECTION";
    title: string;
    description: string;
    classId: string;
    dueDate: string;
    vocabularyChallengeWords?: string[] | undefined;
    referenceImageUrl?: string | undefined;
    storyPrompt?: string | undefined;
    minDurationSeconds?: number | undefined;
    maxDurationSeconds?: number | undefined;
    prizePool?: number | undefined;
}>;
export declare const awardPrizeSchema: z.ZodObject<{
    studentId: z.ZodString;
    classId: z.ZodString;
    taskId: z.ZodOptional<z.ZodString>;
    amount: z.ZodNumber;
    reason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    classId: string;
    studentId: string;
    amount: number;
    reason: string;
    taskId?: string | undefined;
}, {
    classId: string;
    studentId: string;
    amount: number;
    reason: string;
    taskId?: string | undefined;
}>;
export declare const withdrawRequestSchema: z.ZodObject<{
    amount: z.ZodNumber;
    payoutMethod: z.ZodEnum<["UPI", "BANK_TRANSFER"]>;
    payoutDetails: z.ZodObject<{
        upiId: z.ZodOptional<z.ZodString>;
        accountNumber: z.ZodOptional<z.ZodString>;
        ifscCode: z.ZodOptional<z.ZodString>;
        accountHolderName: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        upiId?: string | undefined;
        accountNumber?: string | undefined;
        ifscCode?: string | undefined;
        accountHolderName?: string | undefined;
    }, {
        upiId?: string | undefined;
        accountNumber?: string | undefined;
        ifscCode?: string | undefined;
        accountHolderName?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    amount: number;
    payoutMethod: "UPI" | "BANK_TRANSFER";
    payoutDetails: {
        upiId?: string | undefined;
        accountNumber?: string | undefined;
        ifscCode?: string | undefined;
        accountHolderName?: string | undefined;
    };
}, {
    amount: number;
    payoutMethod: "UPI" | "BANK_TRANSFER";
    payoutDetails: {
        upiId?: string | undefined;
        accountNumber?: string | undefined;
        ifscCode?: string | undefined;
        accountHolderName?: string | undefined;
    };
}>;
export declare const trainerApprovalSchema: z.ZodObject<{
    status: z.ZodEnum<["ACTIVE", "REJECTED", "SUSPENDED"]>;
    reviewNotes: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: "ACTIVE" | "REJECTED" | "SUSPENDED";
    reviewNotes?: string | undefined;
}, {
    status: "ACTIVE" | "REJECTED" | "SUSPENDED";
    reviewNotes?: string | undefined;
}>;
export declare const createTicketSchema: z.ZodObject<{
    subject: z.ZodString;
    category: z.ZodEnum<["PAYMENT", "VIDEO_ANALYSIS", "CLASS_ACCESS", "BUG", "OTHER"]>;
    priority: z.ZodDefault<z.ZodEnum<["LOW", "MEDIUM", "HIGH"]>>;
    message: z.ZodString;
}, "strip", z.ZodTypeAny, {
    message: string;
    subject: string;
    category: "PAYMENT" | "VIDEO_ANALYSIS" | "CLASS_ACCESS" | "BUG" | "OTHER";
    priority: "LOW" | "MEDIUM" | "HIGH";
}, {
    message: string;
    subject: string;
    category: "PAYMENT" | "VIDEO_ANALYSIS" | "CLASS_ACCESS" | "BUG" | "OTHER";
    priority?: "LOW" | "MEDIUM" | "HIGH" | undefined;
}>;
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
