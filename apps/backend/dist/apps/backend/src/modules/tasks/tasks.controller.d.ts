import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
export declare class TasksController {
    private readonly tasksService;
    constructor(tasksService: TasksService);
    createTask(trainerId: string, dto: CreateTaskDto): Promise<import("mongoose").Document<unknown, {}, import("../../database/schemas/task.schema").TaskDocument, {}, {}> & import("../../database/schemas/task.schema").Task & import("mongoose").Document<import("mongoose").Types.ObjectId, any, any, Record<string, any>, {}> & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    }>;
    getClassTasks(classId: string): Promise<(import("mongoose").FlattenMaps<import("../../database/schemas/task.schema").TaskDocument> & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    })[]>;
    getStudentTasks(studentId: string): Promise<(import("mongoose").FlattenMaps<import("../../database/schemas/task.schema").TaskDocument> & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    })[]>;
    getTaskById(taskId: string): Promise<import("mongoose").FlattenMaps<import("../../database/schemas/task.schema").TaskDocument> & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    }>;
}
