import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../../database/schemas/user.schema';
import { Class, ClassDocument } from '../../database/schemas/class.schema';
import { ClassStatus } from '@speak-shine/shared-types';
import { JoinClassDto } from './dto/join-class.dto';

@Injectable()
export class StudentsService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Class.name) private classModel: Model<ClassDocument>,
  ) {}

  async joinClass(studentId: string, dto: JoinClassDto) {
    const student = await this.userModel.findById(studentId);
    if (!student) {
      throw new NotFoundException('Student account not found');
    }

    if (student.classId) {
      throw new ConflictException(
        'You are already enrolled in a class. Please contact your trainer or support to switch classes.',
      );
    }

    const cls = await this.classModel.findOne({
      classCode: dto.classCode.toUpperCase().trim(),
    });

    if (!cls) {
      throw new NotFoundException(
        `Class with code "${dto.classCode}" does not exist`,
      );
    }

    if (cls.status !== ClassStatus.ACTIVE) {
      throw new BadRequestException(
        'This class is no longer active for enrollment',
      );
    }

    student.classId = cls._id as any;
    student.trainerId = cls.trainerId;
    await student.save();

    await this.classModel.updateOne(
      { _id: cls._id },
      { $inc: { studentCount: 1 } },
    );

    return {
      message: `Successfully joined ${cls.title}!`,
      classId: cls._id.toString(),
      classTitle: cls.title,
    };
  }

  async getMyClass(studentId: string) {
    const student = await this.userModel
      .findById(studentId)
      .populate('classId')
      .populate('trainerId', 'name email phone avatarUrl')
      .lean();

    if (!student || !student.classId) {
      return { enrolled: false, class: null };
    }

    return {
      enrolled: true,
      class: student.classId,
      trainer: student.trainerId,
    };
  }

  async getMyProgress(studentId: string) {
    const student = await this.userModel.findById(studentId).lean();
    if (!student) {
      throw new NotFoundException('Student account not found');
    }

    return {
      streak: student.streak,
      lastStreakDate: student.lastStreakDate,
      streakFreeze: student.streakFreeze,
      freezeStreakProgress: student.freezeStreakProgress,
      monthlyScore: student.monthlyScore,
      earnedBadges: student.earnedBadges,
      walletBalance: student.walletBalance,
    };
  }
}
