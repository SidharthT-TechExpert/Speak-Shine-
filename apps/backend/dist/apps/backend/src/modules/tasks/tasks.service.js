"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TasksService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const task_schema_1 = require("../../database/schemas/task.schema");
const class_schema_1 = require("../../database/schemas/class.schema");
const user_schema_1 = require("../../database/schemas/user.schema");
let TasksService = class TasksService {
    constructor(taskModel, classModel, userModel) {
        this.taskModel = taskModel;
        this.classModel = classModel;
        this.userModel = userModel;
    }
    async createTask(trainerId, dto) {
        const cls = await this.classModel.findById(dto.classId);
        if (!cls) {
            throw new common_1.NotFoundException('Class not found');
        }
        if (cls.trainerId.toString() !== trainerId) {
            throw new common_1.ForbiddenException('You can only create tasks for classes you own');
        }
        const task = await this.taskModel.create({
            classId: cls._id,
            trainerId: new mongoose_2.Types.ObjectId(trainerId),
            title: dto.title.trim(),
            description: dto.description.trim(),
            type: dto.type,
            vocabularyChallengeWords: dto.vocabularyChallengeWords || [],
            referenceImageUrl: dto.referenceImageUrl || null,
            storyPrompt: dto.storyPrompt || null,
            minDurationSeconds: dto.minDurationSeconds || 30,
            maxDurationSeconds: dto.maxDurationSeconds || 120,
            prizePool: dto.prizePool || 0,
            dueDate: new Date(dto.dueDate),
        });
        return task;
    }
    async getClassTasks(classId) {
        return this.taskModel
            .find({ classId: new mongoose_2.Types.ObjectId(classId) })
            .sort({ dueDate: -1 })
            .lean();
    }
    async getStudentTasks(studentId) {
        const student = await this.userModel.findById(studentId).lean();
        if (!student || !student.classId) {
            return [];
        }
        return this.taskModel
            .find({ classId: student.classId })
            .sort({ dueDate: 1 })
            .lean();
    }
    async getTaskById(taskId) {
        const task = await this.taskModel.findById(taskId).lean();
        if (!task) {
            throw new common_1.NotFoundException('Task not found');
        }
        return task;
    }
};
exports.TasksService = TasksService;
exports.TasksService = TasksService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(task_schema_1.Task.name)),
    __param(1, (0, mongoose_1.InjectModel)(class_schema_1.Class.name)),
    __param(2, (0, mongoose_1.InjectModel)(user_schema_1.User.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model])
], TasksService);
//# sourceMappingURL=tasks.service.js.map