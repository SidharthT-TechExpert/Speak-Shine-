import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { VideoReportDocument } from '../../database/schemas/video-report.schema';
import { UserDocument } from '../../database/schemas/user.schema';
import { TaskDocument } from '../../database/schemas/task.schema';
import { TaskSubmissionStatus } from '@speak-shine/shared-types';
import { AiAnalysisService } from './ai-analysis.service';
import { PresignedUrlDto } from './dto/presigned-url.dto';
import { SubmitCompleteDto } from './dto/submit-complete.dto';
export declare class VideosService {
    private videoReportModel;
    private userModel;
    private taskModel;
    private configService;
    private aiAnalysisService;
    private s3Client;
    private bucketName;
    constructor(videoReportModel: Model<VideoReportDocument>, userModel: Model<UserDocument>, taskModel: Model<TaskDocument>, configService: ConfigService, aiAnalysisService: AiAnalysisService);
    generatePresignedUrls(userId: string, dto: PresignedUrlDto): Promise<{
        reportId: string;
        videoKey: string;
        videoUploadUrl: string;
        frameKeys: string[];
        frameUploadUrls: string[];
    }>;
    submitComplete(userId: string, dto: SubmitCompleteDto): Promise<{
        message: string;
        reportId: string;
        status: TaskSubmissionStatus;
    }>;
    getVideoReport(userId: string, reportId: string): Promise<import("mongoose").FlattenMaps<VideoReportDocument> & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    }>;
}
