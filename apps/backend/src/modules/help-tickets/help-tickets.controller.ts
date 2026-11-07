import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role, TicketStatus } from '@speak-shine/shared-types';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { HelpTicketsService } from './help-tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { ReplyTicketDto } from './dto/reply-ticket.dto';

@ApiTags('Help Tickets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('help-tickets')
export class HelpTicketsController {
  constructor(private readonly ticketsService: HelpTicketsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new support or help ticket' })
  async createTicket(
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') userRole: Role,
    @Body() dto: CreateTicketDto,
  ) {
    return this.ticketsService.createTicket(userId, userRole, dto);
  }

  @Get('my')
  @ApiOperation({ summary: 'List tickets created by the authenticated user' })
  async getMyTickets(@CurrentUser('userId') userId: string) {
    return this.ticketsService.getMyTickets(userId);
  }

  @Roles(Role.ADMIN)
  @Get('admin/all')
  @ApiQuery({ name: 'status', enum: TicketStatus, required: false })
  @ApiOperation({ summary: 'Admin overview of all support tickets' })
  async listAllTickets(@Query('status') status?: TicketStatus) {
    return this.ticketsService.listAllTickets(status);
  }

  @Post(':id/reply')
  @ApiOperation({ summary: 'Post a response message to a ticket' })
  async replyTicket(
    @Param('id') ticketId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') userRole: Role,
    @Body() dto: ReplyTicketDto,
  ) {
    return this.ticketsService.replyTicket(ticketId, userId, userRole, dto);
  }

  @Roles(Role.ADMIN)
  @Patch(':id/resolve')
  @ApiOperation({ summary: 'Mark ticket as resolved' })
  async resolveTicket(@Param('id') ticketId: string) {
    return this.ticketsService.resolveTicket(ticketId);
  }
}
