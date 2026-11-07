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
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';

@ApiTags('Tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Roles(Role.TRAINER)
  @Post()
  @ApiOperation({ summary: 'Create a new class assignment or daily task' })
  async createTask(
    @CurrentUser('userId') trainerId: string,
    @Body() dto: CreateTaskDto,
  ) {
    return this.tasksService.createTask(trainerId, dto);
  }

  @Roles(Role.TRAINER)
  @Get('class/:classId')
  @ApiOperation({ summary: 'Get all tasks for a specific class' })
  async getClassTasks(@Param('classId') classId: string) {
    return this.tasksService.getClassTasks(classId);
  }

  @Roles(Role.STUDENT)
  @Get('my')
  @ApiOperation({ summary: 'Get active tasks for student enrolled class' })
  async getStudentTasks(@CurrentUser('userId') studentId: string) {
    return this.tasksService.getStudentTasks(studentId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get task details by ID' })
  async getTaskById(@Param('id') taskId: string) {
    return this.tasksService.getTaskById(taskId);
  }
}
