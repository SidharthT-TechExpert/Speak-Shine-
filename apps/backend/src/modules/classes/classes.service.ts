import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as argon2 from 'argon2';
import { Class, ClassDocument } from '../../database/schemas/class.schema';
import { User, UserDocument } from '../../database/schemas/user.schema';
import { Role } from '@speak-shine/shared-types';
import { CreateClassDto } from './dto/create-class.dto';
import { PreEnrollStudentDto } from './dto/pre-enroll-student.dto';

@Injectable()
export class ClassesService {
  constructor(
    @InjectModel(Class.name) private classModel: Model<ClassDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  private async generateUniqueClassCode(): Promise<string> {
    let code = '';
    let exists = true;
    while (exists) {
      const num = Math.floor(1000 + Math.random() * 9000);
      code = `SHINE-${num}`;
      const found = await this.classModel.findOne({ classCode: code }).lean();
      if (!found) exists = false;
    }
    return code;
  }

  async createClass(trainerId: string, dto: CreateClassDto) {
    const classCode = await this.generateUniqueClassCode();

    const newClass = await this.classModel.create({
      title: dto.title.trim(),
      description: dto.description?.trim(),
      classCode,
      trainerId: new Types.ObjectId(trainerId),
    });

    return newClass;
  }

  async getTrainerClasses(trainerId: string) {
    return this.classModel
      .find({ trainerId: new Types.ObjectId(trainerId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  async getClassDetails(classId: string, trainerId: string) {
    const cls = await this.classModel.findById(classId).lean();
    if (!cls) {
      throw new NotFoundException('Class not found');
    }
    if (cls.trainerId.toString() !== trainerId) {
      throw new ForbiddenException('You do not own this class');
    }
    return cls;
  }

  async getClassStudents(classId: string, trainerId: string) {
    await this.getClassDetails(classId, trainerId);

    return this.userModel
      .find({ classId: new Types.ObjectId(classId) })
      .select('name email phone streak monthlyScore walletBalance createdAt')
      .sort({ streak: -1, monthlyScore: -1 })
      .lean();
  }

  async preEnrollStudent(
    classId: string,
    trainerId: string,
    dto: PreEnrollStudentDto,
  ) {
    const cls = await this.getClassDetails(classId, trainerId);

    let existingUser = await this.userModel.findOne({
      $or: [
        { email: dto.email.toLowerCase().trim() },
        ...(dto.phone ? [{ phone: dto.phone.trim() }] : []),
      ],
    });

    if (existingUser) {
      // If user already belongs to this class
      if (existingUser.classId?.toString() === classId) {
        throw new ConflictException('Student is already enrolled in this class');
      }
      // If student is unassigned, enroll them
      if (!existingUser.classId) {
        existingUser.classId = cls._id as any;
        existingUser.trainerId = new Types.ObjectId(trainerId);
        await existingUser.save();
        await this.classModel.updateOne(
          { _id: cls._id },
          { $inc: { studentCount: 1 } },
        );
        return {
          message: 'Existing student enrolled in class successfully',
          studentId: existingUser._id.toString(),
        };
      }
      throw new ConflictException('Student is already enrolled in another class');
    }

    // Create student account with temporary placeholder password and OTP for activation
    const temporaryPlaceholder = Math.random().toString(36).substring(2, 12);
    const passwordHash = await argon2.hash(temporaryPlaceholder);
    const activationOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const newStudent = await this.userModel.create({
      name: dto.name.trim(),
      email: dto.email.toLowerCase().trim(),
      phone: dto.phone?.trim() || undefined,
      passwordHash,
      role: Role.STUDENT,
      classId: cls._id,
      trainerId: new Types.ObjectId(trainerId),
      resetPasswordOtp: activationOtp,
      resetPasswordExpiresAt: expiresAt,
    });

    await this.classModel.updateOne(
      { _id: cls._id },
      { $inc: { studentCount: 1 } },
    );

    console.log(
      `[ClassesService] Student invited: ${dto.email}, Activation OTP: ${activationOtp}`,
    );

    return {
      message:
        'Student successfully enrolled. Student can log in via Forgot Password / Activation OTP.',
      studentId: newStudent._id.toString(),
      activationOtp,
    };
  }
}
