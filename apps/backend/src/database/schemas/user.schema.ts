import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Role } from '@speak-shine/shared-types';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ unique: true, sparse: true, trim: true })
  phone?: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ required: true, enum: Role, default: Role.STUDENT })
  role: Role;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: Types.ObjectId, ref: 'Class', default: null })
  classId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  trainerId?: Types.ObjectId;

  // Streak & gamification state
  @Prop({ default: 0 })
  streak: number;

  @Prop({ default: null })
  lastStreakDate?: string;

  @Prop({ default: 0 })
  streakFreeze: number;

  @Prop({ default: 0 })
  freezeStreakProgress: number;

  @Prop({ default: 0 })
  monthlyScore: number;

  @Prop({ default: null })
  lastScoreDate?: string;

  @Prop({ type: [String], default: [] })
  earnedBadges: string[];

  // Wallet
  @Prop({ default: 0, min: 0 })
  walletBalance: number;

  // Referral
  @Prop({ unique: true, sparse: true })
  referralCode?: string;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  referredBy?: Types.ObjectId;

  // OTP for Password Reset / Activation
  @Prop({ default: null })
  resetPasswordOtp?: string;

  @Prop({ default: null })
  resetPasswordExpiresAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ email: 1 });
UserSchema.index({ phone: 1 });
UserSchema.index({ classId: 1 });
UserSchema.index({ role: 1 });
