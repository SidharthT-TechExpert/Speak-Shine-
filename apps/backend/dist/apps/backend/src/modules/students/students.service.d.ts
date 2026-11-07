import { Model, Types } from 'mongoose';
import { UserDocument } from '../../database/schemas/user.schema';
import { ClassDocument } from '../../database/schemas/class.schema';
import { JoinClassDto } from './dto/join-class.dto';
export declare class StudentsService {
    private userModel;
    private classModel;
    constructor(userModel: Model<UserDocument>, classModel: Model<ClassDocument>);
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
        class: Types.ObjectId;
        trainer: Types.ObjectId | undefined;
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
