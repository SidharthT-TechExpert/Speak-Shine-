import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { ClassStatus } from '@speak-shine/shared-types';

export type ClassDocument = Class & Document;

@Schema({ timestamps: true })
export class Class {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ default: null, trim: true })
  description?: string;

  @Prop({ required: true, unique: true, uppercase: true, trim: true })
  classCode: string; // e.g. "SHINE-9402"

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  trainerId: Types.ObjectId;

  @Prop({ required: true, enum: ClassStatus, default: ClassStatus.ACTIVE })
  status: ClassStatus;

  @Prop({ default: 0 })
  studentCount: number;

  @Prop({ default: null })
  startDate?: Date;

  @Prop({ default: null })
  endDate?: Date;
}

export const ClassSchema = SchemaFactory.createForClass(Class);
ClassSchema.index({ classCode: 1 });
ClassSchema.index({ trainerId: 1, status: 1 });
