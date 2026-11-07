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
exports.WalletService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const user_schema_1 = require("../../database/schemas/user.schema");
const class_schema_1 = require("../../database/schemas/class.schema");
const wallet_transaction_schema_1 = require("../../database/schemas/wallet-transaction.schema");
const shared_types_1 = require("@speak-shine/shared-types");
let WalletService = class WalletService {
    constructor(userModel, classModel, transactionModel) {
        this.userModel = userModel;
        this.classModel = classModel;
        this.transactionModel = transactionModel;
    }
    async awardPrize(trainerId, dto) {
        const cls = await this.classModel.findById(dto.classId);
        if (!cls)
            throw new common_1.NotFoundException('Class not found');
        if (cls.trainerId.toString() !== trainerId) {
            throw new common_1.ForbiddenException('You can only award prizes to your classes');
        }
        const student = await this.userModel.findById(dto.studentId);
        if (!student)
            throw new common_1.NotFoundException('Student not found');
        if (student.classId?.toString() !== dto.classId) {
            throw new common_1.BadRequestException('Student does not belong to this class');
        }
        const updatedStudent = await this.userModel.findByIdAndUpdate(dto.studentId, { $inc: { walletBalance: dto.amount } }, { new: true });
        const transaction = await this.transactionModel.create({
            userId: student._id,
            type: shared_types_1.TransactionType.CREDIT,
            category: shared_types_1.TransactionCategory.CASH_PRIZE,
            amount: dto.amount,
            reason: dto.reason,
            balanceAfter: updatedStudent?.walletBalance || dto.amount,
            status: shared_types_1.TransactionStatus.COMPLETED,
            metadata: {
                classId: dto.classId,
                taskId: dto.taskId || null,
                awardedByTrainerId: trainerId,
            },
        });
        return {
            message: `Successfully awarded ₹${dto.amount} cash prize to ${student.name}`,
            transactionId: transaction._id.toString(),
            newBalance: updatedStudent?.walletBalance,
        };
    }
    async getMyTransactions(userId) {
        return this.transactionModel
            .find({ userId: new mongoose_2.Types.ObjectId(userId) })
            .sort({ createdAt: -1 })
            .lean();
    }
};
exports.WalletService = WalletService;
exports.WalletService = WalletService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(user_schema_1.User.name)),
    __param(1, (0, mongoose_1.InjectModel)(class_schema_1.Class.name)),
    __param(2, (0, mongoose_1.InjectModel)(wallet_transaction_schema_1.WalletTransaction.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model])
], WalletService);
//# sourceMappingURL=wallet.service.js.map