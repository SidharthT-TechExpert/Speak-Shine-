import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { StudentRegisterDto } from './dto/student-register.dto';
import { TrainerRegisterDto } from './dto/trainer-register.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    login(loginDto: LoginDto): Promise<{
        accessToken: string;
        user: {
            id: string;
            name: string;
            email: string;
            phone: string | undefined;
            role: import("@speak-shine/shared-types").Role;
            classId: string | undefined;
            trainerApprovalStatus: import("@speak-shine/shared-types").TrainerApprovalStatus | undefined;
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
            role: import("@speak-shine/shared-types").Role;
            classId: string | undefined;
            streak: number;
            monthlyScore: number;
        };
    }>;
    registerTrainer(dto: TrainerRegisterDto): Promise<{
        message: string;
        trainerId: string;
        approvalStatus: import("@speak-shine/shared-types").TrainerApprovalStatus;
    }>;
    forgotPassword(dto: ForgotPasswordDto): Promise<{
        message: string;
    }>;
    resetPassword(dto: ResetPasswordDto): Promise<{
        message: string;
    }>;
}
