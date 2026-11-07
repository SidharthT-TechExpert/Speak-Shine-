import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { LiveSession, LiveSessionDocument } from '../../database/schemas/live-session.schema';
import { ClassDocument } from '../../database/schemas/class.schema';
import { UserDocument } from '../../database/schemas/user.schema';
import { CreateLiveSessionDto } from './dto/create-session.dto';
export declare class LiveSessionsService {
    private liveSessionModel;
    private classModel;
    private userModel;
    private configService;
    private livekitApiKey;
    private livekitApiSecret;
    constructor(liveSessionModel: Model<LiveSessionDocument>, classModel: Model<ClassDocument>, userModel: Model<UserDocument>, configService: ConfigService);
    createSession(trainerId: string, dto: CreateLiveSessionDto): Promise<import("mongoose").Document<unknown, {}, LiveSessionDocument, {}, {}> & LiveSession & import("mongoose").Document<Types.ObjectId, any, any, Record<string, any>, {}> & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    }>;
    getSessionToken(sessionId: string, userId: string): Promise<{
        token: string;
        roomName: string;
        livekitUrl: string;
    }>;
    getClassSessions(classId: string): Promise<(import("mongoose").FlattenMaps<LiveSessionDocument> & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    })[]>;
}
