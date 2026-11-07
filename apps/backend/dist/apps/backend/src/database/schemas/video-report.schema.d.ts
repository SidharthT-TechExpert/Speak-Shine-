import { Document, Types } from 'mongoose';
import { TaskSubmissionStatus } from '@speak-shine/shared-types';
export type VideoReportDocument = VideoReport & Document;
export declare class VideoReport {
    userId: Types.ObjectId;
    taskId?: Types.ObjectId;
    classId?: Types.ObjectId;
    phone: string;
    videoKey?: string;
    frameKeys: string[];
    videoDurationSeconds: number;
    status: TaskSubmissionStatus;
    analysis?: any;
    failureReason?: string;
    expiresAt: Date;
}
export declare const VideoReportSchema: import("mongoose").Schema<VideoReport, import("mongoose").Model<VideoReport, any, any, any, Document<unknown, any, VideoReport, any, {}> & VideoReport & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, VideoReport, Document<unknown, {}, import("mongoose").FlatRecord<VideoReport>, {}, import("mongoose").DefaultSchemaOptions> & import("mongoose").FlatRecord<VideoReport> & {
    _id: Types.ObjectId;
} & {
    __v: number;
}>;
