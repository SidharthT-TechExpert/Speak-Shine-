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
exports.LiveSessionSchema = exports.LiveSession = exports.AttendanceRecordSchema = exports.AttendanceRecord = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const shared_types_1 = require("@speak-shine/shared-types");
let AttendanceRecord = class AttendanceRecord {
};
exports.AttendanceRecord = AttendanceRecord;
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User', required: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], AttendanceRecord.prototype, "studentId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Date)
], AttendanceRecord.prototype, "joinedAt", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: null }),
    __metadata("design:type", Date)
], AttendanceRecord.prototype, "leftAt", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], AttendanceRecord.prototype, "durationMinutes", void 0);
exports.AttendanceRecord = AttendanceRecord = __decorate([
    (0, mongoose_1.Schema)({ _id: false })
], AttendanceRecord);
exports.AttendanceRecordSchema = mongoose_1.SchemaFactory.createForClass(AttendanceRecord);
let LiveSession = class LiveSession {
};
exports.LiveSession = LiveSession;
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'Class', required: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], LiveSession.prototype, "classId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User', required: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], LiveSession.prototype, "trainerId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, unique: true, trim: true }),
    __metadata("design:type", String)
], LiveSession.prototype, "roomName", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, trim: true }),
    __metadata("design:type", String)
], LiveSession.prototype, "title", void 0);
__decorate([
    (0, mongoose_1.Prop)({
        required: true,
        type: String,
        enum: Object.values(shared_types_1.LiveSessionStatus),
        default: shared_types_1.LiveSessionStatus.SCHEDULED,
    }),
    __metadata("design:type", String)
], LiveSession.prototype, "status", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Date)
], LiveSession.prototype, "scheduledAt", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: null }),
    __metadata("design:type", Date)
], LiveSession.prototype, "startedAt", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: null }),
    __metadata("design:type", Date)
], LiveSession.prototype, "endedAt", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [exports.AttendanceRecordSchema], default: [] }),
    __metadata("design:type", Array)
], LiveSession.prototype, "attendance", void 0);
exports.LiveSession = LiveSession = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true })
], LiveSession);
exports.LiveSessionSchema = mongoose_1.SchemaFactory.createForClass(LiveSession);
exports.LiveSessionSchema.index({ classId: 1, scheduledAt: -1 });
exports.LiveSessionSchema.index({ trainerId: 1 });
//# sourceMappingURL=live-session.schema.js.map