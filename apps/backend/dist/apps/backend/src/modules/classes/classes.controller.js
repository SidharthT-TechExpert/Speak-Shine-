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
exports.ClassesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const shared_types_1 = require("@speak-shine/shared-types");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const roles_guard_1 = require("../../common/guards/roles.guard");
const classes_service_1 = require("./classes.service");
const create_class_dto_1 = require("./dto/create-class.dto");
const pre_enroll_student_dto_1 = require("./dto/pre-enroll-student.dto");
let ClassesController = class ClassesController {
    constructor(classesService) {
        this.classesService = classesService;
    }
    async createClass(trainerId, dto) {
        return this.classesService.createClass(trainerId, dto);
    }
    async getTrainerClasses(trainerId) {
        return this.classesService.getTrainerClasses(trainerId);
    }
    async getClassDetails(trainerId, classId) {
        return this.classesService.getClassDetails(classId, trainerId);
    }
    async getClassStudents(trainerId, classId) {
        return this.classesService.getClassStudents(classId, trainerId);
    }
    async preEnrollStudent(trainerId, classId, dto) {
        return this.classesService.preEnrollStudent(classId, trainerId, dto);
    }
};
exports.ClassesController = ClassesController;
__decorate([
    (0, roles_decorator_1.Roles)(shared_types_1.Role.TRAINER),
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create a new class with auto-generated Class Code' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_class_dto_1.CreateClassDto]),
    __metadata("design:returntype", Promise)
], ClassesController.prototype, "createClass", null);
__decorate([
    (0, roles_decorator_1.Roles)(shared_types_1.Role.TRAINER),
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'List all classes created by authenticated trainer' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ClassesController.prototype, "getTrainerClasses", null);
__decorate([
    (0, roles_decorator_1.Roles)(shared_types_1.Role.TRAINER),
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Get class details by ID' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], ClassesController.prototype, "getClassDetails", null);
__decorate([
    (0, roles_decorator_1.Roles)(shared_types_1.Role.TRAINER),
    (0, common_1.Get)(':id/students'),
    (0, swagger_1.ApiOperation)({ summary: 'List student roster for a class' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], ClassesController.prototype, "getClassStudents", null);
__decorate([
    (0, roles_decorator_1.Roles)(shared_types_1.Role.TRAINER),
    (0, common_1.Post)(':id/students'),
    (0, swagger_1.ApiOperation)({ summary: 'Pre-enroll a student into a class' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, pre_enroll_student_dto_1.PreEnrollStudentDto]),
    __metadata("design:returntype", Promise)
], ClassesController.prototype, "preEnrollStudent", null);
exports.ClassesController = ClassesController = __decorate([
    (0, swagger_1.ApiTags)('Classes'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, common_1.Controller)('trainers/classes'),
    __metadata("design:paramtypes", [classes_service_1.ClassesService])
], ClassesController);
//# sourceMappingURL=classes.controller.js.map