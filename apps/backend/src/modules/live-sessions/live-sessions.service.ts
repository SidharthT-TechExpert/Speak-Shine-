import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { AccessToken } from 'livekit-server-sdk';
import {
  LiveSession,
  LiveSessionDocument,
} from '../../database/schemas/live-session.schema';
import { Class, ClassDocument } from '../../database/schemas/class.schema';
import { User, UserDocument } from '../../database/schemas/user.schema';
import { LiveSessionStatus, Role } from '@speak-shine/shared-types';
import { CreateLiveSessionDto } from './dto/create-session.dto';

@Injectable()
export class LiveSessionsService {
  private livekitApiKey: string;
  private livekitApiSecret: string;

  constructor(
    @InjectModel(LiveSession.name)
    private liveSessionModel: Model<LiveSessionDocument>,
    @InjectModel(Class.name) private classModel: Model<ClassDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private configService: ConfigService,
  ) {
    this.livekitApiKey =
      this.configService.get<string>('LIVEKIT_API_KEY') || 'devkey';
    this.livekitApiSecret =
      this.configService.get<string>('LIVEKIT_API_SECRET') ||
      'secret_key_minimum_32_characters_long_for_security';
  }

  async createSession(trainerId: string, dto: CreateLiveSessionDto) {
    const cls = await this.classModel.findById(dto.classId);
    if (!cls) throw new NotFoundException('Class not found');
    if (cls.trainerId.toString() !== trainerId) {
      throw new ForbiddenException('You can only create sessions for your classes');
    }

    const roomName = `room_${dto.classId}_${Date.now()}`;

    const session = await this.liveSessionModel.create({
      classId: cls._id,
      trainerId: new Types.ObjectId(trainerId),
      roomName,
      title: dto.title.trim(),
      status: LiveSessionStatus.SCHEDULED,
      scheduledAt: new Date(dto.scheduledAt),
    });

    return session;
  }

  async getSessionToken(sessionId: string, userId: string) {
    const session = await this.liveSessionModel.findById(sessionId);
    if (!session) throw new NotFoundException('Live session not found');

    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const isHost = user.role === Role.TRAINER || user.role === Role.ADMIN;

    const at = new AccessToken(this.livekitApiKey, this.livekitApiSecret, {
      identity: user._id.toString(),
      name: user.name,
    });

    at.addGrant({
      roomJoin: true,
      room: session.roomName,
      canPublish: isHost || true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();

    // If session is scheduled and host is joining, mark as LIVE
    if (isHost && session.status === LiveSessionStatus.SCHEDULED) {
      session.status = LiveSessionStatus.LIVE;
      session.startedAt = new Date();
      await session.save();
    }

    // Record attendance entry if student
    if (user.role === Role.STUDENT) {
      const alreadyLogged = session.attendance.some(
        (a) => a.studentId.toString() === userId,
      );
      if (!alreadyLogged) {
        session.attendance.push({
          studentId: user._id as any,
          joinedAt: new Date(),
          durationMinutes: 0,
        });
        await session.save();
      }
    }

    return {
      token,
      roomName: session.roomName,
      livekitUrl:
        this.configService.get<string>('LIVEKIT_URL') || 'wss://live.speak-shine.online',
    };
  }

  async getClassSessions(classId: string) {
    return this.liveSessionModel
      .find({ classId: new Types.ObjectId(classId) })
      .sort({ scheduledAt: -1 })
      .lean();
  }
}
