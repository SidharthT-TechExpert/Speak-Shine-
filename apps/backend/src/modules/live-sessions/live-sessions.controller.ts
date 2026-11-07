import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@speak-shine/shared-types';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { LiveSessionsService } from './live-sessions.service';
import { CreateLiveSessionDto } from './dto/create-session.dto';

@ApiTags('Live Sessions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('live-sessions')
export class LiveSessionsController {
  constructor(private readonly liveSessionsService: LiveSessionsService) {}

  @Roles(Role.TRAINER)
  @Post()
  @ApiOperation({ summary: 'Trainer schedules a new LiveKit live video room' })
  async createSession(
    @CurrentUser('userId') trainerId: string,
    @Body() dto: CreateLiveSessionDto,
  ) {
    return this.liveSessionsService.createSession(trainerId, dto);
  }

  @Post(':id/join-token')
  @ApiOperation({ summary: 'Generate participant LiveKit WebRTC access token' })
  async getSessionToken(
    @Param('id') sessionId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.liveSessionsService.getSessionToken(sessionId, userId);
  }

  @Get('class/:classId')
  @ApiOperation({ summary: 'List live sessions for a class' })
  async getClassSessions(@Param('classId') classId: string) {
    return this.liveSessionsService.getClassSessions(classId);
  }
}
