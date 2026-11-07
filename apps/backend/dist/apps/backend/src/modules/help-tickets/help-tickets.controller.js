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
exports.HelpTicketsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const shared_types_1 = require("@speak-shine/shared-types");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const roles_guard_1 = require("../../common/guards/roles.guard");
const help_tickets_service_1 = require("./help-tickets.service");
const create_ticket_dto_1 = require("./dto/create-ticket.dto");
const reply_ticket_dto_1 = require("./dto/reply-ticket.dto");
let HelpTicketsController = class HelpTicketsController {
    constructor(ticketsService) {
        this.ticketsService = ticketsService;
    }
    async createTicket(userId, userRole, dto) {
        return this.ticketsService.createTicket(userId, userRole, dto);
    }
    async getMyTickets(userId) {
        return this.ticketsService.getMyTickets(userId);
    }
    async listAllTickets(status) {
        return this.ticketsService.listAllTickets(status);
    }
    async replyTicket(ticketId, userId, userRole, dto) {
        return this.ticketsService.replyTicket(ticketId, userId, userRole, dto);
    }
    async resolveTicket(ticketId) {
        return this.ticketsService.resolveTicket(ticketId);
    }
};
exports.HelpTicketsController = HelpTicketsController;
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create a new support or help ticket' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)('role')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, create_ticket_dto_1.CreateTicketDto]),
    __metadata("design:returntype", Promise)
], HelpTicketsController.prototype, "createTicket", null);
__decorate([
    (0, common_1.Get)('my'),
    (0, swagger_1.ApiOperation)({ summary: 'List tickets created by the authenticated user' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], HelpTicketsController.prototype, "getMyTickets", null);
__decorate([
    (0, roles_decorator_1.Roles)(shared_types_1.Role.ADMIN),
    (0, common_1.Get)('admin/all'),
    (0, swagger_1.ApiQuery)({ name: 'status', enum: shared_types_1.TicketStatus, required: false }),
    (0, swagger_1.ApiOperation)({ summary: 'Admin overview of all support tickets' }),
    __param(0, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], HelpTicketsController.prototype, "listAllTickets", null);
__decorate([
    (0, common_1.Post)(':id/reply'),
    (0, swagger_1.ApiOperation)({ summary: 'Post a response message to a ticket' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)('role')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, reply_ticket_dto_1.ReplyTicketDto]),
    __metadata("design:returntype", Promise)
], HelpTicketsController.prototype, "replyTicket", null);
__decorate([
    (0, roles_decorator_1.Roles)(shared_types_1.Role.ADMIN),
    (0, common_1.Patch)(':id/resolve'),
    (0, swagger_1.ApiOperation)({ summary: 'Mark ticket as resolved' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], HelpTicketsController.prototype, "resolveTicket", null);
exports.HelpTicketsController = HelpTicketsController = __decorate([
    (0, swagger_1.ApiTags)('Help Tickets'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, common_1.Controller)('help-tickets'),
    __metadata("design:paramtypes", [help_tickets_service_1.HelpTicketsService])
], HelpTicketsController);
//# sourceMappingURL=help-tickets.controller.js.map