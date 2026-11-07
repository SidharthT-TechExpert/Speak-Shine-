import { Model, Types } from 'mongoose';
import { Class, ClassDocument } from '../../database/schemas/class.schema';
import { UserDocument } from '../../database/schemas/user.schema';
import { CreateClassDto } from './dto/create-class.dto';
import { PreEnrollStudentDto } from './dto/pre-enroll-student.dto';
export declare class ClassesService {
    private classModel;
    private userModel;
    constructor(classModel: Model<ClassDocument>, userModel: Model<UserDocument>);
    private generateUniqueClassCode;
    createClass(trainerId: string, dto: CreateClassDto): Promise<import("mongoose").Document<unknown, {}, ClassDocument, {}, {}> & Class & import("mongoose").Document<Types.ObjectId, any, any, Record<string, any>, {}> & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    }>;
    getTrainerClasses(trainerId: string): Promise<(import("mongoose").FlattenMaps<ClassDocument> & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    })[]>;
    getClassDetails(classId: string, trainerId: string): Promise<import("mongoose").FlattenMaps<ClassDocument> & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    }>;
    getClassStudents(classId: string, trainerId: string): Promise<(import("mongoose").FlattenMaps<UserDocument> & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    })[]>;
    preEnrollStudent(classId: string, trainerId: string, dto: PreEnrollStudentDto): Promise<{
        message: string;
        studentId: string;
        activationOtp?: undefined;
    } | {
        message: string;
        studentId: string;
        activationOtp: string;
    }>;
}
