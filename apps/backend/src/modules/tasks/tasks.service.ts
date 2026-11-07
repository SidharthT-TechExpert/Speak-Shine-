import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Task, TaskDocument } from '../../database/schemas/task.schema';
import { Class, ClassDocument } from '../../database/schemas/class.schema';
import { User, UserDocument } from '../../database/schemas/user.schema';
import { ClassStatus } from '@speak-shine/shared-types';
import { CreateTaskDto } from './dto/create-task.dto';

@Injectable()
export class TasksService {
  constructor(
    @InjectModel(Task.name) private taskModel: Model<TaskDocument>,
    @InjectModel(Class.name) private classModel: Model<ClassDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  async createTask(trainerId: string, dto: CreateTaskDto) {
    const cls = await this.classModel.findById(dto.classId);
    if (!cls) {
      throw new NotFoundException('Class not found');
    }
    if (cls.trainerId.toString() !== trainerId) {
      throw new ForbiddenException('You can only create tasks for classes you own');
    }
    if (cls.status !== ClassStatus.ACTIVE) {
      throw new BadRequestException('Cannot create tasks for an inactive or archived class');
    }
    if (new Date(dto.dueDate) <= new Date()) {
      throw new BadRequestException('Task due date must be in the future');
    }

    const task = await this.taskModel.create({
      classId: cls._id,
      trainerId: new Types.ObjectId(trainerId),
      title: dto.title.trim(),
      description: dto.description.trim(),
      type: dto.type,
      vocabularyChallengeWords: dto.vocabularyChallengeWords || [],
      referenceImageUrl: dto.referenceImageUrl || null,
      storyPrompt: dto.storyPrompt || null,
      minDurationSeconds: dto.minDurationSeconds || 30,
      maxDurationSeconds: dto.maxDurationSeconds || 120,
      prizePool: dto.prizePool || 0,
      dueDate: new Date(dto.dueDate),
    });

    return task;
  }

  async getClassTasks(classId: string) {
    return this.taskModel
      .find({ classId: new Types.ObjectId(classId) })
      .sort({ dueDate: -1 })
      .lean();
  }

  async getStudentTasks(studentId: string) {
    const student = await this.userModel.findById(studentId).lean();
    if (!student || !student.classId) {
      return [];
    }

    return this.taskModel
      .find({ classId: student.classId })
      .sort({ dueDate: 1 })
      .lean();
  }

  async getTaskById(taskId: string) {
    const task = await this.taskModel.findById(taskId).lean();
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    return task;
  }
}
