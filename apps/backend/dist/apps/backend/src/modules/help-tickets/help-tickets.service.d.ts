import { Model, Types } from 'mongoose';
import { HelpTicket, HelpTicketDocument } from '../../database/schemas/help-ticket.schema';
import { Role, TicketStatus } from '@speak-shine/shared-types';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { ReplyTicketDto } from './dto/reply-ticket.dto';
export declare class HelpTicketsService {
    private ticketModel;
    constructor(ticketModel: Model<HelpTicketDocument>);
    createTicket(userId: string, userRole: Role, dto: CreateTicketDto): Promise<import("mongoose").Document<unknown, {}, HelpTicketDocument, {}, {}> & HelpTicket & import("mongoose").Document<Types.ObjectId, any, any, Record<string, any>, {}> & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    }>;
    getMyTickets(userId: string): Promise<(import("mongoose").FlattenMaps<HelpTicketDocument> & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    })[]>;
    listAllTickets(status?: TicketStatus): Promise<(import("mongoose").FlattenMaps<HelpTicketDocument> & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    })[]>;
    replyTicket(ticketId: string, userId: string, userRole: Role, dto: ReplyTicketDto): Promise<import("mongoose").Document<unknown, {}, HelpTicketDocument, {}, {}> & HelpTicket & import("mongoose").Document<Types.ObjectId, any, any, Record<string, any>, {}> & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    }>;
    resolveTicket(ticketId: string): Promise<{
        message: string;
        ticketId: string;
    }>;
}
