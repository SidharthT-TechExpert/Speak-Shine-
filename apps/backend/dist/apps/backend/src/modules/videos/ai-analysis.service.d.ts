import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import { VideoReportDocument } from '../../database/schemas/video-report.schema';
import { UserDocument } from '../../database/schemas/user.schema';
import { TaskDocument } from '../../database/schemas/task.schema';
export declare class AiAnalysisService {
    private videoReportModel;
    private userModel;
    private taskModel;
    private configService;
    private readonly logger;
    private groqApiKey;
    constructor(videoReportModel: Model<VideoReportDocument>, userModel: Model<UserDocument>, taskModel: Model<TaskDocument>, configService: ConfigService);
    processSubmission(reportId: string): Promise<any>;
}
