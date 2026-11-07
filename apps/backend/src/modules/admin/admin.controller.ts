import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role, TrainerApprovalStatus } from '@speak-shine/shared-types';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AdminService } from './admin.service';
import { ApproveTrainerDto } from './dto/approve-trainer.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Platform telemetry and count summaries' })
  async getPlatformOverview() {
    return this.adminService.getPlatformOverview();
  }

  @Get('trainers')
  @ApiQuery({
    name: 'status',
    enum: TrainerApprovalStatus,
    required: false,
  })
  @ApiOperation({ summary: 'List trainers filtered by status' })
  async listTrainers(@Query('status') status?: TrainerApprovalStatus) {
    return this.adminService.listTrainers(status);
  }

  @Patch('trainers/:id/approval')
  @ApiOperation({ summary: 'Approve, reject, or suspend a trainer application' })
  async updateTrainerApproval(
    @Param('id') trainerUserId: string,
    @CurrentUser('userId') adminId: string,
    @Body() dto: ApproveTrainerDto,
  ) {
    return this.adminService.updateTrainerApproval(trainerUserId, adminId, dto);
  }

  @Get('classes')
  @ApiOperation({ summary: 'List all classes across the platform' })
  async listAllClasses() {
    return this.adminService.listAllClasses();
  }
}
