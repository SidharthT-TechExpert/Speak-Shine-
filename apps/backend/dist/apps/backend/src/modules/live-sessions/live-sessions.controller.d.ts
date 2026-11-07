import { LiveSessionsService } from './live-sessions.service';
import { CreateLiveSessionDto } from './dto/create-session.dto';
export declare class LiveSessionsController {
    private readonly liveSessionsService;
    constructor(liveSessionsService: LiveSessionsService);
    createSession(trainerId: string, dto: CreateLiveSessionDto): Promise<import("mongoose").Document<unknown, {}, import("../../database/schemas/live-session.schema").LiveSessionDocument, {}, {}> & import("../../database/schemas/live-session.schema").LiveSession & import("mongoose").Document<import("mongoose").Types.ObjectId, any, any, Record<string, any>, {}> & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    }>;
    getSessionToken(sessionId: string, userId: string): Promise<{
        token: string;
        roomName: string;
        livekitUrl: string;
    }>;
    getClassSessions(classId: string): Promise<(import("mongoose").FlattenMaps<import("../../database/schemas/live-session.schema").LiveSessionDocument> & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    })[]>;
}
