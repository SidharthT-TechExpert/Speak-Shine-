import { Model, Types } from 'mongoose';
import { UserDocument } from '../../database/schemas/user.schema';
import { TrainerProfileDocument } from '../../database/schemas/trainer-profile.schema';
import { ClassDocument } from '../../database/schemas/class.schema';
import { WalletTransactionDocument } from '../../database/schemas/wallet-transaction.schema';
import { TrainerApprovalStatus } from '@speak-shine/shared-types';
import { ApproveTrainerDto } from './dto/approve-trainer.dto';
export declare class AdminService {
    private userModel;
    private trainerProfileModel;
    private classModel;
    private walletTransactionModel;
    constructor(userModel: Model<UserDocument>, trainerProfileModel: Model<TrainerProfileDocument>, classModel: Model<ClassDocument>, walletTransactionModel: Model<WalletTransactionDocument>);
    listTrainers(status?: TrainerApprovalStatus): Promise<{
        trainerProfileId: string;
        userId: any;
        name: any;
        email: any;
        phone: any;
        approvalStatus: TrainerApprovalStatus;
        qualifications: string[];
        bio: string | undefined;
        appliedAt: any;
        approvedAt: Date | undefined;
    }[]>;
    updateTrainerApproval(trainerUserId: string, adminId: string, dto: ApproveTrainerDto): Promise<{
        message: string;
        trainerId: string;
        approvalStatus: TrainerApprovalStatus;
    }>;
    getPlatformOverview(): Promise<{
        totalStudents: number;
        totalTrainers: number;
        pendingTrainerApprovals: number;
        totalClasses: number;
        activeClasses: number;
    }>;
    listAllClasses(): Promise<(import("mongoose").FlattenMaps<ClassDocument> & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    })[]>;
}
