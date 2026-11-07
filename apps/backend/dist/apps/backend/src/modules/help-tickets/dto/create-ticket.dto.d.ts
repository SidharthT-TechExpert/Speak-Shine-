import { TicketPriority } from '@speak-shine/shared-types';
export declare class CreateTicketDto {
    subject: string;
    category: string;
    priority?: TicketPriority;
    message: string;
}
