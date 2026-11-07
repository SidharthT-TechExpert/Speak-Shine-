import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { TaskType } from '@speak-shine/shared-types';

export type TaskDocument = Task & Document;

@Schema({ timestamps: true })
export class Task {
  @Prop({ type: Types.ObjectId, ref: 'Class', required: true })
  classId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  trainerId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true })
  description: string;

  @Prop({ required: true, enum: TaskType, default: TaskType.DAILY })
  type: TaskType;

  @Prop({ type: [String], default: [] })
  vocabularyChallengeWords: string[]; // 5 target words

  @Prop({ default: null })
  referenceImageUrl?: string;

  @Prop({ default: null })
  storyPrompt?: string;

  @Prop({ default: 30 })
  minDurationSeconds: number;

  @Prop({ default: 120 })
  maxDurationSeconds: number;

  @Prop({ default: 0 })
  prizePool: number; // In INR

  @Prop({ required: true })
  dueDate: Date;
}

export const TaskSchema = SchemaFactory.createForClass(Task);
TaskSchema.index({ classId: 1, dueDate: 1 });
TaskSchema.index({ trainerId: 1 });
