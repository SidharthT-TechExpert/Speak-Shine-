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
exports.JwtStrategy = void 0;
const common_1 = require("@nestjs/common");
const passport_1 = require("@nestjs/passport");
const passport_jwt_1 = require("passport-jwt");
const config_1 = require("@nestjs/config");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const user_schema_1 = require("../../database/schemas/user.schema");
const trainer_profile_schema_1 = require("../../database/schemas/trainer-profile.schema");
const shared_types_1 = require("@speak-shine/shared-types");
let JwtStrategy = class JwtStrategy extends (0, passport_1.PassportStrategy)(passport_jwt_1.Strategy) {
    constructor(configService, userModel, trainerProfileModel) {
        super({
            jwtFromRequest: passport_jwt_1.ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: configService.get('JWT_SECRET') ||
                'speak-shine-v2-production-super-secret-key-32chars',
        });
        this.configService = configService;
        this.userModel = userModel;
        this.trainerProfileModel = trainerProfileModel;
    }
    async validate(payload) {
        const user = await this.userModel.findById(payload.sub).lean();
        if (!user || !user.isActive) {
            throw new common_1.UnauthorizedException('User account is deactivated or invalid');
        }
        let trainerApprovalStatus = undefined;
        if (user.role === shared_types_1.Role.TRAINER) {
            const trainerProfile = await this.trainerProfileModel
                .findOne({ userId: user._id })
                .lean();
            trainerApprovalStatus = trainerProfile?.approvalStatus;
        }
        return {
            userId: user._id.toString(),
            email: user.email,
            role: user.role,
            classId: user.classId?.toString(),
            trainerApprovalStatus,
        };
    }
};
exports.JwtStrategy = JwtStrategy;
exports.JwtStrategy = JwtStrategy = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, mongoose_1.InjectModel)(user_schema_1.User.name)),
    __param(2, (0, mongoose_1.InjectModel)(trainer_profile_schema_1.TrainerProfile.name)),
    __metadata("design:paramtypes", [config_1.ConfigService,
        mongoose_2.Model,
        mongoose_2.Model])
], JwtStrategy);
//# sourceMappingURL=jwt.strategy.js.map