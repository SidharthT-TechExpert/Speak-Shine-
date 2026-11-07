import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { User, UserDocument } from '../../database/schemas/user.schema';
import {
  TrainerProfile,
  TrainerProfileDocument,
} from '../../database/schemas/trainer-profile.schema';
import { Class, ClassDocument } from '../../database/schemas/class.schema';
import { Role, TrainerApprovalStatus } from '@speak-shine/shared-types';
import { LoginDto } from './dto/login.dto';
import { StudentRegisterDto } from './dto/student-register.dto';
import { TrainerRegisterDto } from './dto/trainer-register.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(TrainerProfile.name)
    private trainerProfileModel: Model<TrainerProfileDocument>,
    @InjectModel(Class.name) private classModel: Model<ClassDocument>,
    private jwtService: JwtService,
  ) {}

  async login(loginDto: LoginDto) {
    const { identifier, password } = loginDto;

    // Support login via either email or phone
    const user = await this.userModel.findOne({
      $or: [
        { email: identifier.toLowerCase().trim() },
        { phone: identifier.trim() },
      ],
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email/phone or password');
    }

    const isMatch = await argon2.verify(user.passwordHash, password);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid email/phone or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Your account has been deactivated');
    }

    let trainerStatus: TrainerApprovalStatus | undefined = undefined;
    if (user.role === Role.TRAINER) {
      const profile = await this.trainerProfileModel.findOne({ userId: user._id });
      trainerStatus = profile?.approvalStatus || TrainerApprovalStatus.PENDING_APPROVAL;
    }

    const payload = {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
      classId: user.classId ? user.classId.toString() : undefined,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        classId: user.classId?.toString(),
        trainerApprovalStatus: trainerStatus,
        streak: user.streak,
        monthlyScore: user.monthlyScore,
        walletBalance: user.walletBalance,
      },
    };
  }

  async registerStudent(dto: StudentRegisterDto) {
    const existing = await this.userModel.findOne({
      $or: [
        { email: dto.email.toLowerCase().trim() },
        ...(dto.phone ? [{ phone: dto.phone.trim() }] : []),
      ],
    });

    if (existing) {
      throw new ConflictException('A user with this email or phone already exists');
    }

    let classDoc: ClassDocument | null = null;
    if (dto.classCode) {
      classDoc = await this.classModel.findOne({
        classCode: dto.classCode.toUpperCase().trim(),
      });
      if (!classDoc) {
        throw new NotFoundException(`Class with code ${dto.classCode} was not found`);
      }
    }

    // Check referral code
    let referrerDoc: UserDocument | null = null;
    if (dto.referralCode) {
      referrerDoc = await this.userModel.findOne({
        referralCode: dto.referralCode.trim(),
      });
    }

    const passwordHash = await argon2.hash(dto.password);
    const userReferralCode = `SPK${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    const newUser = await this.userModel.create({
      name: dto.name.trim(),
      email: dto.email.toLowerCase().trim(),
      phone: dto.phone?.trim() || null,
      passwordHash,
      role: Role.STUDENT,
      classId: classDoc ? classDoc._id : null,
      trainerId: classDoc ? classDoc.trainerId : null,
      referralCode: userReferralCode,
      referredBy: referrerDoc ? referrerDoc._id : null,
    });

    if (classDoc) {
      await this.classModel.updateOne(
        { _id: classDoc._id },
        { $inc: { studentCount: 1 } },
      );
    }

    const payload = {
      sub: newUser._id.toString(),
      email: newUser.email,
      role: newUser.role,
      classId: classDoc ? classDoc._id.toString() : undefined,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: newUser._id.toString(),
        name: newUser.name,
        email: newUser.email,
        phone: newUser.phone,
        role: newUser.role,
        classId: newUser.classId?.toString(),
        streak: newUser.streak,
        monthlyScore: newUser.monthlyScore,
      },
    };
  }

  async registerTrainer(dto: TrainerRegisterDto) {
    const existing = await this.userModel.findOne({
      $or: [
        { email: dto.email.toLowerCase().trim() },
        { phone: dto.phone.trim() },
      ],
    });

    if (existing) {
      throw new ConflictException('A user with this email or phone already exists');
    }

    const passwordHash = await argon2.hash(dto.password);

    const newUser = await this.userModel.create({
      name: dto.name.trim(),
      email: dto.email.toLowerCase().trim(),
      phone: dto.phone.trim(),
      passwordHash,
      role: Role.TRAINER,
    });

    await this.trainerProfileModel.create({
      userId: newUser._id,
      approvalStatus: TrainerApprovalStatus.PENDING_APPROVAL,
      bio: dto.bio || null,
      qualifications: dto.qualifications,
    });

    return {
      message:
        'Trainer registration submitted successfully. Your account is pending administrative approval.',
      trainerId: newUser._id.toString(),
      approvalStatus: TrainerApprovalStatus.PENDING_APPROVAL,
    };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.userModel.findOne({
      $or: [
        { email: dto.identifier.toLowerCase().trim() },
        { phone: dto.identifier.trim() },
      ],
    });

    if (!user) {
      // Return success anyway to prevent user enumeration
      return {
        message: 'If an account exists, a 6-digit verification code has been dispatched.',
      };
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    await this.userModel.updateOne(
      { _id: user._id },
      {
        $set: {
          resetPasswordOtp: otp,
          resetPasswordExpiresAt: expiresAt,
        },
      },
    );

    // In local/dev we log it; in production dispatched via email/SMS gateway
    console.log(`[AuthService] Password Reset OTP for ${user.email}: ${otp}`);

    return {
      message: 'If an account exists, a 6-digit verification code has been dispatched.',
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.userModel.findOne({
      $or: [
        { email: dto.identifier.toLowerCase().trim() },
        { phone: dto.identifier.trim() },
      ],
    });

    if (
      !user ||
      !user.resetPasswordOtp ||
      user.resetPasswordOtp !== dto.otp ||
      !user.resetPasswordExpiresAt ||
      new Date() > user.resetPasswordExpiresAt
    ) {
      throw new BadRequestException('Invalid or expired verification code');
    }

    const passwordHash = await argon2.hash(dto.newPassword);

    await this.userModel.updateOne(
      { _id: user._id },
      {
        $set: {
          passwordHash,
          resetPasswordOtp: null,
          resetPasswordExpiresAt: null,
        },
      },
    );

    return {
      message: 'Password has been successfully updated. You may now log in.',
    };
  }
}
