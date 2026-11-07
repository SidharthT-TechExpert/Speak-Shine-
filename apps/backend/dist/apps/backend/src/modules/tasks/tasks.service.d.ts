import { Model, Types } from 'mongoose';
import { Task, TaskDocument } from '../../database/schemas/task.schema';
import { ClassDocument } from '../../database/schemas/class.schema';
import { UserDocument } from '../../database/schemas/user.schema';
import { CreateTaskDto } from './dto/create-task.dto';
export declare class TasksService {
    private taskModel;
    private classModel;
    private userModel;
    constructor(taskModel: Model<TaskDocument>, classModel: Model<ClassDocument>, userModel: Model<UserDocument>);
    createTask(trainerId: string, dto: CreateTaskDto): Promise<import("mongoose").Document<unknown, {}, TaskDocument, {}, {}> & Task & import("mongoose").Document<Types.ObjectId, any, any, Record<string, any>, {}> & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    }>;
    getClassTasks(classId: string): Promise<(import("mongoose").FlattenMaps<TaskDocument> & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    })[]>;
    getStudentTasks(studentId: string): Promise<(import("mongoose").FlattenMaps<TaskDocument> & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    })[]>;
    getTaskById(taskId: string): Promise<import("mongoose").FlattenMaps<TaskDocument> & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    }>;
}
