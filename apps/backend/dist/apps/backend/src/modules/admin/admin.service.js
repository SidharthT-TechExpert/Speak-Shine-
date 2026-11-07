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
exports.AdminService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const user_schema_1 = require("../../database/schemas/user.schema");
const trainer_profile_schema_1 = require("../../database/schemas/trainer-profile.schema");
const class_schema_1 = require("../../database/schemas/class.schema");
const wallet_transaction_schema_1 = require("../../database/schemas/wallet-transaction.schema");
const shared_types_1 = require("@speak-shine/shared-types");
let AdminService = class AdminService {
    constructor(userModel, trainerProfileModel, classModel, walletTransactionModel) {
        this.userModel = userModel;
        this.trainerProfileModel = trainerProfileModel;
        this.classModel = classModel;
        this.walletTransactionModel = walletTransactionModel;
    }
    async listTrainers(status) {
        const filter = status ? { approvalStatus: status } : {};
        const profiles = await this.trainerProfileModel
            .find(filter)
            .populate('userId', 'name email phone createdAt isActive')
            .sort({ createdAt: -1 })
            .lean();
        return profiles.map((p) => ({
            trainerProfileId: p._id.toString(),
            userId: p.userId?._id?.toString(),
            name: p.userId?.name,
            email: p.userId?.email,
            phone: p.userId?.phone,
            approvalStatus: p.approvalStatus,
            qualifications: p.qualifications,
            bio: p.bio,
            appliedAt: p.createdAt,
            approvedAt: p.approvedAt,
        }));
    }
    async updateTrainerApproval(trainerUserId, adminId, dto) {
        const user = await this.userModel.findById(trainerUserId);
        if (!user || user.role !== shared_types_1.Role.TRAINER) {
            throw new common_1.NotFoundException('Trainer not found');
        }
        const profile = await this.trainerProfileModel.findOne({
            userId: user._id,
        });
        if (!profile) {
            throw new common_1.NotFoundException('Trainer profile not found');
        }
        profile.approvalStatus = dto.status;
        if (dto.status === shared_types_1.TrainerApprovalStatus.ACTIVE) {
            profile.approvedAt = new Date();
            profile.approvedBy = new mongoose_2.Types.ObjectId(adminId);
        }
        else if (dto.status === shared_types_1.TrainerApprovalStatus.REJECTED) {
            profile.rejectionReason = dto.reviewNotes;
        }
        await profile.save();
        return {
            message: `Trainer account status updated to ${dto.status}`,
            trainerId: user._id.toString(),
            approvalStatus: profile.approvalStatus,
        };
    }
    async getPlatformOverview() {
        const [totalStudents, totalTrainers, totalClasses, activeClasses] = await Promise.all([
            this.userModel.countDocuments({ role: shared_types_1.Role.STUDENT }),
            this.trainerProfileModel.countDocuments({
                approvalStatus: shared_types_1.TrainerApprovalStatus.ACTIVE,
            }),
            this.classModel.countDocuments(),
            this.classModel.countDocuments({ status: 'ACTIVE' }),
        ]);
        const pendingTrainerCount = await this.trainerProfileModel.countDocuments({
            approvalStatus: shared_types_1.TrainerApprovalStatus.PENDING_APPROVAL,
        });
        return {
            totalStudents,
            totalTrainers,
            pendingTrainerApprovals: pendingTrainerCount,
            totalClasses,
            activeClasses,
        };
    }
    async listAllClasses() {
        return this.classModel
            .find()
            .populate('trainerId', 'name email phone')
            .sort({ createdAt: -1 })
            .lean();
    }
};
exports.AdminService = AdminService;
exports.AdminService = AdminService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(user_schema_1.User.name)),
    __param(1, (0, mongoose_1.InjectModel)(trainer_profile_schema_1.TrainerProfile.name)),
    __param(2, (0, mongoose_1.InjectModel)(class_schema_1.Class.name)),
    __param(3, (0, mongoose_1.InjectModel)(wallet_transaction_schema_1.WalletTransaction.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model])
], AdminService);
//# sourceMappingURL=admin.service.js.map