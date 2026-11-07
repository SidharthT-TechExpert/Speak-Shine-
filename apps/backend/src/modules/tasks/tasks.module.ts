import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { QuestionGeneratorService } from './question-generator.service';

@Module({
  controllers: [TasksController],
  providers: [TasksService, QuestionGeneratorService],
  exports: [TasksService, QuestionGeneratorService],
})
export class TasksModule {}
