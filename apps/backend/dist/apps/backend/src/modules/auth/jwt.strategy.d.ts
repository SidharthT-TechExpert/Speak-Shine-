import { Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import { UserDocument } from '../../database/schemas/user.schema';
import { TrainerProfileDocument } from '../../database/schemas/trainer-profile.schema';
import { Role } from '@speak-shine/shared-types';
export interface JwtPayload {
    sub: string;
    email: string;
    role: Role;
    classId?: string;
}
declare const JwtStrategy_base: new (...args: any[]) => Strategy;
export declare class JwtStrategy extends JwtStrategy_base {
    private configService;
    private userModel;
    private trainerProfileModel;
    constructor(configService: ConfigService, userModel: Model<UserDocument>, trainerProfileModel: Model<TrainerProfileDocument>);
    validate(payload: JwtPayload): Promise<{
        userId: string;
        email: string;
        role: Role;
        classId: string | undefined;
        trainerApprovalStatus: string | undefined;
    }>;
}
export {};
