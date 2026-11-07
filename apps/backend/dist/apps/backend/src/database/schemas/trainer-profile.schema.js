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
exports.TrainerProfileSchema = exports.TrainerProfile = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const shared_types_1 = require("@speak-shine/shared-types");
let TrainerProfile = class TrainerProfile {
};
exports.TrainerProfile = TrainerProfile;
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User', required: true, unique: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], TrainerProfile.prototype, "userId", void 0);
__decorate([
    (0, mongoose_1.Prop)({
        required: true,
        enum: shared_types_1.TrainerApprovalStatus,
        default: shared_types_1.TrainerApprovalStatus.PENDING_APPROVAL,
    }),
    __metadata("design:type", String)
], TrainerProfile.prototype, "approvalStatus", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: null }),
    __metadata("design:type", String)
], TrainerProfile.prototype, "bio", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [String], default: [] }),
    __metadata("design:type", Array)
], TrainerProfile.prototype, "qualifications", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: null }),
    __metadata("design:type", Date)
], TrainerProfile.prototype, "approvedAt", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User', default: null }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], TrainerProfile.prototype, "approvedBy", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: null }),
    __metadata("design:type", String)
], TrainerProfile.prototype, "rejectionReason", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], TrainerProfile.prototype, "activeClassCount", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], TrainerProfile.prototype, "totalStudentsTaught", void 0);
exports.TrainerProfile = TrainerProfile = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true })
], TrainerProfile);
exports.TrainerProfileSchema = mongoose_1.SchemaFactory.createForClass(TrainerProfile);
exports.TrainerProfileSchema.index({ userId: 1 });
exports.TrainerProfileSchema.index({ approvalStatus: 1 });
//# sourceMappingURL=trainer-profile.schema.js.map