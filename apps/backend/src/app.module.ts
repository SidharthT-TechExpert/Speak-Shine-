import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { ClassesModule } from './modules/classes/classes.module';
import { AdminModule } from './modules/admin/admin.module';
import { StudentsModule } from './modules/students/students.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { VideosModule } from './modules/videos/videos.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { LiveSessionsModule } from './modules/live-sessions/live-sessions.module';
import { HelpTicketsModule } from './modules/help-tickets/help-tickets.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    DatabaseModule,
    AuthModule,
    ClassesModule,
    AdminModule,
    StudentsModule,
    TasksModule,
    VideosModule,
    WalletModule,
    LiveSessionsModule,
    HelpTicketsModule,
    NotificationsModule,
    SchedulerModule,
  ],
})
export class AppModule {}
