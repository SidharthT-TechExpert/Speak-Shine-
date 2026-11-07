import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../../database/schemas/user.schema';
import {
  TrainerProfile,
  TrainerProfileDocument,
} from '../../database/schemas/trainer-profile.schema';
import { Role } from '@speak-shine/shared-types';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  classId?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(TrainerProfile.name)
    private trainerProfileModel: Model<TrainerProfileDocument>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('JWT_SECRET') ||
        'speak-shine-v2-production-super-secret-key-32chars',
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.userModel.findById(payload.sub).lean();
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User account is deactivated or invalid');
    }

    let trainerApprovalStatus: string | undefined = undefined;
    if (user.role === Role.TRAINER) {
      const trainerProfile = await this.trainerProfileModel
        .findOne({ userId: user._id })
        .lean();
      trainerApprovalStatus = trainerProfile?.approvalStatus;
    }

    return {
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
      classId: user.classId?.toString(),
      trainerApprovalStatus,
    };
  }
}
