import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class QuestionGeneratorService {
  private readonly logger = new Logger(QuestionGeneratorService.name);
  private groqApiKey: string | null = null;

  constructor(private configService: ConfigService) {
    this.groqApiKey = this.configService.get<string>('GROQ_API_KEY') || null;
  }

  generateFallbackQuestions(): { title: string; description: string; words: string[] }[] {
    return [
      {
        title: 'Overcoming Unforeseen Roadblocks',
        description: 'Describe a moment when unexpected circumstances challenged your plans and how you demonstrated resilience.',
        words: ['resilience', 'endeavor', 'patience', 'adaptability', 'perseverance'],
      },
      {
        title: 'The Evolution of Modern Communication',
        description: 'Share your perspective on how digital platforms have transformed human relationships and empathy.',
        words: ['articulate', 'empathy', 'connectivity', 'nuance', 'perspective'],
      },
      {
        title: 'Mastering Personal Discipline and Habits',
        description: 'Discuss the daily habits that anchor your focus and enable continuous self-improvement.',
        words: ['meticulous', 'serenity', 'consistency', 'discipline', 'trajectory'],
      },
    ];
  }
}
