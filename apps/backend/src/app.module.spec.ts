import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './app.module';

describe('AppModule Bootstrap & Dependency Injection', () => {
  let appModule: TestingModule;

  beforeAll(async () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/speak-shine-test';
    process.env.JWT_SECRET = 'test-secret-key-super-secure-32chars';

    appModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
  });

  afterAll(async () => {
    if (appModule) {
      await appModule.close();
    }
  });

  it('should compile the application module without circular dependencies', () => {
    expect(appModule).toBeDefined();
  });
});
