import { TrainerApprovalStatus } from '@speak-shine/shared-types';
import { AdminService } from './admin.service';
import { ApproveTrainerDto } from './dto/approve-trainer.dto';
export declare class AdminController {
    private readonly adminService;
    constructor(adminService: AdminService);
    getPlatformOverview(): Promise<{
        totalStudents: number;
        totalTrainers: number;
        pendingTrainerApprovals: number;
        totalClasses: number;
        activeClasses: number;
    }>;
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
    listAllClasses(): Promise<(import("mongoose").FlattenMaps<import("../../database/schemas/class.schema").ClassDocument> & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    })[]>;
}
