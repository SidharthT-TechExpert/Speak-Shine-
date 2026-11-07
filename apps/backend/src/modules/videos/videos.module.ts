import { Module } from '@nestjs/common';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';
import { AiAnalysisService } from './ai-analysis.service';
import { GrammarCheckService } from './grammar-check.service';

@Module({
  controllers: [VideosController],
  providers: [VideosService, AiAnalysisService, GrammarCheckService],
  exports: [VideosService, AiAnalysisService, GrammarCheckService],
})
export class VideosModule {}
