import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  HelpTicket,
  HelpTicketDocument,
} from '../../database/schemas/help-ticket.schema';
import { Role, TicketStatus, TicketPriority } from '@speak-shine/shared-types';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { ReplyTicketDto } from './dto/reply-ticket.dto';

@Injectable()
export class HelpTicketsService {
  constructor(
    @InjectModel(HelpTicket.name)
    private ticketModel: Model<HelpTicketDocument>,
  ) {}

  async createTicket(userId: string, userRole: Role, dto: CreateTicketDto) {
    const ticketNumber = `TKT-${Math.floor(1000 + Math.random() * 9000)}`;

    const ticket = await this.ticketModel.create({
      ticketNumber,
      creatorId: new Types.ObjectId(userId),
      subject: dto.subject.trim(),
      category: dto.category,
      priority: dto.priority || TicketPriority.MEDIUM,
      status: TicketStatus.OPEN,
      messages: [
        {
          senderId: new Types.ObjectId(userId),
          senderRole: userRole,
          message: dto.message.trim(),
          sentAt: new Date(),
        },
      ],
    });

    return ticket;
  }

  async getMyTickets(userId: string) {
    return this.ticketModel
      .find({ creatorId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  async listAllTickets(status?: TicketStatus) {
    const filter = status ? { status } : {};
    return this.ticketModel
      .find(filter)
      .populate('creatorId', 'name email phone role')
      .sort({ createdAt: -1 })
      .lean();
  }

  async replyTicket(
    ticketId: string,
    userId: string,
    userRole: Role,
    dto: ReplyTicketDto,
  ) {
    const ticket = await this.ticketModel.findById(ticketId);
    if (!ticket) throw new NotFoundException('Ticket not found');

    if (
      userRole !== Role.ADMIN &&
      ticket.creatorId.toString() !== userId
    ) {
      throw new ForbiddenException('Not authorized to reply to this ticket');
    }

    ticket.messages.push({
      senderId: new Types.ObjectId(userId),
      senderRole: userRole,
      message: dto.message.trim(),
      sentAt: new Date(),
    });

    if (userRole === Role.ADMIN && ticket.status === TicketStatus.OPEN) {
      ticket.status = TicketStatus.IN_PROGRESS;
    }

    await ticket.save();
    return ticket;
  }

  async resolveTicket(ticketId: string) {
    const ticket = await this.ticketModel.findById(ticketId);
    if (!ticket) throw new NotFoundException('Ticket not found');

    ticket.status = TicketStatus.RESOLVED;
    ticket.resolvedAt = new Date();
    await ticket.save();

    return { message: 'Ticket marked as resolved', ticketId };
  }
}
