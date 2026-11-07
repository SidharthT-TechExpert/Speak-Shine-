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
exports.HelpTicketSchema = exports.HelpTicket = exports.TicketMessageSchema = exports.TicketMessage = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const shared_types_1 = require("@speak-shine/shared-types");
let TicketMessage = class TicketMessage {
};
exports.TicketMessage = TicketMessage;
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User', required: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], TicketMessage.prototype, "senderId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, type: String, enum: Object.values(shared_types_1.Role) }),
    __metadata("design:type", String)
], TicketMessage.prototype, "senderRole", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, trim: true }),
    __metadata("design:type", String)
], TicketMessage.prototype, "message", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: () => new Date() }),
    __metadata("design:type", Date)
], TicketMessage.prototype, "sentAt", void 0);
exports.TicketMessage = TicketMessage = __decorate([
    (0, mongoose_1.Schema)({ _id: false })
], TicketMessage);
exports.TicketMessageSchema = mongoose_1.SchemaFactory.createForClass(TicketMessage);
let HelpTicket = class HelpTicket {
};
exports.HelpTicket = HelpTicket;
__decorate([
    (0, mongoose_1.Prop)({ required: true, unique: true, uppercase: true }),
    __metadata("design:type", String)
], HelpTicket.prototype, "ticketNumber", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User', required: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], HelpTicket.prototype, "creatorId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User', default: null }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], HelpTicket.prototype, "assignedTo", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, trim: true }),
    __metadata("design:type", String)
], HelpTicket.prototype, "subject", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, enum: ['PAYMENT', 'VIDEO_ANALYSIS', 'CLASS_ACCESS', 'BUG', 'OTHER'] }),
    __metadata("design:type", String)
], HelpTicket.prototype, "category", void 0);
__decorate([
    (0, mongoose_1.Prop)({
        required: true,
        type: String,
        enum: Object.values(shared_types_1.TicketPriority),
        default: shared_types_1.TicketPriority.MEDIUM,
    }),
    __metadata("design:type", String)
], HelpTicket.prototype, "priority", void 0);
__decorate([
    (0, mongoose_1.Prop)({
        required: true,
        type: String,
        enum: Object.values(shared_types_1.TicketStatus),
        default: shared_types_1.TicketStatus.OPEN,
    }),
    __metadata("design:type", String)
], HelpTicket.prototype, "status", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [exports.TicketMessageSchema], default: [] }),
    __metadata("design:type", Array)
], HelpTicket.prototype, "messages", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: null }),
    __metadata("design:type", Date)
], HelpTicket.prototype, "resolvedAt", void 0);
exports.HelpTicket = HelpTicket = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true })
], HelpTicket);
exports.HelpTicketSchema = mongoose_1.SchemaFactory.createForClass(HelpTicket);
exports.HelpTicketSchema.index({ creatorId: 1, createdAt: -1 });
exports.HelpTicketSchema.index({ status: 1 });
//# sourceMappingURL=help-ticket.schema.js.map