import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../../database/schemas/user.schema';
import {
  VideoReport,
  VideoReportDocument,
} from '../../database/schemas/video-report.schema';

@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(VideoReport.name)
    private videoReportModel: Model<VideoReportDocument>,
  ) {}

  onModuleInit() {
    this.logger.log('Scheduler Service initialized for automated resets & cleanup');
    // Hourly check for expired raw video cleanup
    setInterval(() => this.cleanExpiredVideos(), 60 * 60 * 1000);
  }

  async performDailyReset(): Promise<{ resets: number; freezesUsed: number }> {
    const today = new Date().toISOString().split('T')[0];
    this.logger.log(`Running daily streak evaluation for date: ${today}`);

    const users = await this.userModel.find({ isActive: true });
    let resets = 0;
    let freezesUsed = 0;

    for (const user of users) {
      if (user.lastStreakDate !== today) {
        // Missed today's submission
        if (user.streakFreeze > 0) {
          // Consume 1 streak freeze shield
          user.streakFreeze -= 1;
          user.freezeStreakProgress = 0;
          freezesUsed += 1;
          this.logger.log(`Streak freeze shield consumed for student ${user.email}`);
        } else {
          // Streak broken
          user.streak = 0;
          user.freezeStreakProgress = 0;
          resets += 1;
        }
        await user.save();
      }
    }

    return { resets, freezesUsed };
  }

  async cleanExpiredVideos(): Promise<number> {
    const now = new Date();
    const expired = await this.videoReportModel.find({
      expiresAt: { $lt: now },
      videoKey: { $ne: null },
    });

    if (expired.length === 0) return 0;

    this.logger.log(`Cleaning ${expired.length} expired raw videos from storage metadata`);
    await this.videoReportModel.updateMany(
      { expiresAt: { $lt: now } },
      { $set: { videoKey: null, frameKeys: [] } },
    );

    return expired.length;
  }
}
