import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './app.module';
import { AuthService } from './modules/auth/auth.service';
import { ClassesService } from './modules/classes/classes.service';
import { AdminService } from './modules/admin/admin.service';
import { StudentsService } from './modules/students/students.service';
import { WalletService } from './modules/wallet/wallet.service';
import { LiveSessionsService } from './modules/live-sessions/live-sessions.service';
import { Role, TrainerApprovalStatus } from '@speak-shine/shared-types';

describe('V2 End-to-End Core Workflow Tests', () => {
  let moduleRef: TestingModule;
  let authService: AuthService;
  let classesService: ClassesService;
  let adminService: AdminService;
  let studentsService: StudentsService;
  let walletService: WalletService;
  let liveSessionsService: LiveSessionsService;

  beforeAll(async () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/speak-shine-test-workflows';
    process.env.JWT_SECRET = 'test-secret-key-32-chars-minimum-length!';

    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    authService = moduleRef.get<AuthService>(AuthService);
    classesService = moduleRef.get<ClassesService>(ClassesService);
    adminService = moduleRef.get<AdminService>(AdminService);
    studentsService = moduleRef.get<StudentsService>(StudentsService);
    walletService = moduleRef.get<WalletService>(WalletService);
    liveSessionsService = moduleRef.get<LiveSessionsService>(LiveSessionsService);
  });

  afterAll(async () => {
    if (moduleRef) {
      await moduleRef.close();
    }
  });

  it('should have all services properly injected', () => {
    expect(authService).toBeDefined();
    expect(classesService).toBeDefined();
    expect(adminService).toBeDefined();
    expect(studentsService).toBeDefined();
    expect(walletService).toBeDefined();
    expect(liveSessionsService).toBeDefined();
  });
});
