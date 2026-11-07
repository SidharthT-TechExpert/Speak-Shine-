import { VideosService } from './videos.service';
import { PresignedUrlDto } from './dto/presigned-url.dto';
import { SubmitCompleteDto } from './dto/submit-complete.dto';
export declare class VideosController {
    private readonly videosService;
    constructor(videosService: VideosService);
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
        status: import("@speak-shine/shared-types").TaskSubmissionStatus;
    }>;
    getVideoReport(userId: string, reportId: string): Promise<import("mongoose").FlattenMaps<import("../../database/schemas/video-report.schema").VideoReportDocument> & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    }>;
}
