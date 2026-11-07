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
exports.StudentsService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const user_schema_1 = require("../../database/schemas/user.schema");
const class_schema_1 = require("../../database/schemas/class.schema");
let StudentsService = class StudentsService {
    constructor(userModel, classModel) {
        this.userModel = userModel;
        this.classModel = classModel;
    }
    async joinClass(studentId, dto) {
        const student = await this.userModel.findById(studentId);
        if (!student) {
            throw new common_1.NotFoundException('Student account not found');
        }
        if (student.classId) {
            throw new common_1.ConflictException('You are already enrolled in a class. Please contact your trainer or support to switch classes.');
        }
        const cls = await this.classModel.findOne({
            classCode: dto.classCode.toUpperCase().trim(),
        });
        if (!cls) {
            throw new common_1.NotFoundException(`Class with code "${dto.classCode}" does not exist`);
        }
        student.classId = cls._id;
        student.trainerId = cls.trainerId;
        await student.save();
        await this.classModel.updateOne({ _id: cls._id }, { $inc: { studentCount: 1 } });
        return {
            message: `Successfully joined ${cls.title}!`,
            classId: cls._id.toString(),
            classTitle: cls.title,
        };
    }
    async getMyClass(studentId) {
        const student = await this.userModel
            .findById(studentId)
            .populate('classId')
            .populate('trainerId', 'name email phone avatarUrl')
            .lean();
        if (!student || !student.classId) {
            return { enrolled: false, class: null };
        }
        return {
            enrolled: true,
            class: student.classId,
            trainer: student.trainerId,
        };
    }
    async getMyProgress(studentId) {
        const student = await this.userModel.findById(studentId).lean();
        if (!student) {
            throw new common_1.NotFoundException('Student account not found');
        }
        return {
            streak: student.streak,
            lastStreakDate: student.lastStreakDate,
            streakFreeze: student.streakFreeze,
            freezeStreakProgress: student.freezeStreakProgress,
            monthlyScore: student.monthlyScore,
            earnedBadges: student.earnedBadges,
            walletBalance: student.walletBalance,
        };
    }
};
exports.StudentsService = StudentsService;
exports.StudentsService = StudentsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(user_schema_1.User.name)),
    __param(1, (0, mongoose_1.InjectModel)(class_schema_1.Class.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model])
], StudentsService);
//# sourceMappingURL=students.service.js.map