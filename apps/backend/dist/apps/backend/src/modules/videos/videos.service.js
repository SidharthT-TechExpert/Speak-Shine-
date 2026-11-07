"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VideosService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const config_1 = require("@nestjs/config");
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const video_report_schema_1 = require("../../database/schemas/video-report.schema");
const user_schema_1 = require("../../database/schemas/user.schema");
const task_schema_1 = require("../../database/schemas/task.schema");
const shared_types_1 = require("@speak-shine/shared-types");
const ai_analysis_service_1 = require("./ai-analysis.service");
let VideosService = class VideosService {
    constructor(videoReportModel, userModel, taskModel, configService, aiAnalysisService) {
        this.videoReportModel = videoReportModel;
        this.userModel = userModel;
        this.taskModel = taskModel;
        this.configService = configService;
        this.aiAnalysisService = aiAnalysisService;
        this.s3Client = null;
        this.bucketName =
            this.configService.get('R2_BUCKET_NAME') || 'speak-shine-videos';
        const accountId = this.configService.get('R2_ACCOUNT_ID');
        const accessKeyId = this.configService.get('R2_ACCESS_KEY_ID');
        const secretAccessKey = this.configService.get('R2_SECRET_ACCESS_KEY');
        if (accountId && accessKeyId && secretAccessKey) {
            this.s3Client = new client_s3_1.S3Client({
                region: 'auto',
                endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
                credentials: {
                    accessKeyId,
                    secretAccessKey,
                },
            });
        }
    }
    async generatePresignedUrls(userId, dto) {
        const user = await this.userModel.findById(userId).lean();
        if (!user)
            throw new common_1.NotFoundException('User not found');
        if (dto.taskId) {
            const task = await this.taskModel.findById(dto.taskId).lean();
            if (!task)
                throw new common_1.NotFoundException('Task not found');
            if (user.classId && task.classId.toString() !== user.classId.toString()) {
                throw new common_1.ForbiddenException('Task does not belong to your enrolled class');
            }
        }
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).substring(2, 8);
        const videoKey = `videos/${userId}/${timestamp}_${randomSuffix}.mp4`;
        const frameKeys = [];
        for (let i = 0; i < dto.frameCount; i++) {
            frameKeys.push(`frames/${userId}/${timestamp}_frame_${i}.jpg`);
        }
        let videoUploadUrl = `mock://upload/${videoKey}`;
        const frameUploadUrls = [];
        if (this.s3Client) {
            const putCommand = new client_s3_1.PutObjectCommand({
                Bucket: this.bucketName,
                Key: videoKey,
                ContentType: 'video/mp4',
            });
            videoUploadUrl = await (0, s3_request_presigner_1.getSignedUrl)(this.s3Client, putCommand, {
                expiresIn: 3600,
            });
            for (const fKey of frameKeys) {
                const frameCommand = new client_s3_1.PutObjectCommand({
                    Bucket: this.bucketName,
                    Key: fKey,
                    ContentType: 'image/jpeg',
                });
                const url = await (0, s3_request_presigner_1.getSignedUrl)(this.s3Client, frameCommand, {
                    expiresIn: 3600,
                });
                frameUploadUrls.push(url);
            }
        }
        else {
            frameKeys.forEach((k) => frameUploadUrls.push(`mock://upload/${k}`));
        }
        const report = await this.videoReportModel.create({
            userId: new mongoose_2.Types.ObjectId(userId),
            taskId: dto.taskId ? new mongoose_2.Types.ObjectId(dto.taskId) : null,
            classId: user.classId || null,
            phone: user.phone || 'N/A',
            videoKey,
            frameKeys,
            status: shared_types_1.TaskSubmissionStatus.PENDING,
        });
        return {
            reportId: report._id.toString(),
            videoKey,
            videoUploadUrl,
            frameKeys,
            frameUploadUrls,
        };
    }
    async submitComplete(userId, dto) {
        const report = await this.videoReportModel.findById(dto.reportId);
        if (!report)
            throw new common_1.NotFoundException('Report not found');
        if (report.userId.toString() !== userId) {
            throw new common_1.ForbiddenException('Report does not belong to this user');
        }
        report.videoDurationSeconds = dto.durationSeconds;
        report.status = shared_types_1.TaskSubmissionStatus.PROCESSING;
        await report.save();
        const todayIST = new Date().toISOString().split('T')[0];
        const user = await this.userModel.findById(userId);
        if (user && user.lastStreakDate !== todayIST) {
            user.streak += 1;
            user.lastStreakDate = todayIST;
            user.freezeStreakProgress += 1;
            if (user.freezeStreakProgress >= 7) {
                user.streakFreeze += 1;
                user.freezeStreakProgress = 0;
            }
            await user.save();
        }
        console.log(`[VideosService] Video ${report._id} queued for background AI analysis`);
        this.aiAnalysisService
            .processSubmission(report._id.toString())
            .catch((err) => console.error(`[AiAnalysisService] Async error: ${err.message}`));
        return {
            message: 'Video upload confirmed. Analysis has been queued.',
            reportId: report._id.toString(),
            status: shared_types_1.TaskSubmissionStatus.PROCESSING,
        };
    }
    async getVideoReport(userId, reportId) {
        const report = await this.videoReportModel.findById(reportId).lean();
        if (!report)
            throw new common_1.NotFoundException('Report not found');
        return report;
    }
};
exports.VideosService = VideosService;
exports.VideosService = VideosService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(video_report_schema_1.VideoReport.name)),
    __param(1, (0, mongoose_1.InjectModel)(user_schema_1.User.name)),
    __param(2, (0, mongoose_1.InjectModel)(task_schema_1.Task.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        config_1.ConfigService,
        ai_analysis_service_1.AiAnalysisService])
], VideosService);
//# sourceMappingURL=videos.service.js.map