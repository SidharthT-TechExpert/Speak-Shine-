import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { User, UserSchema } from './schemas/user.schema';
import {
  TrainerProfile,
  TrainerProfileSchema,
} from './schemas/trainer-profile.schema';
import { Class, ClassSchema } from './schemas/class.schema';
import { Task, TaskSchema } from './schemas/task.schema';
import { VideoReport, VideoReportSchema } from './schemas/video-report.schema';
import {
  WalletTransaction,
  WalletTransactionSchema,
} from './schemas/wallet-transaction.schema';
import {
  LiveSession,
  LiveSessionSchema,
} from './schemas/live-session.schema';
import {
  HelpTicket,
  HelpTicketSchema,
} from './schemas/help-ticket.schema';
import {
  Notification,
  NotificationSchema,
} from './schemas/notification.schema';

const SCHEMAS = [
  { name: User.name, schema: UserSchema },
  { name: TrainerProfile.name, schema: TrainerProfileSchema },
  { name: Class.name, schema: ClassSchema },
  { name: Task.name, schema: TaskSchema },
  { name: VideoReport.name, schema: VideoReportSchema },
  { name: WalletTransaction.name, schema: WalletTransactionSchema },
  { name: LiveSession.name, schema: LiveSessionSchema },
  { name: HelpTicket.name, schema: HelpTicketSchema },
  { name: Notification.name, schema: NotificationSchema },
];

@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri:
          configService.get<string>('MONGODB_URI') ||
          'mongodb://localhost:27017/speak-shine',
      }),
    }),
    MongooseModule.forFeature(SCHEMAS),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule {}
