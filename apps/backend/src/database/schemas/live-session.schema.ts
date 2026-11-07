import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { LiveSessionStatus } from '@speak-shine/shared-types';

export type LiveSessionDocument = LiveSession & Document;

@Schema({ _id: false })
export class AttendanceRecord {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  studentId: Types.ObjectId;

  @Prop({ required: true })
  joinedAt: Date;

  @Prop({ default: null })
  leftAt?: Date;

  @Prop({ default: 0 })
  durationMinutes: number;
}
export const AttendanceRecordSchema = SchemaFactory.createForClass(AttendanceRecord);

@Schema({ timestamps: true })
export class LiveSession {
  @Prop({ type: Types.ObjectId, ref: 'Class', required: true })
  classId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  trainerId: Types.ObjectId;

  @Prop({ required: true, unique: true, trim: true })
  roomName: string;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({
    required: true,
    type: String,
    enum: Object.values(LiveSessionStatus),
    default: LiveSessionStatus.SCHEDULED,
  })
  status: LiveSessionStatus;

  @Prop({ required: true })
  scheduledAt: Date;

  @Prop({ default: null })
  startedAt?: Date;

  @Prop({ default: null })
  endedAt?: Date;

  @Prop({ type: [AttendanceRecordSchema], default: [] })
  attendance: AttendanceRecord[];
}

export const LiveSessionSchema = SchemaFactory.createForClass(LiveSession);
LiveSessionSchema.index({ classId: 1, scheduledAt: -1 });
LiveSessionSchema.index({ trainerId: 1 });
