import { Document, Types } from 'mongoose';
import { TrainerApprovalStatus } from '@speak-shine/shared-types';
export type TrainerProfileDocument = TrainerProfile & Document;
export declare class TrainerProfile {
    userId: Types.ObjectId;
    approvalStatus: TrainerApprovalStatus;
    bio?: string;
    qualifications: string[];
    approvedAt?: Date;
    approvedBy?: Types.ObjectId;
    rejectionReason?: string;
    activeClassCount: number;
    totalStudentsTaught: number;
}
export declare const TrainerProfileSchema: import("mongoose").Schema<TrainerProfile, import("mongoose").Model<TrainerProfile, any, any, any, Document<unknown, any, TrainerProfile, any, {}> & TrainerProfile & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, TrainerProfile, Document<unknown, {}, import("mongoose").FlatRecord<TrainerProfile>, {}, import("mongoose").DefaultSchemaOptions> & import("mongoose").FlatRecord<TrainerProfile> & {
    _id: Types.ObjectId;
} & {
    __v: number;
}>;
