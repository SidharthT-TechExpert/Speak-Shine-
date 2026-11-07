import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './app.module';
import { AuthService } from './modules/auth/auth.service';
import { ClassesService } from './modules/classes/classes.service';
import { AdminService } from './modules/admin/admin.service';
import { StudentsService } from './modules/students/students.service';
import { TasksService } from './modules/tasks/tasks.service';
import { VideosService } from './modules/videos/videos.service';
import { AiAnalysisService } from './modules/videos/ai-analysis.service';
import { WalletService } from './modules/wallet/wallet.service';
import { LiveSessionsService } from './modules/live-sessions/live-sessions.service';
import { HelpTicketsService } from './modules/help-tickets/help-tickets.service';
import { NotificationsService } from './modules/notifications/notifications.service';
import { Role, TrainerApprovalStatus, TaskType } from '@speak-shine/shared-types';

describe('V2 End-to-End Core Workflow Tests', () => {
  let moduleRef: TestingModule;
  let authService: AuthService;
  let classesService: ClassesService;
  let adminService: AdminService;
  let studentsService: StudentsService;
  let tasksService: TasksService;
  let videosService: VideosService;
  let aiAnalysisService: AiAnalysisService;
  let walletService: WalletService;
  let liveSessionsService: LiveSessionsService;
  let helpTicketsService: HelpTicketsService;
  let notificationsService: NotificationsService;

  beforeAll(async () => {
    const dbName = `speak-shine-test-${Date.now()}`;
    process.env.MONGODB_URI = `mongodb://localhost:27017/${dbName}`;
    process.env.JWT_SECRET = 'test-secret-key-32-chars-minimum-length!';

    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    authService = moduleRef.get<AuthService>(AuthService);
    classesService = moduleRef.get<ClassesService>(ClassesService);
    adminService = moduleRef.get<AdminService>(AdminService);
    studentsService = moduleRef.get<StudentsService>(StudentsService);
    tasksService = moduleRef.get<TasksService>(TasksService);
    videosService = moduleRef.get<VideosService>(VideosService);
    aiAnalysisService = moduleRef.get<AiAnalysisService>(AiAnalysisService);
    walletService = moduleRef.get<WalletService>(WalletService);
    liveSessionsService = moduleRef.get<LiveSessionsService>(LiveSessionsService);
    helpTicketsService = moduleRef.get<HelpTicketsService>(HelpTicketsService);
    notificationsService = moduleRef.get<NotificationsService>(NotificationsService);
  });

  afterAll(async () => {
    if (moduleRef) {
      await moduleRef.close();
    }
  });

  it('should resolve and inject all 10 domain services cleanly', () => {
    expect(authService).toBeDefined();
    expect(classesService).toBeDefined();
    expect(adminService).toBeDefined();
    expect(studentsService).toBeDefined();
    expect(tasksService).toBeDefined();
    expect(videosService).toBeDefined();
    expect(aiAnalysisService).toBeDefined();
    expect(walletService).toBeDefined();
    expect(liveSessionsService).toBeDefined();
    expect(helpTicketsService).toBeDefined();
    expect(notificationsService).toBeDefined();
  });

  it('should validate student registration, universal login and JWT generation', async () => {
    const testEmail = `student_${Date.now()}@example.com`;
    const regResult = await authService.registerStudent({
      name: 'Test Student',
      email: testEmail,
      password: 'Password123!',
    });

    expect(regResult).toBeDefined();
    expect(regResult.accessToken).toBeDefined();
    expect(regResult.user.email).toBe(testEmail);
    expect(regResult.user.role).toBe(Role.STUDENT);

    const loginResult = await authService.login({
      identifier: testEmail,
      password: 'Password123!',
    });

    expect(loginResult.accessToken).toBeDefined();
    expect(loginResult.user.id).toBe(regResult.user.id);
  });

  it('should register trainer with PENDING_APPROVAL status', async () => {
    const trainerEmail = `trainer_${Date.now()}@example.com`;
    const regResult = await authService.registerTrainer({
      name: 'Coach Sarah',
      email: trainerEmail,
      phone: `+91${Math.floor(6000000000 + Math.random() * 3999999999)}`,
      password: 'SecureTrainerPassword!',
      qualifications: ['TESOL', 'Toastmasters President'],
    });

    expect(regResult.approvalStatus).toBe(TrainerApprovalStatus.PENDING_APPROVAL);
  });

  it('should create class with auto-generated code and allow student join', async () => {
    const trainerEmail = `trainer_class_${Date.now()}@example.com`;
    const regTrainer = await authService.registerTrainer({
      name: 'Prof. Miller',
      email: trainerEmail,
      phone: `+91${Math.floor(6000000000 + Math.random() * 3999999999)}`,
      password: 'TrainerPassword123!',
      qualifications: ['Speech Pathologist'],
    });

    // Create class
    const cls = await classesService.createClass(regTrainer.trainerId, {
      title: 'V2 Fluency Masterclass',
      description: 'Intensive communication program',
    });

    expect(cls).toBeDefined();
    expect(cls.classCode).toMatch(/^SHINE-\d{4}$/);

    // Register a student and join
    const studentEmail = `student_join_${Date.now()}@example.com`;
    const regStudent = await authService.registerStudent({
      name: 'Joiner Student',
      email: studentEmail,
      password: 'Password123!',
    });

    const joinResult = await studentsService.joinClass(regStudent.user.id, {
      classCode: cls.classCode,
    });

    expect(joinResult.classId).toBe(cls._id.toString());

    // Verify student progress endpoint
    const progress = await studentsService.getMyProgress(regStudent.user.id);
    expect(progress.streak).toBe(0);
    expect(progress.streakFreeze).toBe(0);
  });

  it('should reject task creation with past due dates', async () => {
    const dummyTrainerId = '662b1a2c3d4e5f6a7b8c9d0e';
    await expect(
      tasksService.createTask(dummyTrainerId, {
        classId: dummyTrainerId,
        title: 'Expired Task',
        description: 'Should fail immediately',
        type: TaskType.DAILY,
        dueDate: '2020-01-01T00:00:00.000Z',
      }),
    ).rejects.toThrow();
  });
});
