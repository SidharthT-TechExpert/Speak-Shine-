"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const database_module_1 = require("./database/database.module");
const auth_module_1 = require("./modules/auth/auth.module");
const classes_module_1 = require("./modules/classes/classes.module");
const admin_module_1 = require("./modules/admin/admin.module");
const students_module_1 = require("./modules/students/students.module");
const tasks_module_1 = require("./modules/tasks/tasks.module");
const videos_module_1 = require("./modules/videos/videos.module");
const wallet_module_1 = require("./modules/wallet/wallet.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                envFilePath: ['.env.local', '.env'],
            }),
            database_module_1.DatabaseModule,
            auth_module_1.AuthModule,
            classes_module_1.ClassesModule,
            admin_module_1.AdminModule,
            students_module_1.StudentsModule,
            tasks_module_1.TasksModule,
            videos_module_1.VideosModule,
            wallet_module_1.WalletModule,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map