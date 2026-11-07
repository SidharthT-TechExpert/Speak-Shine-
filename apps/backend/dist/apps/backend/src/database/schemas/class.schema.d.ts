import { Document, Types } from 'mongoose';
import { ClassStatus } from '@speak-shine/shared-types';
export type ClassDocument = Class & Document;
export declare class Class {
    title: string;
    description?: string;
    classCode: string;
    trainerId: Types.ObjectId;
    status: ClassStatus;
    studentCount: number;
    startDate?: Date;
    endDate?: Date;
}
export declare const ClassSchema: import("mongoose").Schema<Class, import("mongoose").Model<Class, any, any, any, Document<unknown, any, Class, any, {}> & Class & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Class, Document<unknown, {}, import("mongoose").FlatRecord<Class>, {}, import("mongoose").DefaultSchemaOptions> & import("mongoose").FlatRecord<Class> & {
    _id: Types.ObjectId;
} & {
    __v: number;
}>;
