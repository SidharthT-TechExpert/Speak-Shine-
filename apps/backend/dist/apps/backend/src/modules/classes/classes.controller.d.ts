import { ClassesService } from './classes.service';
import { CreateClassDto } from './dto/create-class.dto';
import { PreEnrollStudentDto } from './dto/pre-enroll-student.dto';
export declare class ClassesController {
    private readonly classesService;
    constructor(classesService: ClassesService);
    createClass(trainerId: string, dto: CreateClassDto): Promise<import("mongoose").Document<unknown, {}, import("../../database/schemas/class.schema").ClassDocument, {}, {}> & import("../../database/schemas/class.schema").Class & import("mongoose").Document<import("mongoose").Types.ObjectId, any, any, Record<string, any>, {}> & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    }>;
    getTrainerClasses(trainerId: string): Promise<(import("mongoose").FlattenMaps<import("../../database/schemas/class.schema").ClassDocument> & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    })[]>;
    getClassDetails(trainerId: string, classId: string): Promise<import("mongoose").FlattenMaps<import("../../database/schemas/class.schema").ClassDocument> & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    }>;
    getClassStudents(trainerId: string, classId: string): Promise<(import("mongoose").FlattenMaps<import("../../database/schemas/user.schema").UserDocument> & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    })[]>;
    preEnrollStudent(trainerId: string, classId: string, dto: PreEnrollStudentDto): Promise<{
        message: string;
        studentId: string;
        activationOtp?: undefined;
    } | {
        message: string;
        studentId: string;
        activationOtp: string;
    }>;
}
