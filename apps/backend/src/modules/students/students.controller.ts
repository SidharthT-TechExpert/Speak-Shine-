import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@speak-shine/shared-types';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { StudentsService } from './students.service';
import { JoinClassDto } from './dto/join-class.dto';

@ApiTags('Students')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STUDENT)
@Controller('students')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Post('classes/join')
  @ApiOperation({ summary: 'Join a class using a unique Class Code' })
  async joinClass(
    @CurrentUser('userId') studentId: string,
    @Body() dto: JoinClassDto,
  ) {
    return this.studentsService.joinClass(studentId, dto);
  }

  @Get('classes/my')
  @ApiOperation({ summary: 'Get current enrolled class and trainer info' })
  async getMyClass(@CurrentUser('userId') studentId: string) {
    return this.studentsService.getMyClass(studentId);
  }

  @Get('progress')
  @ApiOperation({ summary: 'Get student streaks, freeze shields, and monthly score' })
  async getMyProgress(@CurrentUser('userId') studentId: string) {
    return this.studentsService.getMyProgress(studentId);
  }
}
