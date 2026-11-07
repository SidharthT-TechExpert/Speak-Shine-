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
import { ClassesService } from './classes.service';
import { CreateClassDto } from './dto/create-class.dto';
import { PreEnrollStudentDto } from './dto/pre-enroll-student.dto';

@ApiTags('Classes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('trainers/classes')
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  @Roles(Role.TRAINER)
  @Post()
  @ApiOperation({ summary: 'Create a new class with auto-generated Class Code' })
  async createClass(
    @CurrentUser('userId') trainerId: string,
    @Body() dto: CreateClassDto,
  ) {
    return this.classesService.createClass(trainerId, dto);
  }

  @Roles(Role.TRAINER)
  @Get()
  @ApiOperation({ summary: 'List all classes created by authenticated trainer' })
  async getTrainerClasses(@CurrentUser('userId') trainerId: string) {
    return this.classesService.getTrainerClasses(trainerId);
  }

  @Roles(Role.TRAINER)
  @Get(':id')
  @ApiOperation({ summary: 'Get class details by ID' })
  async getClassDetails(
    @CurrentUser('userId') trainerId: string,
    @Param('id') classId: string,
  ) {
    return this.classesService.getClassDetails(classId, trainerId);
  }

  @Roles(Role.TRAINER)
  @Get(':id/students')
  @ApiOperation({ summary: 'List student roster for a class' })
  async getClassStudents(
    @CurrentUser('userId') trainerId: string,
    @Param('id') classId: string,
  ) {
    return this.classesService.getClassStudents(classId, trainerId);
  }

  @Roles(Role.TRAINER)
  @Post(':id/students')
  @ApiOperation({ summary: 'Pre-enroll a student into a class' })
  async preEnrollStudent(
    @CurrentUser('userId') trainerId: string,
    @Param('id') classId: string,
    @Body() dto: PreEnrollStudentDto,
  ) {
    return this.classesService.preEnrollStudent(classId, trainerId, dto);
  }
}
