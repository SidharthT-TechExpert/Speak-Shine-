export interface AuthenticatedUser {
    userId: string;
    email: string;
    role: string;
    classId?: string;
    trainerApprovalStatus?: string;
}
export declare const CurrentUser: (...dataOrPipes: (keyof AuthenticatedUser | import("@nestjs/common").PipeTransform<any, any> | import("@nestjs/common").Type<import("@nestjs/common").PipeTransform<any, any>> | undefined)[]) => ParameterDecorator;
