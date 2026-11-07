import { Document, Types } from 'mongoose';
import { Role } from '@speak-shine/shared-types';
export type UserDocument = User & Document;
export declare class User {
    email: string;
    phone?: string;
    name: string;
    passwordHash: string;
    role: Role;
    isActive: boolean;
    classId?: Types.ObjectId;
    trainerId?: Types.ObjectId;
    streak: number;
    lastStreakDate?: string;
    streakFreeze: number;
    freezeStreakProgress: number;
    monthlyScore: number;
    lastScoreDate?: string;
    earnedBadges: string[];
    walletBalance: number;
    referralCode?: string;
    referredBy?: Types.ObjectId;
    resetPasswordOtp?: string;
    resetPasswordExpiresAt?: Date;
}
export declare const UserSchema: import("mongoose").Schema<User, import("mongoose").Model<User, any, any, any, Document<unknown, any, User, any, {}> & User & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, User, Document<unknown, {}, import("mongoose").FlatRecord<User>, {}, import("mongoose").DefaultSchemaOptions> & import("mongoose").FlatRecord<User> & {
    _id: Types.ObjectId;
} & {
    __v: number;
}>;
