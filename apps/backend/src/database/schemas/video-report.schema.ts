import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { TaskSubmissionStatus } from '@speak-shine/shared-types';

export type VideoReportDocument = VideoReport & Document;

@Schema({ timestamps: true })
export class VideoReport {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Task', default: null })
  taskId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Class', default: null })
  classId?: Types.ObjectId;

  @Prop({ required: true })
  phone: string;

  @Prop({ default: null })
  videoKey?: string;

  @Prop({ type: [String], default: [] })
  frameKeys: string[];

  @Prop({ default: 0 })
  videoDurationSeconds: number;

  @Prop({
    required: true,
    enum: TaskSubmissionStatus,
    default: TaskSubmissionStatus.PENDING,
  })
  status: TaskSubmissionStatus;

  @Prop({ type: Object, default: null })
  analysis?: any;

  @Prop({ default: null })
  failureReason?: string;

  // Auto-expire raw video files after 18 hours (retaining lightweight analysis)
  @Prop({ default: () => new Date(Date.now() + 18 * 60 * 60 * 1000) })
  expiresAt: Date;
}

export const VideoReportSchema = SchemaFactory.createForClass(VideoReport);
VideoReportSchema.index({ userId: 1, createdAt: -1 });
VideoReportSchema.index({ classId: 1, taskId: 1 });
VideoReportSchema.index({ expiresAt: 1 });
