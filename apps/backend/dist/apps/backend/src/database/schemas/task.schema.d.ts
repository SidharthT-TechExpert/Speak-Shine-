import { Document, Types } from 'mongoose';
import { TaskType } from '@speak-shine/shared-types';
export type TaskDocument = Task & Document;
export declare class Task {
    classId: Types.ObjectId;
    trainerId: Types.ObjectId;
    title: string;
    description: string;
    type: TaskType;
    vocabularyChallengeWords: string[];
    referenceImageUrl?: string;
    storyPrompt?: string;
    minDurationSeconds: number;
    maxDurationSeconds: number;
    prizePool: number;
    dueDate: Date;
}
export declare const TaskSchema: import("mongoose").Schema<Task, import("mongoose").Model<Task, any, any, any, Document<unknown, any, Task, any, {}> & Task & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Task, Document<unknown, {}, import("mongoose").FlatRecord<Task>, {}, import("mongoose").DefaultSchemaOptions> & import("mongoose").FlatRecord<Task> & {
    _id: Types.ObjectId;
} & {
    __v: number;
}>;
