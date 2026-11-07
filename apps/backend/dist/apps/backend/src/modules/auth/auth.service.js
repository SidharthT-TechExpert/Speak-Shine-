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
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const jwt_1 = require("@nestjs/jwt");
const argon2 = require("argon2");
const user_schema_1 = require("../../database/schemas/user.schema");
const trainer_profile_schema_1 = require("../../database/schemas/trainer-profile.schema");
const class_schema_1 = require("../../database/schemas/class.schema");
const shared_types_1 = require("@speak-shine/shared-types");
let AuthService = class AuthService {
    constructor(userModel, trainerProfileModel, classModel, jwtService) {
        this.userModel = userModel;
        this.trainerProfileModel = trainerProfileModel;
        this.classModel = classModel;
        this.jwtService = jwtService;
    }
    async login(loginDto) {
        const { identifier, password } = loginDto;
        const user = await this.userModel.findOne({
            $or: [
                { email: identifier.toLowerCase().trim() },
                { phone: identifier.trim() },
            ],
        });
        if (!user) {
            throw new common_1.UnauthorizedException('Invalid email/phone or password');
        }
        const isMatch = await argon2.verify(user.passwordHash, password);
        if (!isMatch) {
            throw new common_1.UnauthorizedException('Invalid email/phone or password');
        }
        if (!user.isActive) {
            throw new common_1.UnauthorizedException('Your account has been deactivated');
        }
        let trainerStatus = undefined;
        if (user.role === shared_types_1.Role.TRAINER) {
            const profile = await this.trainerProfileModel.findOne({ userId: user._id });
            trainerStatus = profile?.approvalStatus || shared_types_1.TrainerApprovalStatus.PENDING_APPROVAL;
        }
        const payload = {
            sub: user._id.toString(),
            email: user.email,
            role: user.role,
            classId: user.classId ? user.classId.toString() : undefined,
        };
        const accessToken = this.jwtService.sign(payload);
        return {
            accessToken,
            user: {
                id: user._id.toString(),
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                classId: user.classId?.toString(),
                trainerApprovalStatus: trainerStatus,
                streak: user.streak,
                monthlyScore: user.monthlyScore,
                walletBalance: user.walletBalance,
            },
        };
    }
    async registerStudent(dto) {
        const existing = await this.userModel.findOne({
            $or: [
                { email: dto.email.toLowerCase().trim() },
                ...(dto.phone ? [{ phone: dto.phone.trim() }] : []),
            ],
        });
        if (existing) {
            throw new common_1.ConflictException('A user with this email or phone already exists');
        }
        let classDoc = null;
        if (dto.classCode) {
            classDoc = await this.classModel.findOne({
                classCode: dto.classCode.toUpperCase().trim(),
            });
            if (!classDoc) {
                throw new common_1.NotFoundException(`Class with code ${dto.classCode} was not found`);
            }
        }
        let referrerDoc = null;
        if (dto.referralCode) {
            referrerDoc = await this.userModel.findOne({
                referralCode: dto.referralCode.trim(),
            });
        }
        const passwordHash = await argon2.hash(dto.password);
        const userReferralCode = `SPK${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
        const newUser = await this.userModel.create({
            name: dto.name.trim(),
            email: dto.email.toLowerCase().trim(),
            phone: dto.phone?.trim() || null,
            passwordHash,
            role: shared_types_1.Role.STUDENT,
            classId: classDoc ? classDoc._id : null,
            trainerId: classDoc ? classDoc.trainerId : null,
            referralCode: userReferralCode,
            referredBy: referrerDoc ? referrerDoc._id : null,
        });
        if (classDoc) {
            await this.classModel.updateOne({ _id: classDoc._id }, { $inc: { studentCount: 1 } });
        }
        const payload = {
            sub: newUser._id.toString(),
            email: newUser.email,
            role: newUser.role,
            classId: classDoc ? classDoc._id.toString() : undefined,
        };
        return {
            accessToken: this.jwtService.sign(payload),
            user: {
                id: newUser._id.toString(),
                name: newUser.name,
                email: newUser.email,
                phone: newUser.phone,
                role: newUser.role,
                classId: newUser.classId?.toString(),
                streak: newUser.streak,
                monthlyScore: newUser.monthlyScore,
            },
        };
    }
    async registerTrainer(dto) {
        const existing = await this.userModel.findOne({
            $or: [
                { email: dto.email.toLowerCase().trim() },
                { phone: dto.phone.trim() },
            ],
        });
        if (existing) {
            throw new common_1.ConflictException('A user with this email or phone already exists');
        }
        const passwordHash = await argon2.hash(dto.password);
        const newUser = await this.userModel.create({
            name: dto.name.trim(),
            email: dto.email.toLowerCase().trim(),
            phone: dto.phone.trim(),
            passwordHash,
            role: shared_types_1.Role.TRAINER,
        });
        await this.trainerProfileModel.create({
            userId: newUser._id,
            approvalStatus: shared_types_1.TrainerApprovalStatus.PENDING_APPROVAL,
            bio: dto.bio || null,
            qualifications: dto.qualifications,
        });
        return {
            message: 'Trainer registration submitted successfully. Your account is pending administrative approval.',
            trainerId: newUser._id.toString(),
            approvalStatus: shared_types_1.TrainerApprovalStatus.PENDING_APPROVAL,
        };
    }
    async forgotPassword(dto) {
        const user = await this.userModel.findOne({
            $or: [
                { email: dto.identifier.toLowerCase().trim() },
                { phone: dto.identifier.trim() },
            ],
        });
        if (!user) {
            return {
                message: 'If an account exists, a 6-digit verification code has been dispatched.',
            };
        }
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
        await this.userModel.updateOne({ _id: user._id }, {
            $set: {
                resetPasswordOtp: otp,
                resetPasswordExpiresAt: expiresAt,
            },
        });
        console.log(`[AuthService] Password Reset OTP for ${user.email}: ${otp}`);
        return {
            message: 'If an account exists, a 6-digit verification code has been dispatched.',
        };
    }
    async resetPassword(dto) {
        const user = await this.userModel.findOne({
            $or: [
                { email: dto.identifier.toLowerCase().trim() },
                { phone: dto.identifier.trim() },
            ],
        });
        if (!user ||
            !user.resetPasswordOtp ||
            user.resetPasswordOtp !== dto.otp ||
            !user.resetPasswordExpiresAt ||
            new Date() > user.resetPasswordExpiresAt) {
            throw new common_1.BadRequestException('Invalid or expired verification code');
        }
        const passwordHash = await argon2.hash(dto.newPassword);
        await this.userModel.updateOne({ _id: user._id }, {
            $set: {
                passwordHash,
                resetPasswordOtp: null,
                resetPasswordExpiresAt: null,
            },
        });
        return {
            message: 'Password has been successfully updated. You may now log in.',
        };
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(user_schema_1.User.name)),
    __param(1, (0, mongoose_1.InjectModel)(trainer_profile_schema_1.TrainerProfile.name)),
    __param(2, (0, mongoose_1.InjectModel)(class_schema_1.Class.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        jwt_1.JwtService])
], AuthService);
//# sourceMappingURL=auth.service.js.map