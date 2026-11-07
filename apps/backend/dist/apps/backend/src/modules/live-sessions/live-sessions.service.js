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
exports.LiveSessionsService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const config_1 = require("@nestjs/config");
const livekit_server_sdk_1 = require("livekit-server-sdk");
const live_session_schema_1 = require("../../database/schemas/live-session.schema");
const class_schema_1 = require("../../database/schemas/class.schema");
const user_schema_1 = require("../../database/schemas/user.schema");
const shared_types_1 = require("@speak-shine/shared-types");
let LiveSessionsService = class LiveSessionsService {
    constructor(liveSessionModel, classModel, userModel, configService) {
        this.liveSessionModel = liveSessionModel;
        this.classModel = classModel;
        this.userModel = userModel;
        this.configService = configService;
        this.livekitApiKey =
            this.configService.get('LIVEKIT_API_KEY') || 'devkey';
        this.livekitApiSecret =
            this.configService.get('LIVEKIT_API_SECRET') ||
                'secret_key_minimum_32_characters_long_for_security';
    }
    async createSession(trainerId, dto) {
        const cls = await this.classModel.findById(dto.classId);
        if (!cls)
            throw new common_1.NotFoundException('Class not found');
        if (cls.trainerId.toString() !== trainerId) {
            throw new common_1.ForbiddenException('You can only create sessions for your classes');
        }
        const roomName = `room_${dto.classId}_${Date.now()}`;
        const session = await this.liveSessionModel.create({
            classId: cls._id,
            trainerId: new mongoose_2.Types.ObjectId(trainerId),
            roomName,
            title: dto.title.trim(),
            status: shared_types_1.LiveSessionStatus.SCHEDULED,
            scheduledAt: new Date(dto.scheduledAt),
        });
        return session;
    }
    async getSessionToken(sessionId, userId) {
        const session = await this.liveSessionModel.findById(sessionId);
        if (!session)
            throw new common_1.NotFoundException('Live session not found');
        const user = await this.userModel.findById(userId);
        if (!user)
            throw new common_1.NotFoundException('User not found');
        if (session.status === shared_types_1.LiveSessionStatus.ENDED) {
            throw new common_1.BadRequestException('This live session has already ended');
        }
        if (user.role === shared_types_1.Role.STUDENT &&
            user.classId?.toString() !== session.classId.toString()) {
            throw new common_1.ForbiddenException('You are not enrolled in the class for this live session');
        }
        const isHost = user.role === shared_types_1.Role.TRAINER || user.role === shared_types_1.Role.ADMIN;
        const at = new livekit_server_sdk_1.AccessToken(this.livekitApiKey, this.livekitApiSecret, {
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
        if (isHost && session.status === shared_types_1.LiveSessionStatus.SCHEDULED) {
            session.status = shared_types_1.LiveSessionStatus.LIVE;
            session.startedAt = new Date();
            await session.save();
        }
        if (user.role === shared_types_1.Role.STUDENT) {
            const alreadyLogged = session.attendance.some((a) => a.studentId.toString() === userId);
            if (!alreadyLogged) {
                session.attendance.push({
                    studentId: user._id,
                    joinedAt: new Date(),
                    durationMinutes: 0,
                });
                await session.save();
            }
        }
        return {
            token,
            roomName: session.roomName,
            livekitUrl: this.configService.get('LIVEKIT_URL') || 'wss://live.speak-shine.online',
        };
    }
    async getClassSessions(classId) {
        return this.liveSessionModel
            .find({ classId: new mongoose_2.Types.ObjectId(classId) })
            .sort({ scheduledAt: -1 })
            .lean();
    }
};
exports.LiveSessionsService = LiveSessionsService;
exports.LiveSessionsService = LiveSessionsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(live_session_schema_1.LiveSession.name)),
    __param(1, (0, mongoose_1.InjectModel)(class_schema_1.Class.name)),
    __param(2, (0, mongoose_1.InjectModel)(user_schema_1.User.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        config_1.ConfigService])
], LiveSessionsService);
//# sourceMappingURL=live-sessions.service.js.map