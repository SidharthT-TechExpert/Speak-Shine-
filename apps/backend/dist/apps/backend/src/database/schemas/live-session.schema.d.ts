import { Document, Types } from 'mongoose';
import { LiveSessionStatus } from '@speak-shine/shared-types';
export type LiveSessionDocument = LiveSession & Document;
export declare class AttendanceRecord {
    studentId: Types.ObjectId;
    joinedAt: Date;
    leftAt?: Date;
    durationMinutes: number;
}
export declare const AttendanceRecordSchema: import("mongoose").Schema<AttendanceRecord, import("mongoose").Model<AttendanceRecord, any, any, any, Document<unknown, any, AttendanceRecord, any, {}> & AttendanceRecord & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, AttendanceRecord, Document<unknown, {}, import("mongoose").FlatRecord<AttendanceRecord>, {}, import("mongoose").DefaultSchemaOptions> & import("mongoose").FlatRecord<AttendanceRecord> & {
    _id: Types.ObjectId;
} & {
    __v: number;
}>;
export declare class LiveSession {
    classId: Types.ObjectId;
    trainerId: Types.ObjectId;
    roomName: string;
    title: string;
    status: LiveSessionStatus;
    scheduledAt: Date;
    startedAt?: Date;
    endedAt?: Date;
    attendance: AttendanceRecord[];
}
export declare const LiveSessionSchema: import("mongoose").Schema<LiveSession, import("mongoose").Model<LiveSession, any, any, any, Document<unknown, any, LiveSession, any, {}> & LiveSession & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, LiveSession, Document<unknown, {}, import("mongoose").FlatRecord<LiveSession>, {}, import("mongoose").DefaultSchemaOptions> & import("mongoose").FlatRecord<LiveSession> & {
    _id: Types.ObjectId;
} & {
    __v: number;
}>;
