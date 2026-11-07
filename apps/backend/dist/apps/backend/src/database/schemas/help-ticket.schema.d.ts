import { Document, Types } from 'mongoose';
import { TicketPriority, TicketStatus, Role } from '@speak-shine/shared-types';
export type HelpTicketDocument = HelpTicket & Document;
export declare class TicketMessage {
    senderId: Types.ObjectId;
    senderRole: Role;
    message: string;
    sentAt: Date;
}
export declare const TicketMessageSchema: import("mongoose").Schema<TicketMessage, import("mongoose").Model<TicketMessage, any, any, any, Document<unknown, any, TicketMessage, any, {}> & TicketMessage & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, TicketMessage, Document<unknown, {}, import("mongoose").FlatRecord<TicketMessage>, {}, import("mongoose").DefaultSchemaOptions> & import("mongoose").FlatRecord<TicketMessage> & {
    _id: Types.ObjectId;
} & {
    __v: number;
}>;
export declare class HelpTicket {
    ticketNumber: string;
    creatorId: Types.ObjectId;
    assignedTo?: Types.ObjectId;
    subject: string;
    category: string;
    priority: TicketPriority;
    status: TicketStatus;
    messages: TicketMessage[];
    resolvedAt?: Date;
}
export declare const HelpTicketSchema: import("mongoose").Schema<HelpTicket, import("mongoose").Model<HelpTicket, any, any, any, Document<unknown, any, HelpTicket, any, {}> & HelpTicket & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, HelpTicket, Document<unknown, {}, import("mongoose").FlatRecord<HelpTicket>, {}, import("mongoose").DefaultSchemaOptions> & import("mongoose").FlatRecord<HelpTicket> & {
    _id: Types.ObjectId;
} & {
    __v: number;
}>;
