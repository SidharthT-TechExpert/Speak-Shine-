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
exports.LiveSessionsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const shared_types_1 = require("@speak-shine/shared-types");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const roles_guard_1 = require("../../common/guards/roles.guard");
const live_sessions_service_1 = require("./live-sessions.service");
const create_session_dto_1 = require("./dto/create-session.dto");
let LiveSessionsController = class LiveSessionsController {
    constructor(liveSessionsService) {
        this.liveSessionsService = liveSessionsService;
    }
    async createSession(trainerId, dto) {
        return this.liveSessionsService.createSession(trainerId, dto);
    }
    async getSessionToken(sessionId, userId) {
        return this.liveSessionsService.getSessionToken(sessionId, userId);
    }
    async getClassSessions(classId) {
        return this.liveSessionsService.getClassSessions(classId);
    }
};
exports.LiveSessionsController = LiveSessionsController;
__decorate([
    (0, roles_decorator_1.Roles)(shared_types_1.Role.TRAINER),
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Trainer schedules a new LiveKit live video room' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_session_dto_1.CreateLiveSessionDto]),
    __metadata("design:returntype", Promise)
], LiveSessionsController.prototype, "createSession", null);
__decorate([
    (0, common_1.Post)(':id/join-token'),
    (0, swagger_1.ApiOperation)({ summary: 'Generate participant LiveKit WebRTC access token' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], LiveSessionsController.prototype, "getSessionToken", null);
__decorate([
    (0, common_1.Get)('class/:classId'),
    (0, swagger_1.ApiOperation)({ summary: 'List live sessions for a class' }),
    __param(0, (0, common_1.Param)('classId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], LiveSessionsController.prototype, "getClassSessions", null);
exports.LiveSessionsController = LiveSessionsController = __decorate([
    (0, swagger_1.ApiTags)('Live Sessions'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, common_1.Controller)('live-sessions'),
    __metadata("design:paramtypes", [live_sessions_service_1.LiveSessionsService])
], LiveSessionsController);
//# sourceMappingURL=live-sessions.controller.js.map