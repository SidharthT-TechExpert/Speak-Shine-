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
exports.ClassesService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const argon2 = require("argon2");
const class_schema_1 = require("../../database/schemas/class.schema");
const user_schema_1 = require("../../database/schemas/user.schema");
const shared_types_1 = require("@speak-shine/shared-types");
let ClassesService = class ClassesService {
    constructor(classModel, userModel) {
        this.classModel = classModel;
        this.userModel = userModel;
    }
    async generateUniqueClassCode() {
        let code = '';
        let exists = true;
        while (exists) {
            const num = Math.floor(1000 + Math.random() * 9000);
            code = `SHINE-${num}`;
            const found = await this.classModel.findOne({ classCode: code }).lean();
            if (!found)
                exists = false;
        }
        return code;
    }
    async createClass(trainerId, dto) {
        const classCode = await this.generateUniqueClassCode();
        const newClass = await this.classModel.create({
            title: dto.title.trim(),
            description: dto.description?.trim(),
            classCode,
            trainerId: new mongoose_2.Types.ObjectId(trainerId),
        });
        return newClass;
    }
    async getTrainerClasses(trainerId) {
        return this.classModel
            .find({ trainerId: new mongoose_2.Types.ObjectId(trainerId) })
            .sort({ createdAt: -1 })
            .lean();
    }
    async getClassDetails(classId, trainerId) {
        const cls = await this.classModel.findById(classId).lean();
        if (!cls) {
            throw new common_1.NotFoundException('Class not found');
        }
        if (cls.trainerId.toString() !== trainerId) {
            throw new common_1.ForbiddenException('You do not own this class');
        }
        return cls;
    }
    async getClassStudents(classId, trainerId) {
        await this.getClassDetails(classId, trainerId);
        return this.userModel
            .find({ classId: new mongoose_2.Types.ObjectId(classId) })
            .select('name email phone streak monthlyScore walletBalance createdAt')
            .sort({ streak: -1, monthlyScore: -1 })
            .lean();
    }
    async preEnrollStudent(classId, trainerId, dto) {
        const cls = await this.getClassDetails(classId, trainerId);
        let existingUser = await this.userModel.findOne({
            $or: [
                { email: dto.email.toLowerCase().trim() },
                ...(dto.phone ? [{ phone: dto.phone.trim() }] : []),
            ],
        });
        if (existingUser) {
            if (existingUser.classId?.toString() === classId) {
                throw new common_1.ConflictException('Student is already enrolled in this class');
            }
            if (!existingUser.classId) {
                existingUser.classId = cls._id;
                existingUser.trainerId = new mongoose_2.Types.ObjectId(trainerId);
                await existingUser.save();
                await this.classModel.updateOne({ _id: cls._id }, { $inc: { studentCount: 1 } });
                return {
                    message: 'Existing student enrolled in class successfully',
                    studentId: existingUser._id.toString(),
                };
            }
            throw new common_1.ConflictException('Student is already enrolled in another class');
        }
        const temporaryPlaceholder = Math.random().toString(36).substring(2, 12);
        const passwordHash = await argon2.hash(temporaryPlaceholder);
        const activationOtp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const newStudent = await this.userModel.create({
            name: dto.name.trim(),
            email: dto.email.toLowerCase().trim(),
            phone: dto.phone?.trim() || undefined,
            passwordHash,
            role: shared_types_1.Role.STUDENT,
            classId: cls._id,
            trainerId: new mongoose_2.Types.ObjectId(trainerId),
            resetPasswordOtp: activationOtp,
            resetPasswordExpiresAt: expiresAt,
        });
        await this.classModel.updateOne({ _id: cls._id }, { $inc: { studentCount: 1 } });
        console.log(`[ClassesService] Student invited: ${dto.email}, Activation OTP: ${activationOtp}`);
        return {
            message: 'Student successfully enrolled. Student can log in via Forgot Password / Activation OTP.',
            studentId: newStudent._id.toString(),
            activationOtp,
        };
    }
};
exports.ClassesService = ClassesService;
exports.ClassesService = ClassesService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(class_schema_1.Class.name)),
    __param(1, (0, mongoose_1.InjectModel)(user_schema_1.User.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model])
], ClassesService);
//# sourceMappingURL=classes.service.js.map