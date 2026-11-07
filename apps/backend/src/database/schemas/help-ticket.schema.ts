import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { TicketPriority, TicketStatus, Role } from '@speak-shine/shared-types';

export type HelpTicketDocument = HelpTicket & Document;

@Schema({ _id: false })
export class TicketMessage {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  senderId: Types.ObjectId;

  @Prop({ required: true, type: String, enum: Object.values(Role) })
  senderRole: Role;

  @Prop({ required: true, trim: true })
  message: string;

  @Prop({ default: () => new Date() })
  sentAt: Date;
}
export const TicketMessageSchema = SchemaFactory.createForClass(TicketMessage);

@Schema({ timestamps: true })
export class HelpTicket {
  @Prop({ required: true, unique: true, uppercase: true })
  ticketNumber: string; // e.g. "TKT-8941"

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  creatorId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  assignedTo?: Types.ObjectId;

  @Prop({ required: true, trim: true })
  subject: string;

  @Prop({ required: true, enum: ['PAYMENT', 'VIDEO_ANALYSIS', 'CLASS_ACCESS', 'BUG', 'OTHER'] })
  category: string;

  @Prop({
    required: true,
    type: String,
    enum: Object.values(TicketPriority),
    default: TicketPriority.MEDIUM,
  })
  priority: TicketPriority;

  @Prop({
    required: true,
    type: String,
    enum: Object.values(TicketStatus),
    default: TicketStatus.OPEN,
  })
  status: TicketStatus;

  @Prop({ type: [TicketMessageSchema], default: [] })
  messages: TicketMessage[];

  @Prop({ default: null })
  resolvedAt?: Date;
}

export const HelpTicketSchema = SchemaFactory.createForClass(HelpTicket);
HelpTicketSchema.index({ creatorId: 1, createdAt: -1 });
HelpTicketSchema.index({ status: 1 });
