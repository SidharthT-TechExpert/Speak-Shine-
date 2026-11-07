import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { UserDocument } from '../../database/schemas/user.schema';
import { TrainerProfileDocument } from '../../database/schemas/trainer-profile.schema';
import { ClassDocument } from '../../database/schemas/class.schema';
import { Role, TrainerApprovalStatus } from '@speak-shine/shared-types';
import { RedisService } from '../../common/services/redis.service';
import { LoginDto } from './dto/login.dto';
import { StudentRegisterDto } from './dto/student-register.dto';
import { TrainerRegisterDto } from './dto/trainer-register.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
export declare class AuthService {
    private userModel;
    private trainerProfileModel;
    private classModel;
    private jwtService;
    private redisService;
    private readonly logger;
    constructor(userModel: Model<UserDocument>, trainerProfileModel: Model<TrainerProfileDocument>, classModel: Model<ClassDocument>, jwtService: JwtService, redisService: RedisService);
    private checkPhoneOtpRateLimit;
    private dispatchOtp;
    login(loginDto: LoginDto): Promise<{
        accessToken: string;
        user: {
            id: string;
            name: string;
            email: string;
            phone: string | undefined;
            role: Role;
            classId: string | undefined;
            trainerApprovalStatus: TrainerApprovalStatus | undefined;
            streak: number;
            monthlyScore: number;
            walletBalance: number;
        };
    }>;
    registerStudent(dto: StudentRegisterDto): Promise<{
        accessToken: string;
        user: {
            id: string;
            name: string;
            email: string;
            phone: string | undefined;
            role: Role;
            classId: string | undefined;
            streak: number;
            monthlyScore: number;
        };
    }>;
    registerTrainer(dto: TrainerRegisterDto): Promise<{
        message: string;
        trainerId: string;
        approvalStatus: TrainerApprovalStatus;
    }>;
    forgotPassword(dto: ForgotPasswordDto): Promise<{
        message: string;
    }>;
    resetPassword(dto: ResetPasswordDto): Promise<{
        message: string;
    }>;
}
