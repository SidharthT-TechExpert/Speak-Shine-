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
Object.defineProperty(exports, "__esModule", { value: true });
exports.WalletTransactionSchema = exports.WalletTransaction = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const shared_types_1 = require("@speak-shine/shared-types");
let WalletTransaction = class WalletTransaction {
};
exports.WalletTransaction = WalletTransaction;
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User', required: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], WalletTransaction.prototype, "userId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, enum: shared_types_1.TransactionType }),
    __metadata("design:type", String)
], WalletTransaction.prototype, "type", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, enum: shared_types_1.TransactionCategory }),
    __metadata("design:type", String)
], WalletTransaction.prototype, "category", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, min: 0 }),
    __metadata("design:type", Number)
], WalletTransaction.prototype, "amount", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], WalletTransaction.prototype, "reason", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Number)
], WalletTransaction.prototype, "balanceAfter", void 0);
__decorate([
    (0, mongoose_1.Prop)({
        required: true,
        enum: shared_types_1.TransactionStatus,
        default: shared_types_1.TransactionStatus.COMPLETED,
    }),
    __metadata("design:type", String)
], WalletTransaction.prototype, "status", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Object, default: null }),
    __metadata("design:type", Object)
], WalletTransaction.prototype, "metadata", void 0);
exports.WalletTransaction = WalletTransaction = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true })
], WalletTransaction);
exports.WalletTransactionSchema = mongoose_1.SchemaFactory.createForClass(WalletTransaction);
exports.WalletTransactionSchema.index({ userId: 1, createdAt: -1 });
exports.WalletTransactionSchema.index({ status: 1 });
//# sourceMappingURL=wallet-transaction.schema.js.map