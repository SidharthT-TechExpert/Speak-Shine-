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
exports.HelpTicketsService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const help_ticket_schema_1 = require("../../database/schemas/help-ticket.schema");
const shared_types_1 = require("@speak-shine/shared-types");
let HelpTicketsService = class HelpTicketsService {
    constructor(ticketModel) {
        this.ticketModel = ticketModel;
    }
    async createTicket(userId, userRole, dto) {
        const ticketNumber = `TKT-${Math.floor(1000 + Math.random() * 9000)}`;
        const ticket = await this.ticketModel.create({
            ticketNumber,
            creatorId: new mongoose_2.Types.ObjectId(userId),
            subject: dto.subject.trim(),
            category: dto.category,
            priority: dto.priority || shared_types_1.TicketPriority.MEDIUM,
            status: shared_types_1.TicketStatus.OPEN,
            messages: [
                {
                    senderId: new mongoose_2.Types.ObjectId(userId),
                    senderRole: userRole,
                    message: dto.message.trim(),
                    sentAt: new Date(),
                },
            ],
        });
        return ticket;
    }
    async getMyTickets(userId) {
        return this.ticketModel
            .find({ creatorId: new mongoose_2.Types.ObjectId(userId) })
            .sort({ createdAt: -1 })
            .lean();
    }
    async listAllTickets(status) {
        const filter = status ? { status } : {};
        return this.ticketModel
            .find(filter)
            .populate('creatorId', 'name email phone role')
            .sort({ createdAt: -1 })
            .lean();
    }
    async replyTicket(ticketId, userId, userRole, dto) {
        const ticket = await this.ticketModel.findById(ticketId);
        if (!ticket)
            throw new common_1.NotFoundException('Ticket not found');
        if (userRole !== shared_types_1.Role.ADMIN &&
            ticket.creatorId.toString() !== userId) {
            throw new common_1.ForbiddenException('Not authorized to reply to this ticket');
        }
        ticket.messages.push({
            senderId: new mongoose_2.Types.ObjectId(userId),
            senderRole: userRole,
            message: dto.message.trim(),
            sentAt: new Date(),
        });
        if (userRole === shared_types_1.Role.ADMIN && ticket.status === shared_types_1.TicketStatus.OPEN) {
            ticket.status = shared_types_1.TicketStatus.IN_PROGRESS;
        }
        await ticket.save();
        return ticket;
    }
    async resolveTicket(ticketId) {
        const ticket = await this.ticketModel.findById(ticketId);
        if (!ticket)
            throw new common_1.NotFoundException('Ticket not found');
        ticket.status = shared_types_1.TicketStatus.RESOLVED;
        ticket.resolvedAt = new Date();
        await ticket.save();
        return { message: 'Ticket marked as resolved', ticketId };
    }
};
exports.HelpTicketsService = HelpTicketsService;
exports.HelpTicketsService = HelpTicketsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(help_ticket_schema_1.HelpTicket.name)),
    __metadata("design:paramtypes", [mongoose_2.Model])
], HelpTicketsService);
//# sourceMappingURL=help-tickets.service.js.map