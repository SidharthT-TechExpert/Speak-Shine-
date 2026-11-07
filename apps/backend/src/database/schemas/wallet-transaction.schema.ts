import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  TransactionType,
  TransactionCategory,
  TransactionStatus,
} from '@speak-shine/shared-types';

export type WalletTransactionDocument = WalletTransaction & Document;

@Schema({ timestamps: true })
export class WalletTransaction {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({
    required: true,
    type: String,
    enum: Object.values(TransactionType),
  })
  type: TransactionType;

  @Prop({
    required: true,
    type: String,
    enum: Object.values(TransactionCategory),
  })
  category: TransactionCategory;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ required: true })
  reason: string;

  @Prop({ required: true })
  balanceAfter: number;

  @Prop({
    required: true,
    type: String,
    enum: Object.values(TransactionStatus),
    default: TransactionStatus.COMPLETED,
  })
  status: TransactionStatus;

  @Prop({ type: Object, default: null })
  metadata?: any;
}

export const WalletTransactionSchema =
  SchemaFactory.createForClass(WalletTransaction);
WalletTransactionSchema.index({ userId: 1, createdAt: -1 });
WalletTransactionSchema.index({ status: 1 });
