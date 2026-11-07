import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../../database/schemas/user.schema';
import {
  TrainerProfile,
  TrainerProfileDocument,
} from '../../database/schemas/trainer-profile.schema';
import { Class, ClassDocument } from '../../database/schemas/class.schema';
import {
  WalletTransaction,
  WalletTransactionDocument,
} from '../../database/schemas/wallet-transaction.schema';
import { Role, TrainerApprovalStatus } from '@speak-shine/shared-types';
import { ApproveTrainerDto } from './dto/approve-trainer.dto';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(TrainerProfile.name)
    private trainerProfileModel: Model<TrainerProfileDocument>,
    @InjectModel(Class.name) private classModel: Model<ClassDocument>,
    @InjectModel(WalletTransaction.name)
    private walletTransactionModel: Model<WalletTransactionDocument>,
  ) {}

  async listTrainers(status?: TrainerApprovalStatus) {
    const filter = status ? { approvalStatus: status } : {};
    const profiles = await this.trainerProfileModel
      .find(filter)
      .populate('userId', 'name email phone createdAt isActive')
      .sort({ createdAt: -1 })
      .lean();

    return profiles.map((p) => ({
      trainerProfileId: p._id.toString(),
      userId: (p.userId as any)?._id?.toString(),
      name: (p.userId as any)?.name,
      email: (p.userId as any)?.email,
      phone: (p.userId as any)?.phone,
      approvalStatus: p.approvalStatus,
      qualifications: p.qualifications,
      bio: p.bio,
      appliedAt: (p as any).createdAt,
      approvedAt: p.approvedAt,
    }));
  }

  async updateTrainerApproval(
    trainerUserId: string,
    adminId: string,
    dto: ApproveTrainerDto,
  ) {
    const user = await this.userModel.findById(trainerUserId);
    if (!user || user.role !== Role.TRAINER) {
      throw new NotFoundException('Trainer not found');
    }

    const profile = await this.trainerProfileModel.findOne({
      userId: user._id,
    });
    if (!profile) {
      throw new NotFoundException('Trainer profile not found');
    }

    profile.approvalStatus = dto.status;
    if (dto.status === TrainerApprovalStatus.ACTIVE) {
      profile.approvedAt = new Date();
      profile.approvedBy = new Types.ObjectId(adminId);
    } else if (dto.status === TrainerApprovalStatus.REJECTED) {
      profile.rejectionReason = dto.reviewNotes;
    }

    await profile.save();

    return {
      message: `Trainer account status updated to ${dto.status}`,
      trainerId: user._id.toString(),
      approvalStatus: profile.approvalStatus,
    };
  }

  async getPlatformOverview() {
    const [totalStudents, totalTrainers, totalClasses, activeClasses] =
      await Promise.all([
        this.userModel.countDocuments({ role: Role.STUDENT }),
        this.trainerProfileModel.countDocuments({
          approvalStatus: TrainerApprovalStatus.ACTIVE,
        }),
        this.classModel.countDocuments(),
        this.classModel.countDocuments({ status: 'ACTIVE' }),
      ]);

    const pendingTrainerCount = await this.trainerProfileModel.countDocuments({
      approvalStatus: TrainerApprovalStatus.PENDING_APPROVAL,
    });

    return {
      totalStudents,
      totalTrainers,
      pendingTrainerApprovals: pendingTrainerCount,
      totalClasses,
      activeClasses,
    };
  }

  async listAllClasses() {
    return this.classModel
      .find()
      .populate('trainerId', 'name email phone')
      .sort({ createdAt: -1 })
      .lean();
  }
}
