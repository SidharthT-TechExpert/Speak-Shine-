import { TaskType } from '@speak-shine/shared-types';
export declare class CreateTaskDto {
    classId: string;
    title: string;
    description: string;
    type: TaskType;
    vocabularyChallengeWords?: string[];
    referenceImageUrl?: string;
    storyPrompt?: string;
    minDurationSeconds?: number;
    maxDurationSeconds?: number;
    prizePool?: number;
    dueDate: string;
}
