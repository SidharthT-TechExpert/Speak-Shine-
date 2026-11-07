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
exports.VideoReportSchema = exports.VideoReport = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const shared_types_1 = require("@speak-shine/shared-types");
let VideoReport = class VideoReport {
};
exports.VideoReport = VideoReport;
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User', required: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], VideoReport.prototype, "userId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'Task', default: null }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], VideoReport.prototype, "taskId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'Class', default: null }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], VideoReport.prototype, "classId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], VideoReport.prototype, "phone", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: null }),
    __metadata("design:type", String)
], VideoReport.prototype, "videoKey", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [String], default: [] }),
    __metadata("design:type", Array)
], VideoReport.prototype, "frameKeys", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], VideoReport.prototype, "videoDurationSeconds", void 0);
__decorate([
    (0, mongoose_1.Prop)({
        required: true,
        enum: shared_types_1.TaskSubmissionStatus,
        default: shared_types_1.TaskSubmissionStatus.PENDING,
    }),
    __metadata("design:type", String)
], VideoReport.prototype, "status", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Object, default: null }),
    __metadata("design:type", Object)
], VideoReport.prototype, "analysis", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: null }),
    __metadata("design:type", String)
], VideoReport.prototype, "failureReason", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: () => new Date(Date.now() + 18 * 60 * 60 * 1000) }),
    __metadata("design:type", Date)
], VideoReport.prototype, "expiresAt", void 0);
exports.VideoReport = VideoReport = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true })
], VideoReport);
exports.VideoReportSchema = mongoose_1.SchemaFactory.createForClass(VideoReport);
exports.VideoReportSchema.index({ userId: 1, createdAt: -1 });
exports.VideoReportSchema.index({ classId: 1, taskId: 1 });
exports.VideoReportSchema.index({ expiresAt: 1 });
//# sourceMappingURL=video-report.schema.js.map