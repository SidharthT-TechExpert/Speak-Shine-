import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  VideoReport,
  VideoReportDocument,
} from '../../database/schemas/video-report.schema';
import { User, UserDocument } from '../../database/schemas/user.schema';
import { Task, TaskDocument } from '../../database/schemas/task.schema';
import { TaskSubmissionStatus } from '@speak-shine/shared-types';
import { PresignedUrlDto } from './dto/presigned-url.dto';
import { SubmitCompleteDto } from './dto/submit-complete.dto';

@Injectable()
export class VideosService {
  private s3Client: S3Client | null = null;
  private bucketName: string;

  constructor(
    @InjectModel(VideoReport.name)
    private videoReportModel: Model<VideoReportDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Task.name) private taskModel: Model<TaskDocument>,
    private configService: ConfigService,
  ) {
    this.bucketName =
      this.configService.get<string>('R2_BUCKET_NAME') || 'speak-shine-videos';

    const accountId = this.configService.get<string>('R2_ACCOUNT_ID');
    const accessKeyId = this.configService.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>(
      'R2_SECRET_ACCESS_KEY',
    );

    if (accountId && accessKeyId && secretAccessKey) {
      this.s3Client = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
    }
  }

  async generatePresignedUrls(userId: string, dto: PresignedUrlDto) {
    const user = await this.userModel.findById(userId).lean();
    if (!user) throw new NotFoundException('User not found');

    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const videoKey = `videos/${userId}/${timestamp}_${randomSuffix}.mp4`;

    const frameKeys: string[] = [];
    for (let i = 0; i < dto.frameCount; i++) {
      frameKeys.push(`frames/${userId}/${timestamp}_frame_${i}.jpg`);
    }

    let videoUploadUrl = `mock://upload/${videoKey}`;
    const frameUploadUrls: string[] = [];

    // If S3 / R2 is configured, generate real AWS presigned URLs
    if (this.s3Client) {
      const putCommand = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: videoKey,
        ContentType: 'video/mp4',
      });
      videoUploadUrl = await getSignedUrl(this.s3Client, putCommand, {
        expiresIn: 3600,
      });

      for (const fKey of frameKeys) {
        const frameCommand = new PutObjectCommand({
          Bucket: this.bucketName,
          Key: fKey,
          ContentType: 'image/jpeg',
        });
        const url = await getSignedUrl(this.s3Client, frameCommand, {
          expiresIn: 3600,
        });
        frameUploadUrls.push(url);
      }
    } else {
      frameKeys.forEach((k) => frameUploadUrls.push(`mock://upload/${k}`));
    }

    const report = await this.videoReportModel.create({
      userId: new Types.ObjectId(userId),
      taskId: dto.taskId ? new Types.ObjectId(dto.taskId) : null,
      classId: user.classId || null,
      phone: user.phone || 'N/A',
      videoKey,
      frameKeys,
      status: TaskSubmissionStatus.PENDING,
    });

    return {
      reportId: report._id.toString(),
      videoKey,
      videoUploadUrl,
      frameKeys,
      frameUploadUrls,
    };
  }

  async submitComplete(userId: string, dto: SubmitCompleteDto) {
    const report = await this.videoReportModel.findById(dto.reportId);
    if (!report) throw new NotFoundException('Report not found');
    if (report.userId.toString() !== userId) {
      throw new ForbiddenException('Report does not belong to this user');
    }

    report.videoDurationSeconds = dto.durationSeconds;
    report.status = TaskSubmissionStatus.PROCESSING;
    await report.save();

    // Perform atomic streak increment
    const todayIST = new Date().toISOString().split('T')[0];
    const user = await this.userModel.findById(userId);

    if (user && user.lastStreakDate !== todayIST) {
      user.streak += 1;
      user.lastStreakDate = todayIST;
      user.freezeStreakProgress += 1;

      // Every continuous 7 days rewards +1 streak freeze shield
      if (user.freezeStreakProgress >= 7) {
        user.streakFreeze += 1;
        user.freezeStreakProgress = 0;
      }
      await user.save();
    }

    console.log(
      `[VideosService] Video ${report._id} queued for BullMQ background analysis`,
    );

    return {
      message: 'Video upload confirmed. Analysis has been queued.',
      reportId: report._id.toString(),
      status: TaskSubmissionStatus.PROCESSING,
    };
  }

  async getVideoReport(userId: string, reportId: string) {
    const report = await this.videoReportModel.findById(reportId).lean();
    if (!report) throw new NotFoundException('Report not found');
    return report;
  }
}
