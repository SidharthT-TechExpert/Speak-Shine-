import { StudentsService } from './students.service';
import { JoinClassDto } from './dto/join-class.dto';
export declare class StudentsController {
    private readonly studentsService;
    constructor(studentsService: StudentsService);
    joinClass(studentId: string, dto: JoinClassDto): Promise<{
        message: string;
        classId: string;
        classTitle: string;
    }>;
    getMyClass(studentId: string): Promise<{
        enrolled: boolean;
        class: null;
        trainer?: undefined;
    } | {
        enrolled: boolean;
        class: import("mongoose").Types.ObjectId;
        trainer: import("mongoose").Types.ObjectId | undefined;
    }>;
    getMyProgress(studentId: string): Promise<{
        streak: number;
        lastStreakDate: string | undefined;
        streakFreeze: number;
        freezeStreakProgress: number;
        monthlyScore: number;
        earnedBadges: string[];
        walletBalance: number;
    }>;
}
