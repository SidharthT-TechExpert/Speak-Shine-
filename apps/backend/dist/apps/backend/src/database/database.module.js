"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const config_1 = require("@nestjs/config");
const user_schema_1 = require("./schemas/user.schema");
const trainer_profile_schema_1 = require("./schemas/trainer-profile.schema");
const class_schema_1 = require("./schemas/class.schema");
const task_schema_1 = require("./schemas/task.schema");
const video_report_schema_1 = require("./schemas/video-report.schema");
const wallet_transaction_schema_1 = require("./schemas/wallet-transaction.schema");
const live_session_schema_1 = require("./schemas/live-session.schema");
const help_ticket_schema_1 = require("./schemas/help-ticket.schema");
const notification_schema_1 = require("./schemas/notification.schema");
const SCHEMAS = [
    { name: user_schema_1.User.name, schema: user_schema_1.UserSchema },
    { name: trainer_profile_schema_1.TrainerProfile.name, schema: trainer_profile_schema_1.TrainerProfileSchema },
    { name: class_schema_1.Class.name, schema: class_schema_1.ClassSchema },
    { name: task_schema_1.Task.name, schema: task_schema_1.TaskSchema },
    { name: video_report_schema_1.VideoReport.name, schema: video_report_schema_1.VideoReportSchema },
    { name: wallet_transaction_schema_1.WalletTransaction.name, schema: wallet_transaction_schema_1.WalletTransactionSchema },
    { name: live_session_schema_1.LiveSession.name, schema: live_session_schema_1.LiveSessionSchema },
    { name: help_ticket_schema_1.HelpTicket.name, schema: help_ticket_schema_1.HelpTicketSchema },
    { name: notification_schema_1.Notification.name, schema: notification_schema_1.NotificationSchema },
];
let DatabaseModule = class DatabaseModule {
};
exports.DatabaseModule = DatabaseModule;
exports.DatabaseModule = DatabaseModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [
            mongoose_1.MongooseModule.forRootAsync({
                imports: [config_1.ConfigModule],
                inject: [config_1.ConfigService],
                useFactory: (configService) => ({
                    uri: configService.get('MONGODB_URI') ||
                        'mongodb://localhost:27017/speak-shine',
                }),
            }),
            mongoose_1.MongooseModule.forFeature(SCHEMAS),
        ],
        exports: [mongoose_1.MongooseModule],
    })
], DatabaseModule);
//# sourceMappingURL=database.module.js.map