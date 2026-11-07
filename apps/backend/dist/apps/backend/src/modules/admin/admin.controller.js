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
exports.AdminController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const shared_types_1 = require("@speak-shine/shared-types");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const roles_guard_1 = require("../../common/guards/roles.guard");
const admin_service_1 = require("./admin.service");
const approve_trainer_dto_1 = require("./dto/approve-trainer.dto");
let AdminController = class AdminController {
    constructor(adminService) {
        this.adminService = adminService;
    }
    async getPlatformOverview() {
        return this.adminService.getPlatformOverview();
    }
    async listTrainers(status) {
        return this.adminService.listTrainers(status);
    }
    async updateTrainerApproval(trainerUserId, adminId, dto) {
        return this.adminService.updateTrainerApproval(trainerUserId, adminId, dto);
    }
    async listAllClasses() {
        return this.adminService.listAllClasses();
    }
};
exports.AdminController = AdminController;
__decorate([
    (0, common_1.Get)('overview'),
    (0, swagger_1.ApiOperation)({ summary: 'Platform telemetry and count summaries' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getPlatformOverview", null);
__decorate([
    (0, common_1.Get)('trainers'),
    (0, swagger_1.ApiQuery)({
        name: 'status',
        enum: shared_types_1.TrainerApprovalStatus,
        required: false,
    }),
    (0, swagger_1.ApiOperation)({ summary: 'List trainers filtered by status' }),
    __param(0, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "listTrainers", null);
__decorate([
    (0, common_1.Patch)('trainers/:id/approval'),
    (0, swagger_1.ApiOperation)({ summary: 'Approve, reject, or suspend a trainer application' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, approve_trainer_dto_1.ApproveTrainerDto]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "updateTrainerApproval", null);
__decorate([
    (0, common_1.Get)('classes'),
    (0, swagger_1.ApiOperation)({ summary: 'List all classes across the platform' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "listAllClasses", null);
exports.AdminController = AdminController = __decorate([
    (0, swagger_1.ApiTags)('Admin'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(shared_types_1.Role.ADMIN),
    (0, common_1.Controller)('admin'),
    __metadata("design:paramtypes", [admin_service_1.AdminService])
], AdminController);
//# sourceMappingURL=admin.controller.js.map