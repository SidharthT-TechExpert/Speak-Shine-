import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { TrainerApprovalStatus } from '@speak-shine/shared-types';

export type TrainerProfileDocument = TrainerProfile & Document;

@Schema({ timestamps: true })
export class TrainerProfile {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  userId: Types.ObjectId;

  @Prop({
    required: true,
    type: String,
    enum: Object.values(TrainerApprovalStatus),
    default: TrainerApprovalStatus.PENDING_APPROVAL,
  })
  approvalStatus: TrainerApprovalStatus;

  @Prop({ default: null })
  bio?: string;

  @Prop({ type: [String], default: [] })
  qualifications: string[];

  @Prop({ default: null })
  approvedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  approvedBy?: Types.ObjectId;

  @Prop({ default: null })
  rejectionReason?: string;

  @Prop({ default: 0 })
  activeClassCount: number;

  @Prop({ default: 0 })
  totalStudentsTaught: number;
}

export const TrainerProfileSchema = SchemaFactory.createForClass(TrainerProfile);
TrainerProfileSchema.index({ approvalStatus: 1 });
