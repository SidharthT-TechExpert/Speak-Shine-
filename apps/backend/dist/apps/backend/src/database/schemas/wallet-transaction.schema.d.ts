import { Document, Types } from 'mongoose';
import { TransactionType, TransactionCategory, TransactionStatus } from '@speak-shine/shared-types';
export type WalletTransactionDocument = WalletTransaction & Document;
export declare class WalletTransaction {
    userId: Types.ObjectId;
    type: TransactionType;
    category: TransactionCategory;
    amount: number;
    reason: string;
    balanceAfter: number;
    status: TransactionStatus;
    metadata?: any;
}
export declare const WalletTransactionSchema: import("mongoose").Schema<WalletTransaction, import("mongoose").Model<WalletTransaction, any, any, any, Document<unknown, any, WalletTransaction, any, {}> & WalletTransaction & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, WalletTransaction, Document<unknown, {}, import("mongoose").FlatRecord<WalletTransaction>, {}, import("mongoose").DefaultSchemaOptions> & import("mongoose").FlatRecord<WalletTransaction> & {
    _id: Types.ObjectId;
} & {
    __v: number;
}>;
