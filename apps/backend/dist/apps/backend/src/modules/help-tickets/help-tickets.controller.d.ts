import { Role, TicketStatus } from '@speak-shine/shared-types';
import { HelpTicketsService } from './help-tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { ReplyTicketDto } from './dto/reply-ticket.dto';
export declare class HelpTicketsController {
    private readonly ticketsService;
    constructor(ticketsService: HelpTicketsService);
    createTicket(userId: string, userRole: Role, dto: CreateTicketDto): Promise<import("mongoose").Document<unknown, {}, import("../../database/schemas/help-ticket.schema").HelpTicketDocument, {}, {}> & import("../../database/schemas/help-ticket.schema").HelpTicket & import("mongoose").Document<import("mongoose").Types.ObjectId, any, any, Record<string, any>, {}> & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    }>;
    getMyTickets(userId: string): Promise<(import("mongoose").FlattenMaps<import("../../database/schemas/help-ticket.schema").HelpTicketDocument> & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    })[]>;
    listAllTickets(status?: TicketStatus): Promise<(import("mongoose").FlattenMaps<import("../../database/schemas/help-ticket.schema").HelpTicketDocument> & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    })[]>;
    replyTicket(ticketId: string, userId: string, userRole: Role, dto: ReplyTicketDto): Promise<import("mongoose").Document<unknown, {}, import("../../database/schemas/help-ticket.schema").HelpTicketDocument, {}, {}> & import("../../database/schemas/help-ticket.schema").HelpTicket & import("mongoose").Document<import("mongoose").Types.ObjectId, any, any, Record<string, any>, {}> & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    }>;
    resolveTicket(ticketId: string): Promise<{
        message: string;
        ticketId: string;
    }>;
}
